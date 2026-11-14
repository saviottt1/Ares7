import { describe, expect, it } from 'vitest'
import { CAMPAIGN, randomizedMission } from '../src/sim/scenarios'
import {
  cumulativeDoseStatus,
  dailyDoseStatus,
  doseFor,
  executeSol,
  INITIAL_STATE,
  missionStars,
  planBudget,
  stockStatus,
  type Allocation,
  type MissionState,
} from '../src/sim/engine'

const PLANS: Record<string, Allocation[]> = {
  EVEN: [[30, 30, 30], [30, 30, 30], [25, 25, 25], [30, 30, 30], [20, 20, 20], [30, 30, 30], [30, 30, 30]].map(([shield, bio, hab]) => ({ shield, bio, hab })),
  HEUR: [[20, 40, 40], [25, 40, 35], [20, 30, 25], [20, 40, 35], [15, 25, 25], [45, 30, 25], [25, 35, 30]].map(([shield, bio, hab]) => ({ shield, bio, hab })),
  NOSHIELD: Array.from({ length: 7 }, () => ({ shield: 0, bio: 40, hab: 40 })),
  SHARP: [[10, 40, 55], [45, 40, 20], [0, 35, 40], [0, 40, 60], [5, 50, 10], [35, 60, 20], [25, 10, 55]].map(([shield, bio, hab]) => ({ shield, bio, hab })),
}
const EXPECTED = {
  EVEN: [25, 42, 6, 4.62, 1],
  HEUR: [61.25, 62, 60.43, 4.50, 2],
  NOSHIELD: [100, 80, 40.26, 11.71, 1],
  SHARP: [87.75, 77.75, 77.04, 5.30, 3],
} as const

function play(plan: Allocation[]): MissionState {
  return plan.reduce((state, allocation, index) => executeSol(state, CAMPAIGN[index], allocation).state, { ...INITIAL_STATE })
}

describe('ARES-7 campaign engine', () => {
  it('starts from the exact PDF state and keeps a seven-Sol schedule', () => {
    expect(INITIAL_STATE).toEqual({ o2Water: 85, food: 80, crewHealth: 90, cumRad: 0, battery: 30, replays: 2 })
    expect(CAMPAIGN.map(item => item.supply)).toEqual([100, 100, 75, 95, 65, 100, 90])
    expect(CAMPAIGN.map(item => item.sep)).toEqual([1, 3.8, 1, 1, 1, 7.5, 3])
  })

  it.each(Object.keys(PLANS))('matches PDF reference plan %s within 0.1', key => {
    const final = play(PLANS[key])
    const expected = EXPECTED[key as keyof typeof EXPECTED]
    // The PDF rounds the EVEN table's stocks to whole numbers; this is the exact B3 state.
    const output = key === 'EVEN' ? [Math.round(final.o2Water), Math.round(final.food), Math.round(final.crewHealth)] : [final.o2Water, final.food, final.crewHealth]
    expect(Math.abs(output[0] - expected[0])).toBeLessThanOrEqual(0.1)
    expect(Math.abs(output[1] - expected[1])).toBeLessThanOrEqual(0.1)
    expect(Math.abs(output[2] - expected[2])).toBeLessThanOrEqual(0.1)
    if (key === 'EVEN') {
      expect(final.o2Water).toBeCloseTo(25.25, 2)
      expect(final.food).toBeCloseTo(41.75, 2)
      expect(final.crewHealth).toBeCloseTo(6.48, 2)
    }
    expect(final.cumRad).toBeCloseTo(expected[3], 1)
    expect(missionStars(final)).toBe(expected[4])
  })

  it('matches the PDF radiation calculations and Sol 4 pollination bonus', () => {
    expect(doseFor(7.5, 50)).toBeCloseTo(0.97, 2)
    expect(doseFor(3.8, 25)).toBeCloseTo(1.09, 2)
    const pollination = executeSol(INITIAL_STATE, CAMPAIGN[3], { shield: 20, bio: 40, hab: 35 })
    expect(pollination.trace.find(step => step.key === 'bioBonus')?.result).toBe(9)
  })

  it('applies exact status thresholds including each inclusive boundary', () => {
    expect(stockStatus(60)).toBe('NOMINAL')
    expect(stockStatus(59.99)).toBe('STRAINED')
    expect(stockStatus(40)).toBe('STRAINED')
    expect(stockStatus(39.99)).toBe('CRITICAL')
    expect(dailyDoseStatus(0.7)).toBe('NOMINAL')
    expect(dailyDoseStatus(0.71)).toBe('STRAINED')
    expect(dailyDoseStatus(1.1)).toBe('STRAINED')
    expect(dailyDoseStatus(1.1001)).toBe('CRITICAL')
    expect(cumulativeDoseStatus(4.5)).toBe('NOMINAL')
    expect(cumulativeDoseStatus(4.5001)).toBe('STRAINED')
    expect(cumulativeDoseStatus(6.5)).toBe('STRAINED')
    expect(cumulativeDoseStatus(6.5001)).toBe('CRITICAL')
  })

  it('rejects increments outside 5 kW and power plans beyond the remaining battery', () => {
    expect(planBudget(INITIAL_STATE, CAMPAIGN[0], { shield: 10, bio: 12, hab: 30 }).legal).toBe(false)
    expect(planBudget({ ...INITIAL_STATE, battery: 0 }, CAMPAIGN[4], { shield: 25, bio: 25, hab: 25 }).legal).toBe(false)
    const spareBattery = planBudget(INITIAL_STATE, CAMPAIGN[4], { shield: 25, bio: 25, hab: 25 })
    expect(spareBattery).toMatchObject({ total: 75, available: 65, batteryDraw: 10, legal: true })
  })

  it('applies the low-health supply reduction and returns a full ordered trace', () => {
    const plan = planBudget({ ...INITIAL_STATE, crewHealth: 60 }, CAMPAIGN[0], { shield: 30, bio: 40, hab: 40 })
    expect(plan.available).toBe(90)
    const result = executeSol(INITIAL_STATE, CAMPAIGN[0], { shield: 30, bio: 40, hab: 40 })
    expect(result.trace.map(step => step.key)).toEqual(['power', 'dose', 'cumRad', 'food', 'bioBonus', 'o2Water', 'penalties', 'crewHealth', 'battery'])
    expect(result.trace.every(step => step.formula && step.provenance)).toBe(true)
  })

  it('recreates identical seeded practice weather while keeping the base campaign fixed', () => {
    const first = randomizedMission(123456, 'jezero')
    expect(randomizedMission(123456, 'jezero')).toEqual(first)
    expect(first).toHaveLength(7)
    expect(first.some(item => item.supply <= 75)).toBe(true)
    expect(first.some(item => item.sep >= 3.8)).toBe(true)
    expect(CAMPAIGN.map(item => item.supply)).toEqual([100, 100, 75, 95, 65, 100, 90])
  })
})
