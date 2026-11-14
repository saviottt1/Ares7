import './styles/main.css'
import { NASA_DATA } from './data/nasaData'
import { CAMPAIGN, randomizedMission, type Scenario, type SiteKey } from './sim/scenarios'
import { INITIAL_STATE, executeSol, missionEnded, missionStars, planBudget, type Allocation, type MissionState, type SolResult } from './sim/engine'
import { hashSeed } from './sim/rng'
import { OutpostScene, type StationKey } from './scene/Scene'
import { Ui, type MissionView } from './ui/ui'
import { MissionHistory } from './ui/missionHistory'
import { Leaderboard } from './ui/leaderboard'
import { NasaDashboard } from './ui/nasaDashboard'
import { outpostTuning } from './game/outpostTuning'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Missing game root')
const INITIAL_SEED = 'ARES7-1'
const DEFAULT_PLANS: Allocation[] = [
  { shield: 20, bio: 40, hab: 40 }, { shield: 25, bio: 40, hab: 35 }, { shield: 20, bio: 30, hab: 25 },
  { shield: 20, bio: 40, hab: 35 }, { shield: 15, bio: 25, hab: 25 }, { shield: 45, bio: 30, hab: 25 }, { shield: 25, bio: 35, hab: 30 },
]
const safeRead = (key: string): string | null => { try { return localStorage.getItem(key) } catch { return null } }
const safeWrite = (key: string, value: string): void => { try { localStorage.setItem(key, value) } catch { /* Keep the active run usable if storage is blocked. */ } }
const snap = (state: MissionState): MissionState => ({ ...state })

let phase: MissionView['phase'] = 'intro'
let mode: MissionView['mode'] = 'cadet'
let view: MissionView['view'] = 'outpost'
let webgl = false
let practice = false
let solIndex = 0
let state: MissionState = snap(INITIAL_STATE)
let allocation: Allocation = { ...DEFAULT_PLANS[0] }
let scenarios: Scenario[] = CAMPAIGN.map(s => ({ ...s }))
let results: SolResult[] = []
let currentResult: SolResult | undefined
let solSnapshot: MissionState = snap(INITIAL_STATE)
let selected: StationKey = 'shield'
let site: SiteKey = 'jezero'
let crop = 'Dwarf Wheat'
let seed = INITIAL_SEED
let bestStars = Math.max(0, Math.min(3, Number(safeRead('redline.bestStars') ?? 0) || 0))
let hintsUsed = 0
let replaysUsed = 0
let liveLabel = 'Using saved NASA data'
let feedback: string | undefined
let syncing = false
let demoActive = false
let demoSeconds = 0
let demoTimer = 0
let demoSteps: number[] = []
let scene: OutpostScene | undefined
let ui: Ui
const keysDown = new Set<string>()
const currentScenario = () => scenarios[solIndex]
const model = (): MissionView => ({ phase, mode, view, webgl, practice, solIndex, scenario: currentScenario(), allocation, state, result: currentResult, results, site, crop, seed, selected, hintsUsed, replaysUsed, bestStars, liveLabel, feedback, demoActive, demoSeconds, syncing })
const refreshScene = (): void => { scene?.setState(allocation, state.food, selected, state.battery, currentScenario().dust) }
const render = (): void => { refreshScene(); ui.render(model()); if (webgl && view === 'outpost') scene?.render() }
const clampPower = (v: number) => Math.max(0, Math.min(70, Math.round(v / 5) * 5))
const defaultPlan = (sol: number) => ({ ...DEFAULT_PLANS[sol] })

function stopDemo(showMessage = true): void {
  if (demoTimer) window.clearInterval(demoTimer)
  demoSteps.forEach(timer => window.clearTimeout(timer))
  demoSteps = []
  demoTimer = 0
  demoActive = false
  demoSeconds = 0
  if (showMessage && phase !== 'intro' && phase !== 'results') feedback = 'Judge demo ended. You can continue the current mission.'
  if (ui) render()
}

function startMission(nextPractice: boolean, nextSeed: string, nextSite: SiteKey): void {
  stopDemo(false)
  practice = nextPractice
  seed = nextSeed.trim().slice(0, 24) || INITIAL_SEED
  site = nextSite
  scenarios = nextPractice ? randomizedMission(hashSeed(seed), site) : CAMPAIGN.map(s => ({ ...s }))
  solIndex = 0
  state = snap(INITIAL_STATE)
  solSnapshot = snap(state)
  allocation = defaultPlan(0)
  results = []
  currentResult = undefined
  hintsUsed = 0
  replaysUsed = 0
  selected = 'shield'
  phase = 'plan'
  mode = 'cadet'
  liveLabel = 'Using saved NASA data'
  feedback = nextPractice ? `Practice seed ${seed}. Use this seed again to get the same weather deck.` : 'Fixed ARES-7 campaign schedule loaded.'
  render()
}

function executeCurrentSol(): void {
  if (phase !== 'plan') return
  const budget = planBudget(state, currentScenario(), allocation)
  if (!budget.legal) {
    feedback = budget.reason ?? 'Check this power plan.'
    render()
    return
  }
  solSnapshot = snap(state)
  const result = executeSol(state, currentScenario(), allocation)
  state = result.state
  currentResult = result
  results = [...results.slice(0, solIndex), result]
  phase = 'debrief'
  feedback = missionEnded(state) ? 'Engineering debrief: a stock reached zero. Replay this Sol or continue.' : undefined
  render()
}

function continueMission(): void {
  if (phase !== 'debrief') return
  if (solIndex === scenarios.length - 1) {
    phase = 'results'
    const earned = missionStars(state)
    if (!demoActive && earned > bestStars) {
      bestStars = earned
      safeWrite('redline.bestStars', String(bestStars))
      feedback = 'New best mission rating.'
    }
    render()
    return
  }
  solIndex += 1
  phase = 'plan'
  currentResult = undefined
  solSnapshot = snap(state)
  allocation = defaultPlan(solIndex)
  selected = 'shield'
  feedback = undefined
  render()
}

function replayCurrentSol(): void {
  if (phase !== 'debrief' || !currentResult || state.replays <= 0) return
  state = { ...solSnapshot, replays: solSnapshot.replays - 1 }
  results = results.slice(0, solIndex)
  currentResult = undefined
  phase = 'plan'
  replaysUsed += 1
  feedback = 'Replay restored the Sol-start snapshot, including the battery.'
  render()
}

function applyAllocation(key: StationKey, delta: -5 | 5): void {
  selected = key
  allocation = { ...allocation, [key]: clampPower(allocation[key] + delta) }
  feedback = undefined
  render()
}

function startJudgeDemo(): void {
  stopDemo(false)
  practice = false
  scenarios = CAMPAIGN.map(s => ({ ...s }))
  site = 'jezero'
  seed = 'ARES7-JUDGE'
  solIndex = 5
  state = snap(INITIAL_STATE)
  solSnapshot = snap(state)
  allocation = { shield: 50, bio: 30, hab: 20 }
  selected = 'shield'
  results = []
  currentResult = undefined
  hintsUsed = 0
  replaysUsed = 0
  mode = 'judge'
  phase = 'plan'
  demoActive = true
  demoSeconds = 60
  liveLabel = 'Using saved NASA data · demo'
  feedback = 'Judge demo: flare event, full solar supply, and event ID pending verification.'
  render()
  const deadline = performance.now() + 60_000
  demoTimer = window.setInterval(() => {
    demoSeconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
    if (demoSeconds <= 0) stopDemo(false)
    else render()
  }, 1000)
  demoSteps.push(window.setTimeout(() => {
    if (!demoActive) return
    feedback = 'Follow the trace to see how one station changes several systems.'
    executeCurrentSol()
  }, 4_000))
  demoSteps.push(window.setTimeout(() => {
    if (!demoActive) return
    ui.openModal('measured')
  }, 8_000))
  demoSteps.push(window.setTimeout(() => {
    if (!demoActive) return
    const modal = root!.querySelector<HTMLDialogElement>('#info-dialog')
    if (modal?.open) modal.close()
    continueMission()
    feedback = 'Demo: the final Sol is ready. Follow the power plan and remaining mission dose.'
    render()
  }, 12_000))
  demoSteps.push(window.setTimeout(() => {
    if (!demoActive) return
    executeCurrentSol()
  }, 20_000))
  demoSteps.push(window.setTimeout(() => {
    if (!demoActive) return
    continueMission()
    feedback = 'Demo complete. Review the mission report; your saved best stars were not changed.'
    render()
  }, 28_000))
}

function coachHint(): void {
  if (phase !== 'plan') return
  hintsUsed += 1
  feedback = 'Coach hint used. It appears in your report.'
  render()
}

async function syncDonki(): Promise<void> {
  if (!practice || mode !== 'judge') return
  syncing = true
  liveLabel = 'Syncing NASA DONKI…'
  render()
  try {
    const endDate = new Date()
    const start = new Date(endDate.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
    const end = endDate.toISOString().slice(0, 10)
    const apiKey = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY'
    const url = `https://api.nasa.gov/DONKI/FLR?startDate=${start}&endDate=${end}&api_key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`DONKI response ${response.status}`)
    const rows = await response.json() as Array<{ flrID?: string; classType?: string; beginTime?: string }>
    const flare = rows.filter(row => row.flrID && row.classType && row.beginTime).sort((a, b) => String(b.beginTime).localeCompare(String(a.beginTime)))[0]
    if (!flare?.flrID || !flare.classType || !flare.beginTime) throw new Error('No recent DONKI flare')
    const magnitude = Number(flare.classType.match(/^[ABCMX](\d+(?:\.\d+)?)/i)?.[1] ?? 0)
    const letter = flare.classType[0]?.toUpperCase()
    // This is a game bucket only. X-ray class does not imply a measured proton dose.
    const sep = letter === 'X' ? (magnitude >= 9 ? 9.5 : magnitude >= 5 ? 7.5 : magnitude >= 1 ? 5.0 : 1) : letter === 'M' && magnitude >= 5 ? 3.8 : 1
    const last = scenarios[6]
    scenarios = [...scenarios.slice(0, 6), { ...last, event: `LIVE • ${flare.classType} flare`, classType: flare.classType, sep, flareKey: 'MOD', flareId: { value: flare.flrID, unit: 'NASA DONKI flrID', provenance: 'REAL NASA MEASUREMENT', source: 'Live CCMC DONKI feed', url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', verified: true }, date: flare.beginTime, teaching: 'Live flare metadata is real; the game SEP bucket and dose are simplified.', dust: last.dust }]
    liveLabel = `LIVE from DONKI · fetched ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`
    feedback = 'Live flare placed on Sol 7 of practice. The fixed campaign did not change.'
  } catch {
    liveLabel = 'Using saved NASA data'
    feedback = 'DONKI was unavailable. The saved offline mission still works.'
  } finally {
    syncing = false
    render()
  }
}


const nasaDashboard = new NasaDashboard(root)
const leaderboard = new Leaderboard(root)
const missionHistory = new MissionHistory(root)

const actions = {
  start: startMission,
  allocation: (next: Allocation) => { allocation = { shield: clampPower(next.shield), bio: clampPower(next.bio), hab: clampPower(next.hab) }; refreshScene(); ui.render(model()) },
  crop: (value: string) => { crop = value; render() },
  site: (value: SiteKey) => { site = value; render() },
  seed: (value: string) => { seed = value.slice(0, 24); render() },
  mode: () => { mode = mode === 'cadet' ? 'judge' : 'cadet'; render() },
  view: () => { if (!webgl) return; view = view === 'simple' ? 'outpost' : 'simple'; render(); syncFrameLoop() },
  select: (key: StationKey) => { selected = key; render(); if (phase === 'plan') root.querySelector<HTMLInputElement>(`[data-allocation="${key}"]`)?.focus() },
  adjust: applyAllocation,
  execute: executeCurrentSol,
  continue: continueMission,
  replay: replayCurrentSol,
  hint: coachHint,
  closeModal: () => { safeWrite('redline.onboardingSeen', '1'); syncFrameLoop() },
  syncDonki,
  demo: () => { demoActive ? stopDemo() : startJudgeDemo() },

openNasaDashboard: () => { void nasaDashboard.open() },
openLeaderboard: () => { void leaderboard.open() },
openHistory: () => { void missionHistory.open() },
}
ui = new Ui(root, actions)
try {
  scene = new OutpostScene(root.querySelector<HTMLCanvasElement>('#scene-canvas')!, key => actions.select(key), applyAllocation)
  webgl = true
  view = 'outpost'
} catch (error) {
  console.warn('WebGL outpost unavailable; continuing in Simple View.', error)
  webgl = false
  view = 'simple'
  feedback = 'Simple View is active. Mission controls still work.'
}
if (import.meta.env.DEV) {
  void import('../scripts/manus-tuning/adapter.js').then(({ registerGameTuning }) => registerGameTuning(outpostTuning)).catch(error => console.warn('Tweak bridge unavailable', error))
}
render()

let animationFrame = 0
let previousFrame = 0
function syncFrameLoop(): void {
  const paused = document.hidden || Boolean(document.querySelector('#info-dialog[open]'))
  if (paused && animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; previousFrame = 0 }
  else if (!paused && !animationFrame) animationFrame = requestAnimationFrame(frame)
}
function frame(time: number): void {
  animationFrame = 0
  if (document.hidden || document.querySelector('#info-dialog[open]')) return
  const delta = previousFrame ? Math.min(0.05, (time - previousFrame) / 1000) : 0
  previousFrame = time
  if (view === 'outpost' && webgl && scene) {
    if (phase === 'plan') scene.step(delta, keysDown)
    scene.setState(allocation, state.food, selected, state.battery, currentScenario().dust)
    scene.render()
  }
  animationFrame = requestAnimationFrame(frame)
}
document.addEventListener('visibilitychange', syncFrameLoop)
document.addEventListener('mission-modal-change', syncFrameLoop)
syncFrameLoop()

function textEntryFocused(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
}
window.addEventListener('keydown', event => {
  const rangeFocused = event.target instanceof HTMLInputElement && event.target.type === 'range'
  const rangeArrow = rangeFocused && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
  if (document.querySelector('#info-dialog[open]') || (textEntryFocused(event.target) && !rangeFocused) || rangeArrow) return
  const movement = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
  if ([...movement, 'Space'].includes(event.code)) event.preventDefault()
  if (movement.includes(event.code)) keysDown.add(event.code)
  if (event.repeat) return
  if (event.code === 'Space') executeCurrentSol()
  if (event.code === 'KeyQ') { if (view === 'outpost' && scene) scene.adjust(-5); else applyAllocation(selected, -5) }
  if (event.code === 'KeyE') { if (view === 'outpost' && scene) scene.adjust(5); else applyAllocation(selected, 5) }
  if (event.code === 'KeyH' && phase === 'plan') { coachHint(); ui.openModal('hint') }
})
window.addEventListener('keyup', event => keysDown.delete(event.code))
window.addEventListener('blur', () => keysDown.clear())

if (safeRead('redline.onboardingSeen') !== '1') ui.openModal('onboarding')

Object.defineProperty(window, '__game', { configurable: false, value: {
  get state() { return { phase, mode, view, webgl, solIndex, allocation: { ...allocation }, resources: { ...state }, stars: missionStars(state), scenario: currentScenario(), trace: currentResult?.trace ?? [] } },
  startCampaign: () => startMission(false, seed, site),
  startPractice: (practiceSeed = INITIAL_SEED) => startMission(true, practiceSeed, site),
  setAllocation: (next: Allocation) => actions.allocation(next),
  execute: executeCurrentSol,
  continue: continueMission,
  replay: replayCurrentSol,
  siteData: (key: SiteKey) => NASA_DATA.sites[key],
} })
