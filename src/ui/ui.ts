import { NASA_DATA } from '../data/nasaData'
import { SOURCES } from '../data/sources'
import type { Scenario, SiteKey } from '../sim/scenarios'
import { missionStars, planBudget, stockStatus, type Allocation, type MissionState, type SolResult } from '../sim/engine'
import type { StationKey } from '../scene/Scene'

export type ScreenPhase = 'intro' | 'plan' | 'debrief' | 'results'
export type MissionView = {
  phase: ScreenPhase; mode: 'cadet' | 'judge'; view: 'simple' | 'outpost'; webgl: boolean; practice: boolean
  solIndex: number; scenario: Scenario; allocation: Allocation; state: MissionState; result?: SolResult
  results: SolResult[]; site: SiteKey; crop: string; seed: string; selected: StationKey
  hintsUsed: number; replaysUsed: number; bestStars: number; liveLabel: string; feedback?: string
  demoActive: boolean; demoSeconds: number; syncing: boolean
}
export type UiActions = {
  start(practice: boolean, seed: string, site: SiteKey): void
  allocation(next: Allocation): void
  crop(name: string): void
  site(site: SiteKey): void
  seed(seed: string): void
  mode(): void
  view(): void
  select(key: StationKey): void
  adjust(key: StationKey, delta: -5 | 5): void
  execute(): void
  continue(): void
  replay(): void
  hint(): void
  closeModal(): void
  syncDonki(): void
  demo(): void
  openNasaDashboard(): void
  openLeaderboard(): void
  openHistory(): void
  openResearch(): void
}

const P = {
  real: '<span class="prov real" title="Source-measured data, as cited in ARES-7 v3">REAL NASA MEASUREMENT</span>',
  model: '<span class="prov model" title="Simplified explanatory model from ARES-7 v3">SCALED PHYSICS MODEL</span>',
  game: '<span class="prov game" title="Normalized gameplay value from ARES-7 v3">NORMALIZED GAME UNIT</span>',
}
const escapeHTML = (v: unknown): string => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T => root.querySelector<T>(selector) as T
const statusClass = (value: string) => value.toLowerCase()

export class Ui {
  private dialog: HTMLDialogElement
  private previousFocus: HTMLElement | null = null
  private model?: MissionView
  private speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

  constructor(private root: HTMLElement, private actions: UiActions) {
    root.innerHTML = this.template()
    this.dialog = q(root, '#info-dialog')
    root.addEventListener('click', event => this.onClick(event))
    root.addEventListener('input', event => this.onInput(event))
    root.addEventListener('change', event => this.onChange(event))
    this.dialog.addEventListener('close', () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      this.root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
      this.actions.closeModal()
      this.previousFocus?.focus()
    })
    if (!this.speechSupported) this.root.querySelectorAll<HTMLElement>('[data-action="read-aloud"]').forEach(item => item.hidden = true)
  }

  render(m: MissionView): void {
    this.model = m
    const flareVerified = m.scenario.flareId.verified
    this.root.dataset.phase = m.phase
    this.root.dataset.view = m.view
    this.root.dataset.mode = m.mode
    this.root.classList.toggle('webgl-failed', !m.webgl)
    q(this.root, '#view-toggle-label').textContent = m.webgl ? (m.view === 'simple' ? 'Outpost view' : 'Simple view') : 'Simple View only'
    q(this.root, '#mode-toggle-label').textContent = m.mode === 'cadet' ? 'Judge mode' : 'Cadet mode'
    q(this.root, '#mode-caption').textContent = m.mode === 'cadet' ? 'Cadet words · simple steps' : 'Judge details · trace and provenance'
    q(this.root, '#view-toggle').toggleAttribute('disabled', !m.webgl)
    q(this.root, '#view-toggle').setAttribute('aria-pressed', String(m.view === 'outpost'))
    q(this.root, '#mode-toggle').setAttribute('aria-pressed', String(m.mode === 'judge'))
    q(this.root, '#sol-count').innerHTML = `SOL ${m.solIndex + 1} / 7 ${P.game}`
    q(this.root, '#ticker-event').innerHTML = `${escapeHTML(m.scenario.event)}${m.scenario.event.includes('τ') ? ` ${P.game}` : ''}`
    q(this.root, '#ticker-class').innerHTML = m.scenario.classType === 'None' ? `QUIET BASELINE ${P.game}` : `${escapeHTML(m.scenario.classType)} ${flareVerified ? P.real : '<span class="pending">ID pending confirmation</span>'}`
    q(this.root, '#ticker-supply').innerHTML = `${m.scenario.supply} kW ${P.game}`
    q(this.root, '#ticker-dose-multiplier').innerHTML = `${m.scenario.sep.toFixed(1)}× SEP ${P.model}`
    q(this.root, '#ticker-live').innerHTML = `${escapeHTML(m.liveLabel)}${m.liveLabel.startsWith('LIVE') ? ` ${P.real}` : ''}`
    q(this.root, '#ticker-id').innerHTML = m.scenario.flareKey === 'QUIET' ? 'No flare ID · quiet baseline' : `NASA DONKI flrID: ${escapeHTML(m.scenario.flareId.value ?? 'not listed')}${flareVerified ? ` ${P.real}` : ' <span class="pending">pending DONKI confirmation</span>'}`
    q(this.root, '#ticker-id').classList.toggle('pending', false)
    q(this.root, '#sol-teaching').textContent = m.scenario.teaching
    q<HTMLSelectElement>(this.root, '#site-select').value = m.site
    q<HTMLSelectElement>(this.root, '#crop-select').value = m.crop
    q<HTMLInputElement>(this.root, '#seed-field').value = m.seed
    q(this.root, '#crop-card').textContent = this.cropNote(m.crop)
    q(this.root, '#seed-display').textContent = `${m.practice ? 'PRACTICE' : 'CAMPAIGN'} / SEED ${m.seed}`
    q(this.root, '#mission-panel-intro').hidden = m.phase !== 'intro'
    q(this.root, '#mission-panel-plan').hidden = m.phase !== 'plan'
    q(this.root, '#mission-panel-debrief').hidden = m.phase !== 'debrief'
    q(this.root, '#mission-panel-results').hidden = m.phase !== 'results'
    q(this.root, '#allocation-panel').hidden = m.phase !== 'plan'
    q(this.root, '#resources-panel').hidden = m.phase === 'intro'
    q(this.root, '#plan-heading').innerHTML = `SOL ${m.solIndex + 1} ${P.game}`
    q(this.root, '#sol-instruction').innerHTML = m.mode === 'cadet' ? escapeHTML(`Today: ${m.scenario.teaching}`) : `Supply ${m.scenario.supply} kW ${P.game}. Event: ${escapeHTML(m.scenario.event)}. ${escapeHTML(m.scenario.teaching)}`
    q(this.root, '#weather-note').innerHTML = m.scenario.dust ? `Dust lowers this Sol’s supply. (Game-design event.) ${P.game}` : 'Sunlight is shared by all three stations.'
    q(this.root, '#ticker-live').classList.toggle('live', m.liveLabel.startsWith('LIVE'))
    q(this.root, '#live-donki').hidden = !(m.practice && m.mode === 'judge')
    q<HTMLButtonElement>(this.root, '#live-donki').disabled = m.syncing
    q(this.root, '#live-donki').textContent = m.syncing ? 'Syncing…' : 'Sync NASA DONKI (Practice only)'
    q(this.root, '#mode-toggle').hidden = m.phase === 'results'
    q(this.root, '#outpost-hint').textContent = `Selected: ${this.stationName(m.selected)}. Tap terrain to walk; tap a station to open its controls.`
    q(this.root, '#feedback').textContent = m.feedback ?? ''
    q(this.root, '#demo-button').textContent = m.demoActive ? `End Judge demo · ${m.demoSeconds}s` : '60-sec Judge demo'
    q(this.root, '#demo-button').setAttribute('aria-pressed', String(m.demoActive))
    this.renderSite(m.site)
    this.renderGauges(m.state)
    this.renderAllocation(m)
    this.renderWhy(m)
    this.renderResults(m)
    this.renderBiomarkers(m)
    q(this.root, '#hint-uses').innerHTML = `Hints used: ${m.hintsUsed} ${P.game}`
    q(this.root, '#replay-uses').innerHTML = `Replays used: ${m.replaysUsed} ${P.game}`
    q<HTMLButtonElement>(this.root, '#replay-sol').disabled = m.phase !== 'debrief' || m.state.replays <= 0
    q(this.root, '#replay-sol').setAttribute('aria-label', `Replay this Sol. ${m.state.replays} replay uses left.`)
  }

  openModal(kind: 'sources' | 'measured' | 'teacher' | 'onboarding' | 'hint'): void {
    if (!this.model) return
    this.previousFocus = document.activeElement as HTMLElement
    const titles = { sources: 'Sources & standards', measured: 'NASA data and simplified rules', teacher: 'Teacher & NGSS guide', onboarding: 'Mission briefing', hint: 'Coach hint' }
    q(this.dialog, '#info-title').textContent = titles[kind]
    q(this.dialog, '#info-body').innerHTML = kind === 'sources' ? this.sourcesContent() : kind === 'measured' ? this.measuredContent() : kind === 'teacher' ? this.teacherContent() : kind === 'onboarding' ? this.onboardingContent() : this.hintContent()
    this.dialog.showModal()
    this.root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
    q(this.dialog, '[data-action="close-modal"]').focus()
  }

  speakDebrief(): void {
    if (!this.speechSupported || !this.model?.result) return
    window.speechSynthesis.cancel()
    const text = this.model.result.trace.map(step => `${step.label}. ${step.formula}. Result ${step.result.toFixed(2)} ${step.unit}.`).join(' ')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    window.speechSynthesis.speak(utterance)
  }

  private renderSite(site: SiteKey): void {
    const point = NASA_DATA.sites[site]
    const elevation = point.elevation.value === null ? 'Elevation: approximate only; pending verification' : `Elevation: ${point.elevation.value.toLocaleString()} m MOLA`
    q(this.root, '#site-description').innerHTML = `<strong>${escapeHTML(point.name)}</strong><br>${point.latitude.value}° N · ${point.longitude.value}° E ${P.real}<br>${elevation} ${point.elevation.verified ? P.real : '<span class="pending">pending verification</span>'}`
  }

  private renderGauges(state: MissionState): void {
    const values = [
      { id: 'oxygen', label: 'O₂ + water', value: state.o2Water },
      { id: 'food', label: 'Food stores', value: state.food },
      { id: 'crew', label: 'Crew readiness', value: state.crewHealth },
    ]
    for (const item of values) {
      const card = q(this.root, `#gauge-${item.id}`)
      const status = stockStatus(item.value)
      const icon = status === 'NOMINAL' ? '✓' : status === 'STRAINED' ? '⚠' : '⛨'
      card.dataset.status = statusClass(status)
      q(card, '.gauge-value').textContent = `${item.value.toFixed(item.value % 1 ? 2 : 0)} / 100`
      q(card, '.gauge-status').textContent = `${icon} ${status}`
      q<HTMLElement>(card, '.gauge-fill').style.width = `${item.value}%`
    }
    q(this.root, '#radiation-value').textContent = `${state.cumRad.toFixed(2)} / 6.5 mSv`
    q<HTMLElement>(this.root, '#radiation-bar').style.width = `${Math.min(100, state.cumRad / 6.5 * 100)}%`
    const rad = state.cumRad <= 4.5 ? 'NOMINAL' : state.cumRad <= 6.5 ? 'STRAINED' : 'CRITICAL'
    q(this.root, '#gauge-rad').dataset.status = statusClass(rad)
    q(this.root, '#radiation-status').textContent = `${rad === 'NOMINAL' ? '✓' : rad === 'STRAINED' ? '⚠' : '⛨'} ${rad}`
    q(this.root, '#battery-value').textContent = `${state.battery} kW`
    q(this.root, '#simple-shield').textContent = `${this.model!.allocation.shield} kW`
    q(this.root, '#simple-bio').textContent = `${this.model!.allocation.bio} kW`
    q(this.root, '#simple-hab').textContent = `${this.model!.allocation.hab} kW`
  }

  private renderAllocation(m: MissionView): void {
    const budget = planBudget(m.state, m.scenario, m.allocation)
    for (const key of ['shield', 'bio', 'hab'] as const) {
      const slider = q<HTMLInputElement>(this.root, `[data-allocation="${key}"]`)
      if (document.activeElement !== slider) slider.value = String(m.allocation[key])
      q(this.root, `[data-value="${key}"]`).textContent = `${m.allocation[key]} kW`
      this.root.querySelectorAll<HTMLElement>(`[data-station-card="${key}"], [data-station-select="${key}"]`).forEach(node => node.classList.toggle('is-selected', m.selected === key))
    }
    q(this.root, '#power-total').textContent = `${budget.total} kW`
    q(this.root, '#power-available').textContent = `${Math.max(0, budget.available)} kW`
    q(this.root, '#battery-draw').textContent = `${budget.batteryDraw} kW`
    q(this.root, '#power-error').textContent = budget.reason ?? ''
    q(this.root, '#execute-hint').textContent = budget.legal ? 'Your plan is legal. Run this Sol.' : 'Lower a dial or check the battery.'
    q<HTMLButtonElement>(this.root, '#execute-sol').disabled = m.phase !== 'plan' || !budget.legal
    q(this.root, '#judge-metadata').hidden = m.mode !== 'judge'
    const flareProvenance = m.scenario.flareId.verified ? P.real : '<span class="pending">pending DONKI confirmation</span>'
    const flareDetails = m.scenario.flareKey === 'QUIET' ? 'Quiet baseline; no flare ID or time.' : `ID: ${escapeHTML(m.scenario.flareId.value ?? 'not listed')} · class: ${escapeHTML(m.scenario.classType)} · time: ${escapeHTML(m.scenario.date ?? 'not listed')} ${flareProvenance}`
    q(this.root, '#judge-metadata').innerHTML = m.mode === 'judge' ? `<p>Solar event ${flareDetails}</p><p>SEP × ${m.scenario.sep.toFixed(1)} ${P.model} · Mars RAD reference: ${NASA_DATA.radiation.marsSurface.value} mSv/day ${P.real}</p><p>Solar supply ${m.scenario.supply} kW · available ${budget.available} kW · battery draw ${budget.batteryDraw} kW ${P.game}</p><p>Site: ${NASA_DATA.sites[m.site].latitude.value}° N, ${NASA_DATA.sites[m.site].longitude.value}° E ${P.real}<br>${escapeHTML(NASA_DATA.sites[m.site].elevation.unit)} ${NASA_DATA.sites[m.site].elevation.verified ? P.real : '<span class="pending">pending verification</span>'}</p>` : ''
    q(this.root, '#provenance-note').innerHTML = `Curiosity RAD reference: ${NASA_DATA.radiation.marsSurface.value} mSv/day at Gale Crater. It is not a site-specific reading. ${P.real}`
  }

  private renderWhy(m: MissionView): void {
    q(this.root, '#debrief-title').textContent = `Sol ${m.solIndex + 1} debrief`
    q(this.root, '#debrief-summary').textContent = m.result ? (m.state.o2Water === 0 || m.state.food === 0 || m.state.crewHealth === 0 ? 'Engineering debrief: a stock reached zero. Replay this Sol to try a different design.' : `You routed ${m.result.total} kW. Battery draw: ${m.result.batteryDraw} kW. ${m.scenario.teaching}`) : 'Review the trace and try another design.'
    q(this.root, '#why-chain').innerHTML = m.result ? `<ol class="trace-chain">${m.result.trace.map((step, index) => `<li class="trace-step"><span class="trace-number">${index + 1}</span><div><strong>${escapeHTML(step.label)}</strong><p>${escapeHTML(step.formula)}</p><small>${Object.entries(step.inputs).map(([name, value]) => `${escapeHTML(name)}: ${Number(value).toFixed(Number.isInteger(value) ? 0 : 2)}`).join(' · ')}</small><b>${step.delta >= 0 ? '+' : ''}${step.delta.toFixed(2)} → ${step.result.toFixed(2)} ${escapeHTML(step.unit)}</b>${step.status ? `<span class="gauge-status">${escapeHTML(step.status)}</span>` : ''}${step.provenance === 'REAL NASA MEASUREMENT' ? P.real : step.provenance === 'SCALED PHYSICS MODEL' ? P.model : P.game}</div></li>`).join('')}</ol>` : '<p>Each station changes the mission stocks. Try a different plan.</p>'
    q(this.root, '#continue-sol').textContent = m.solIndex >= 6 ? 'See mission results' : 'Continue to next Sol'
  }

  private renderResults(m: MissionView): void {
    const stars = missionStars(m.state)
    q(this.root, '#result-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars)
    q(this.root, '#result-rating').textContent = stars === 3 ? 'Flight Director' : stars === 2 ? 'Mission Specialist' : 'Cadet'

    const solSteps = m.results.length
    let svgChart = ''
    if (solSteps > 0) {
      const width = 360
      const height = 90
      const padX = 20
      const padY = 10
      const stepX = (width - padX * 2) / Math.max(1, solSteps)
      const pointsO2 = m.results.map((r, i) => `${padX + i * stepX},${padY + ((100 - r.state.o2Water) * (height - padY * 2)) / 100}`).join(' ')
      const pointsFood = m.results.map((r, i) => `${padX + i * stepX},${padY + ((100 - r.state.food) * (height - padY * 2)) / 100}`).join(' ')
      const pointsCrew = m.results.map((r, i) => `${padX + i * stepX},${padY + ((100 - r.state.crewHealth) * (height - padY * 2)) / 100}`).join(' ')
      svgChart = `<div class="results-chart" style="margin:12px 0;padding:10px;background:#0f172a;border:1px solid #334155;border-radius:8px"><small style="display:block;color:#94a3b8;font-weight:750;margin-bottom:4px">MISSION TRAJECTORY (Sols 1–${solSteps})</small><svg width="100%" height="80" viewBox="0 0 ${width} ${height}" style="overflow:visible"><polyline points="${pointsO2}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/><polyline points="${pointsFood}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/><polyline points="${pointsCrew}" fill="none" stroke="#eab308" stroke-width="2.5" stroke-linecap="round"/></svg><div style="display:flex;gap:12px;font-size:11px;font-weight:750;margin-top:4px"><span style="color:#38bdf8">■ O₂/Water</span><span style="color:#10b981">■ Food</span><span style="color:#eab308">■ Crew</span></div></div>`
    }

    q(this.root, '#result-values').innerHTML = `<p>O₂ / water: <strong>${m.state.o2Water.toFixed(2)}</strong> ${P.game}</p><p>Food: <strong>${m.state.food.toFixed(2)}</strong> ${P.game}</p><p>Crew readiness: <strong>${m.state.crewHealth.toFixed(2)}</strong> ${P.game}</p><p>Cumulative dose: <strong>${m.state.cumRad.toFixed(2)} mSv</strong> ${P.model}</p><p>Battery remaining: <strong>${m.state.battery} kW</strong> ${P.game}</p>${svgChart}`
    q(this.root, '#best-result').innerHTML = `Best rating: ${'★'.repeat(m.bestStars)}${'☆'.repeat(3 - m.bestStars)} ${P.game}`
    q(this.root, '#result-lesson').textContent = stars === 3 ? 'Outstanding mission command! You successfully balanced high radiation shielding with sustainable closed-loop life support.' : stars === 2 ? 'Mission accomplished with solid resource management. Analyze the Why-Chain to optimize shielding during extreme flares.' : 'Mission concluded with vital astronaut training data. Remember: every watt allocated to shielding reduces cumulative biological dosage.'
    const hints = `${m.hintsUsed} ${m.hintsUsed === 1 ? 'hint' : 'hints'}`
    const replays = `${m.replaysUsed} ${m.replaysUsed === 1 ? 'replay' : 'replays'}`
    q(this.root, '#result-activity').innerHTML = `${m.practice ? 'Practice' : 'Campaign'} · seed ${escapeHTML(m.seed)} · ${hints} · ${replays}. ${P.game}`
  }

  private renderBiomarkers(m: MissionView): void {
    const recent = m.results.slice(-2).map(result => result.allocation.hab).concat(m.allocation.hab)
    const avgHab = recent.reduce((sum, value) => sum + value, 0) / recent.length
    const values = [
      ['Bone & muscle model', this.modelValue(100 - 2.5 * Math.max(0, 40 - avgHab))],
      ['Sleep model', this.modelValue(100 - 2.5 * Math.max(0, 40 - m.allocation.hab))],
      ['Immune model', this.modelValue(100 - 12 * Math.max(0, m.state.cumRad - 2.5))],
    ]
    q(this.root, '#biomarker-list').innerHTML = `${values.map(([label, value]) => `<li><span>${label}</span><b>${Number(value).toFixed(0)}%</b></li>`).join('')} ${P.model}`
  }

  private modelValue(value: number): number { return Math.max(0, Math.min(100, value)) }
  private stationName(key: StationKey): string { return key === 'shield' ? 'Shield & Comms' : key === 'bio' ? 'Bio-Dome' : 'Habitat & ECLSS' }

  private sourcesContent(): string {
    return `<p>These are public resources named by ARES-7 v3, plus the two cited standards. Each link includes the limits checked for this prototype.</p><ul class="source-list">${SOURCES.map(source => `<li><div><strong>${escapeHTML(source.title)}</strong><p>${escapeHTML(source.drives)}</p><small>${escapeHTML(source.evidence)}</small><span class="${source.verified ? 'verified' : 'pending'}">${source.verified ? 'Page opened and checked' : 'Capability not verified'}</span></div><a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">Open source</a></li>`).join('')}</ul>`
  }

  private measuredContent(): string {
    return `<div class="two-columns"><section><h3>Source measurements and records</h3><ul><li>Curiosity RAD reference is 0.64 mSv/day at Gale Crater. Not a reading from either selected landing site. ${P.real}</li><li>Site coordinates are listed in ARES-7 v3. ${P.real}</li><li>Solar-event classes and times are listed in the PDF. Exact historic DONKI IDs are pending verification.</li></ul></section><section><h3>Scaled game model</h3><ul><li>SEP multipliers and dose response are simplified game rules. ${P.model}</li><li>One shielding curve stands in for regolith and water-wall shielding.</li><li>One crew-readiness value and crop loop simplify a habitat system.</li><li>X-ray class is not used as a measured proton dose.</li><li>This outpost is fictional. The model does not simulate site-specific radiation instruments.</li></ul></section></div><p>Seven-Sol mission dose budget: ${NASA_DATA.radiation.safeBudget.value} mSv. This is a game budget, not a NASA crew-safety limit. ${P.game}</p>`
  }

  private teacherContent(): string {
    return `<div class="teacher-print-content"><h3>Teacher & NGSS guide</h3><p>Discuss engineering trade-offs: compare two plans, name a constraint, and explain how one choice affects another mission stock.</p><p>Five mission tips:</p><ol><li>Power is one shared budget, not extra free energy.</li><li>Compare two plans before you change a dial.</li><li>Move one 5 kW step and watch the trace.</li><li>Find the first trace step that changed an outcome.</li><li>Replay restores the Sol-start snapshot, including battery.</li></ol><p>Reflection prompts:</p><ul><li>What did you give up to protect the crew from a flare?</li><li>When did the Bio-Dome help the food loop?</li><li>Did the battery solve one Sol but make a later Sol harder?</li></ul><h3>NGSS performance expectations</h3><ul><li><a href="https://www2.cde.ca.gov/cacs/id/web/29038" target="_blank" rel="noreferrer">3–5-ETS1-2</a>: “Generate and compare multiple possible solutions to a problem based on how well each is likely to meet the criteria and constraints of the problem.”</li><li><a href="https://www.nextgenscience.org/pe/ms-ets1-2-engineering-design" target="_blank" rel="noreferrer">MS-ETS1-2</a>: “Evaluate competing design solutions using a systematic process to determine how well they meet the criteria and constraints of the problem.”</li></ul><p>This prototype offers discussion prompts; it is not a standards assessment. The exact standards and sources are listed in the Sources panel.</p><button class="secondary-button" data-action="print-teacher">Print teacher guide</button><p>After the campaign, print the Student Mission Report from the results screen. CSA STEM/youth resources are linked in Sources.</p></div>`
  }

  private printTeacher(): void {
    document.body.dataset.printMode = 'teacher'
    const restore = () => { delete document.body.dataset.printMode }
    window.addEventListener('afterprint', restore, { once: true })
    window.print()
  }

  private onboardingContent(): string {
    return `<ol class="briefing-steps"><li><b>Sunlight is limited.</b><p>All stations share one supply.</p></li><li><b>The stations connect.</b><p>Plants support food. Habitat power supports the crew.</p></li><li><b>Plan, then run the Sol.</b><p>Use the sliders or ±5 kW buttons. Replay a Sol if needed.</p></li></ol><p>Use WASD or arrow keys to walk. Q and E change a nearby station. Space runs the Sol. H opens a coach hint.</p>`
  }

  private hintContent(): string {
    const m = this.model!
    const limit = 1.1
    const required = m.scenario.sep <= limit / 0.64 ? 0 : Math.max(0, Math.ceil(Math.log((0.64 * m.scenario.sep) / limit) / 0.032 / 5) * 5)
    const shieldTip = required > 70 ? 'Even 70 kW of shielding cannot avoid the radiation penalty for this event.' : `Try at least <strong>${required} kW</strong> at the shield station to avoid a daily radiation penalty.`
    return `<p>${shieldTip} ${P.game} ${P.model}</p><p>Bio break-even: <strong>40 kW</strong>. Habitat break-even: <strong>40 kW</strong>. ${P.game}</p><p>The hint is shown in the student report and does not change mission stocks.</p>`
  }

  private cropNote(crop: string): string {
    switch (crop) {
      case 'Dwarf Wheat':
        return 'Dwarf Wheat (Apogee cultivar): High harvest index and rapid lifecycle developed for space greenhouses. Sol 4 wheat pollination bonus demonstrates closed-loop life support.'
      case 'Red Romaine Lettuce':
        return 'Red Romaine (Outredgeous cultivar): NASA Veggie flight experiment standard. Rich in antioxidants and anthocyanins to protect astronaut cellular health from cosmic radiation.'
      case 'Radishes':
        return 'Cherry Belle Radish: Compact 28-day growth cycle requiring minimal root substrate while synthesizing essential ascorbic acid (vitamin C) and dietary potassium.'
      case 'Cherry Tomatoes':
        return 'Micro-Tina Tomato: Dwarf fruiting plant engineered for controlled-environment agriculture under narrow-spectrum LED photons, providing essential lycopene and dietary energy.'
      default:
        return `${crop} is an educational selection grounded in CSA and NASA space biology datasets. Crop choice changes no simulation game balance.`
    }
  }

  private template(): string {
    const stationCards = [
      { key: 'shield', icon: '◉', title: 'Shield & Comms Relay', note: 'Slow down radiation.' },
      { key: 'bio', icon: '✳', title: 'CSA Bio-Dome', note: 'Grow food for the crew.' },
      { key: 'hab', icon: '⌂', title: 'Habitat & ECLSS', note: 'Keep the crew ready.' },
    ].map(item => `<article class="station-card" data-station-card="${item.key}"><div class="station-head"><span class="station-icon" aria-hidden="true">${item.icon}</span><div><h3>${item.title}</h3><p>${item.note}</p></div><b data-value="${item.key}">30 kW</b></div><div class="allocation-row"><button class="step-button" data-action="adjust-minus" data-station="${item.key}" aria-label="Lower ${item.title} by 5 kW">−5</button><label class="slider-wrap"><span class="visually-hidden">${item.title} power allocation</span><input type="range" min="0" max="70" step="5" value="30" data-allocation="${item.key}"><span>0–70 kW</span></label><button class="step-button" data-action="adjust-plus" data-station="${item.key}" aria-label="Raise ${item.title} by 5 kW">+5</button></div><span class="allocation-prov">${P.game}</span></article>`).join('')
    return `<header class="topbar"><a class="brand" href="#" aria-label="Redline Outpost"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ARES-7<small>JUNIOR ASTRONAUT MISSION TRAINER</small></span></a><div class="top-context"><strong id="sol-count">SOL 1 / 7</strong><span class="top-context-note" id="mode-caption">Cadet words · simple steps</span></div><nav class="toolbar" aria-label="Game tools"><button id="mode-toggle" class="toolbar-button" data-action="mode"><span class="button-icon">⚑</span><span id="mode-toggle-label">Judge mode</span></button><button id="view-toggle" class="toolbar-button" data-action="view"><span class="button-icon">▧</span><span id="view-toggle-label">Simple view</span></button><button class="toolbar-button" data-action="sources">Sources</button><button class="toolbar-button" data-action="measured">Data & model</button><button class="toolbar-button" data-action="teacher">Teacher guide</button><button id="demo-button" class="toolbar-button demo-button" data-action="demo">60-sec Judge demo</button><button class="toolbar-button" data-action="nasa-dashboard" title="NASA Space Weather Dashboard">☀ Space Weather</button><button class="toolbar-button" data-action="history" title="Mission History">📋 History</button><button class="toolbar-button" data-action="leaderboard" title="Global Leaderboard">🏆 Leaderboard</button><button class="toolbar-button" data-action="research" title="NASA Space Biology Research">🔬 Research</button></nav></header>
    <main class="mission-layout"><section class="console-column" aria-label="Mission controls"><div class="mission-topline"><span class="eyebrow">ARES-7 MARS OUTPOST / COMMAND CENTER</span><span id="seed-display" class="mission-seed">CAMPAIGN / SEED ARES7-1</span></div>
    <section id="mission-panel-intro" class="panel intro-panel"><div class="panel-kicker"><span class="status-dot"></span> MISSION BRIEFING / SEVEN SOLS</div><h1>ARES-7: Every watt is a decision.</h1><p id="intro-copy">Command a 7-Sol Martian colony. Three critical stations share limited solar energy. Balance shielding, food production, and life support to keep your crew alive.</p><div class="setup-fields"><label>Landing site<select id="site-select"><option value="jezero">Jezero Crater · Perseverance</option><option value="elysium">Elysium Planitia · InSight</option></select></label><label>Grow tray<select id="crop-select"><option>Dwarf Wheat</option><option>Red Romaine Lettuce</option><option>Radishes</option><option>Cherry Tomatoes</option></select></label><label>Practice seed<div class="seed-entry"><input id="seed-field" maxlength="24" value="ARES7-1" aria-label="Practice seed"><button class="small-button" data-action="seed-random">New seed</button></div></label></div><p id="site-description" class="site-note"></p><p class="micro-copy">The fixed campaign follows the saved ARES-7 schedule. Practice seed changes only a practice run.</p><div class="intro-actions"><button class="primary-button" data-action="start-campaign">Start fixed campaign</button><button class="secondary-button" data-action="start-practice">Start seeded practice</button><button class="text-button" data-action="onboarding">How to play</button></div></section>
    <section id="mission-panel-plan" class="panel plan-panel" hidden><div class="panel-kicker"><span class="status-dot"></span><span id="plan-heading">SOL 1</span></div><h1 id="sol-instruction">Set today’s power plan.</h1><div class="event-ticket"><div><span class="micro-label">SPACE WEATHER / SAVED CAMPAIGN CATALOG</span><strong id="ticker-event"></strong><small id="ticker-class"></small></div><div class="event-values"><b id="ticker-supply"></b>${P.game}<b id="ticker-dose-multiplier"></b>${P.model}</div></div><p id="weather-note" class="teaching-note"></p><p id="sol-teaching" class="micro-copy"></p><p id="ticker-live" class="live-status">Using saved NASA data</p><p id="ticker-id" class="pending"></p><div id="judge-metadata" class="judge-metadata" hidden></div><button id="live-donki" class="secondary-button live-button" data-action="sync-donki" hidden>Sync NASA DONKI (Practice only)</button></section>
    <section id="mission-panel-debrief" class="panel debrief-panel" hidden><div class="panel-kicker">POST-SOL / WHY-CHAIN</div><h1 id="debrief-title">Sol debrief</h1><p id="debrief-summary"></p><div id="why-chain"></div><div class="debrief-buttons"><button id="replay-sol" class="secondary-button" data-action="replay">Replay this Sol</button><button id="continue-sol" class="primary-button" data-action="continue">Continue to next Sol</button><button class="secondary-button" data-action="read-aloud">Read aloud</button></div><div class="usage-counts"><span id="hint-uses">Hints used: 0</span><span id="replay-uses">Replays used: 0</span></div></section>
    <section id="mission-panel-results" class="panel result-panel" hidden><div class="panel-kicker">MISSION COMPLETE / STUDENT REPORT</div><h1 id="result-rating">Cadet</h1><div id="result-stars" class="result-stars">★☆☆</div><p id="best-result" class="best-result"></p><div id="result-values" class="result-values"></div><p id="result-lesson"></p><p id="result-activity"></p><div class="result-actions"><button class="primary-button" data-action="print">Print mission report</button><button class="secondary-button" data-action="start-campaign">Fly campaign again</button><button class="text-button" data-action="start-practice">Try seeded practice</button></div></section>
    <section id="resources-panel" class="resource-panel" hidden><div class="panel-kicker">CREW & SYSTEM STOCKS</div><div class="gauge-grid"><article id="gauge-oxygen" class="gauge-card" data-status="nominal"><div class="gauge-heading"><span>O₂ + water</span><b class="gauge-status">NOMINAL</b></div><strong class="gauge-value">85 / 100</strong><div class="meter"><i class="gauge-fill" style="width:85%"></i></div><span class="prov game">NORMALIZED GAME UNIT</span></article><article id="gauge-food" class="gauge-card" data-status="nominal"><div class="gauge-heading"><span>Food stores</span><b class="gauge-status">NOMINAL</b></div><strong class="gauge-value">80 / 100</strong><div class="meter"><i class="gauge-fill" style="width:80%"></i></div><span class="prov game">NORMALIZED GAME UNIT</span></article><article id="gauge-crew" class="gauge-card" data-status="nominal"><div class="gauge-heading"><span>Crew readiness</span><b class="gauge-status">NOMINAL</b></div><strong class="gauge-value">90 / 100</strong><div class="meter"><i class="gauge-fill" style="width:90%"></i></div><span class="prov game">NORMALIZED GAME UNIT</span></article><article id="gauge-rad" class="gauge-card radiation-card" data-status="nominal"><div class="gauge-heading"><span>Total radiation</span><b id="radiation-status" class="gauge-status">NOMINAL</b></div><strong id="radiation-value" class="gauge-value">0.00 / 6.5 mSv</strong><div class="meter"><i id="radiation-bar" class="gauge-fill" style="width:0%"></i></div><span class="prov model">SCALED PHYSICS MODEL</span></article></div><div class="resources-bottom"><span>Emergency battery <strong id="battery-value">30 kW</strong> <span class="prov game">NORMALIZED GAME UNIT</span></span><span>Crew biomarker model <span class="prov model">SCALED PHYSICS MODEL</span></span></div><ul id="biomarker-list" class="biomarker-list"></ul></section>
    <section id="allocation-panel" class="allocation-panel" hidden><div class="section-head"><div><span class="panel-kicker">POWER ROUTING / THREE STATIONS</span><h2>Set the three dials</h2></div><button id="coach-hint" class="secondary-button" data-action="hint">Coach hint <kbd>H</kbd></button></div><div class="station-list">${stationCards}</div><div class="power-summary"><div><small>Total load</small><strong id="power-total">100 kW</strong>${P.game}</div><span class="power-arrow">→</span><div><small>Available</small><strong id="power-available">100 kW</strong>${P.game}</div><div class="battery-readout"><small>Battery draw</small><strong id="battery-draw">0 kW</strong>${P.game}</div></div><p id="power-error" class="power-error" role="status"></p><p id="execute-hint" class="execute-hint">Your plan is legal. Run this Sol.</p><button id="execute-sol" class="execute-button" data-action="execute">Execute Sol <kbd>Space</kbd></button><p class="data-note" id="provenance-note"></p></section>
    <section class="teacher-strip"><strong>Grow tray</strong><span id="crop-card">Wheat is the Sol 4 pollination example.</span><span>Crop choice changes no game numbers. ${P.game}</span></section></section>
    <section class="scene-column" aria-label="Mars outpost scene"><div class="scene-head"><span class="panel-kicker">OUTPOST PAD / 3D FIELD VIEW</span><span id="outpost-hint">Select a station to adjust its power.</span></div><div class="scene-wrap"><canvas id="scene-canvas" aria-label="Procedural isometric Mars outpost. Select a station to adjust its power."></canvas><div class="simple-view" aria-live="polite"><div class="mars-disc"><button type="button" class="simple-station shield-station" data-station-select="shield" aria-label="Select Shield and Comms station"><span class="shape">◉</span><b>SHIELD</b><small id="simple-shield">20 kW</small></button><button type="button" class="simple-station bio-station" data-station-select="bio" aria-label="Select Bio-Dome station"><span class="shape">✳</span><b>BIO-DOME</b><small id="simple-bio">40 kW</small></button><button type="button" class="simple-station hab-station" data-station-select="hab" aria-label="Select Habitat and ECLSS station"><span class="shape">⌂</span><b>HABITAT</b><small id="simple-hab">40 kW</small></button><div class="simple-cadet">MARS / MISSION PAD</div></div></div><div class="scene-legend"><span>WASD / arrows · walk</span><span>Q / E · −/+5 kW</span><span>Space · run this Sol</span><span>Tap terrain to walk · tap a station to open its controls</span>${P.game}</div></div><div class="station-tabs" aria-label="Select a station"><button data-station-select="shield">◉ Shield relay</button><button data-station-select="bio">✳ Bio-Dome</button><button data-station-select="hab">⌂ Habitat</button></div></section></main>
    <footer class="legal-footer"><span>Educational simulation. Not an official NASA or CSA product.</span><span>Data from NASA and CSA public resources.</span><span id="feedback" role="status" aria-live="polite"></span></footer>
    <dialog id="info-dialog" class="info-dialog" aria-labelledby="info-title"><div class="dialog-panel"><div class="dialog-heading"><div><span class="panel-kicker">ARES-7 / FIELD MANUAL</span><h2 id="info-title">Mission briefing</h2></div><button class="close-button" data-action="close-modal" aria-label="Close dialog">×</button></div><div id="info-body" class="dialog-body"></div><div class="dialog-footer"><span>Escape closes this panel.</span><button class="secondary-button" data-action="close-modal">Close</button></div></div></dialog>`
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-station-select]')
    if (!target || !this.model) return
    const action = target.dataset.action
    if (action) {
      switch (action) {
        case 'start-campaign': this.actions.start(false, this.model.seed, this.model.site); break
        case 'start-practice': this.actions.start(true, this.model.seed, this.model.site); break
        case 'mode': this.actions.mode(); break
        case 'view': this.actions.view(); break
        case 'execute': this.actions.execute(); break
        case 'continue': this.actions.continue(); break
        case 'replay': this.actions.replay(); break
        case 'hint': this.actions.hint(); this.openModal('hint'); break
        case 'sources': this.openModal('sources'); break
        case 'measured': this.openModal('measured'); break
        case 'teacher': this.openModal('teacher'); break
        case 'onboarding': this.openModal('onboarding'); break
        case 'close-modal': this.dialog.close(); break
        case 'read-aloud': this.speakDebrief(); break
        case 'print': window.print(); break
        case 'print-teacher': this.printTeacher(); break
        case 'adjust-minus': this.actions.adjust(target.dataset.station as StationKey, -5); break
        case 'adjust-plus': this.actions.adjust(target.dataset.station as StationKey, 5); break
        case 'sync-donki': this.actions.syncDonki(); break
        case 'demo': this.actions.demo(); break
        case 'nasa-dashboard': this.actions.openNasaDashboard(); break
        case 'history': this.actions.openHistory(); break
        case 'leaderboard': this.actions.openLeaderboard(); break
        case 'research': this.actions.openResearch(); break
        case 'seed-random': { const data = new Uint32Array(1); crypto.getRandomValues(data); const next = `ARES-${data[0].toString(36).toUpperCase()}`; q<HTMLInputElement>(this.root, '#seed-field').value = next; this.actions.seed(next); break }
      }
      return
    }
    const station = target.dataset.stationSelect as StationKey | undefined
    if (station) this.actions.select(station)
  }

  private onInput(event: Event): void {
    const target = event.target as HTMLInputElement
    if (!target.matches('[data-allocation]') || !this.model) return
    const key = target.dataset.allocation as keyof Allocation
    this.actions.allocation({ ...this.model.allocation, [key]: Number(target.value) })
  }

  /** Optional focus helper for a controller adapter; plain DOM Tab navigation remains native. */
  frame(_frameSeconds: number): void {
    const adapter = this as unknown as { input?: { method?: string; move?: { x: number; y: number }; consume(action: string): boolean }; moveFocus?: (x: number, y: number) => void }
    if (adapter.input?.method !== 'gamepad') return
    const move = adapter.input.move
    if (move && (move.x !== 0 || move.y !== 0)) adapter.moveFocus?.(move.x, move.y)
    if (adapter.input.consume('confirm')) {
      const active = document.activeElement as unknown as { click?: () => void } | null
      active?.click?.()
    }
  }

  private onChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement
    if (target.id === 'site-select') this.actions.site(target.value as SiteKey)
    if (target.id === 'crop-select') this.actions.crop(target.value)
    if (target.id === 'seed-field') this.actions.seed(target.value.slice(0, 24))
  }
}
