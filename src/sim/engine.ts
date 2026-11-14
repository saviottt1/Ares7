import { NASA_DATA, type Provenance } from '../data/nasaData'
import type { Scenario } from './scenarios'

export type MissionState = {
  o2Water: number
  food: number
  crewHealth: number
  cumRad: number
  battery: number
  replays: number
}
export type Allocation = { shield: number; bio: number; hab: number }
export type StockKey = 'o2Water' | 'food' | 'crewHealth'
export type GaugeStatus = 'NOMINAL' | 'STRAINED' | 'CRITICAL'
export type TraceStep = { key: string; label: string; formula: string; inputs: Record<string, number>; delta: number; result: number; unit: string; provenance: Provenance; status?: GaugeStatus }
export type SolResult = { state: MissionState; allocation: Allocation; total: number; available: number; batteryDraw: number; dose: number; trace: TraceStep[] }

export const INITIAL_STATE: MissionState = { o2Water: 85, food: 80, crewHealth: 90, cumRad: 0, battery: 30, replays: 2 }
export const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value))

export function stockStatus(value: number): GaugeStatus {
  return value >= 60 ? 'NOMINAL' : value >= 40 ? 'STRAINED' : 'CRITICAL'
}
export function dailyDoseStatus(dose: number): GaugeStatus {
  return dose <= 0.7 ? 'NOMINAL' : dose <= 1.1 ? 'STRAINED' : 'CRITICAL'
}
export function cumulativeDoseStatus(dose: number): GaugeStatus {
  return dose <= 4.5 ? 'NOMINAL' : dose <= 6.5 ? 'STRAINED' : 'CRITICAL'
}

export function doseFor(sep: number, shield: number): number {
  return 0.64 * sep * Math.exp(-0.032 * shield)
}

export function planBudget(state: MissionState, scenario: Scenario, allocation: Allocation): { total: number; available: number; batteryDraw: number; legal: boolean; reason?: string } {
  const values = [allocation.shield, allocation.bio, allocation.hab]
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 70 || value % 5 !== 0)) {
    return { total: values.reduce((sum, value) => sum + value, 0), available: 0, batteryDraw: 0, legal: false, reason: 'Each station must use 0–70 kW in 5 kW steps.' }
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  const available = scenario.supply - (state.crewHealth < 65 ? 10 : 0)
  const batteryDraw = Math.max(0, total - available)
  const legal = batteryDraw <= state.battery
  return { total, available, batteryDraw, legal, ...(legal ? {} : { reason: 'This plan needs more battery than remains.' }) }
}

export function executeSol(state: MissionState, scenario: Scenario, allocation: Allocation): SolResult {
  const budget = planBudget(state, scenario, allocation)
  if (!budget.legal) throw new Error(budget.reason ?? 'Illegal power plan')
  const trace: TraceStep[] = []
  const add = (step: TraceStep) => { trace.push(step) }
  add({ key: 'power', label: 'Power routed', formula: 'P_shield + P_bio + P_hab', inputs: { shield: allocation.shield, bio: allocation.bio, hab: allocation.hab, solarSupply: scenario.supply }, delta: budget.total - budget.available, result: budget.total, unit: 'kW', provenance: 'NORMALIZED GAME UNIT' })

  const dose = doseFor(scenario.sep, allocation.shield)
  const afterRadiation = state.cumRad + dose
  add({ key: 'dose', label: 'Daily radiation dose', formula: '0.64 × SEP × exp(−0.032 × P_shield)', inputs: { surfaceReference: NASA_DATA.radiation.marsSurface.value, sep: scenario.sep, shield: allocation.shield }, delta: dose, result: dose, unit: 'mSv/day', provenance: 'SCALED PHYSICS MODEL', status: dailyDoseStatus(dose) })
  add({ key: 'cumRad', label: 'Cumulative dose', formula: 'previous dose + daily dose', inputs: { previous: state.cumRad, daily: dose }, delta: dose, result: afterRadiation, unit: 'mSv', provenance: 'SCALED PHYSICS MODEL', status: cumulativeDoseStatus(afterRadiation) })

  const efficiency = state.crewHealth < 65 ? 0.8 : 1
  const rawFoodDelta = (allocation.bio - 40) * 0.45
  const foodDelta = rawFoodDelta > 0 ? rawFoodDelta * efficiency : rawFoodDelta
  const food = clamp(state.food + foodDelta)
  add({ key: 'food', label: 'Food stock', formula: '(P_bio − 40) × 0.45; positive growth × crew efficiency', inputs: { before: state.food, bio: allocation.bio, efficiency }, delta: food - state.food, result: food, unit: 'game units', provenance: 'NORMALIZED GAME UNIT', status: stockStatus(food) })

  let bonus = food >= 65 && allocation.bio >= 30 ? 6 : -5
  if (scenario.sol === 4 && allocation.bio >= 40 && bonus > 0) bonus *= 1.5
  add({ key: 'bioBonus', label: 'Bio-Dome life-support bonus', formula: 'food ≥ 65 and P_bio ≥ 30 ? +6 : −5; Sol 4 wheat rule applies', inputs: { updatedFood: food, bio: allocation.bio, sol: scenario.sol }, delta: bonus, result: bonus, unit: 'game units', provenance: 'NORMALIZED GAME UNIT' })

  const rawHabDelta = (allocation.hab - 40) * 0.55 + bonus
  const o2Water = clamp(state.o2Water + rawHabDelta)
  add({ key: 'o2Water', label: 'O₂ and water buffer', formula: 'previous + (P_hab − 40) × 0.55 + bonus', inputs: { before: state.o2Water, hab: allocation.hab, bonus }, delta: o2Water - state.o2Water, result: o2Water, unit: 'game units', provenance: 'NORMALIZED GAME UNIT', status: stockStatus(o2Water) })

  const radPenalty = dose > 1.1 ? (dose - 1.1) * 8.5 : 0
  const waterScarcity = o2Water < 55 ? 7 : 0
  const foodScarcity = food < 55 ? 6 : 0
  const scarcity = waterScarcity + foodScarcity
  add({ key: 'penalties', label: 'Health penalties', formula: 'max(0, dose − 1.10) × 8.5; +7 if O₂/water <55; +6 if food <55', inputs: { dose, radPenalty, waterScarcity, foodScarcity }, delta: -(radPenalty + scarcity), result: radPenalty + scarcity, unit: 'game units', provenance: 'NORMALIZED GAME UNIT' })

  const healthDelta = (allocation.hab - 40) * 0.45 - radPenalty - scarcity
  const crewHealth = clamp(state.crewHealth + healthDelta)
  add({ key: 'crewHealth', label: 'Crew readiness', formula: 'previous + (P_hab − 40) × 0.45 − radiation penalty − scarcity', inputs: { before: state.crewHealth, hab: allocation.hab, radPenalty, scarcity }, delta: crewHealth - state.crewHealth, result: crewHealth, unit: 'game units', provenance: 'NORMALIZED GAME UNIT', status: stockStatus(crewHealth) })

  add({ key: 'battery', label: 'Emergency battery', formula: 'previous battery − max(0, total − available)', inputs: { before: state.battery, total: budget.total, available: budget.available }, delta: -budget.batteryDraw, result: state.battery - budget.batteryDraw, unit: 'kW pool', provenance: 'NORMALIZED GAME UNIT' })
  const next: MissionState = { o2Water, food, crewHealth, cumRad: afterRadiation, battery: state.battery - budget.batteryDraw, replays: state.replays }
  return { state: next, allocation: { ...allocation }, total: budget.total, available: budget.available, batteryDraw: budget.batteryDraw, dose, trace }
}

export function missionStars(state: MissionState): 1 | 2 | 3 {
  const all = [state.o2Water, state.food, state.crewHealth]
  if (all.every(v => v >= 65) && state.cumRad <= 5.5) return 3
  if (all.every(v => v >= 50) && state.cumRad <= 6.5) return 2
  return 1
}

export function missionEnded(state: MissionState): boolean {
  return state.o2Water === 0 || state.food === 0 || state.crewHealth === 0
}

export function biomarkerValues(state: MissionState, habBySol: number[], currentHab: number): { bone: number; muscle: number; sleep: number; immune: number } {
  const recent = habBySol.slice(-2).concat(currentHab)
  const avgHab = recent.reduce((sum, value) => sum + value, 0) / recent.length
  return {
    bone: clamp(100 - 2.5 * Math.max(0, 40 - avgHab)),
    muscle: clamp(100 - 2.5 * Math.max(0, 40 - avgHab)),
    sleep: clamp(100 - 2.5 * Math.max(0, 40 - currentHab)),
    immune: clamp(100 - 12 * Math.max(0, state.cumRad - 2.5)),
  }
}
