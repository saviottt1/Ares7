/**
 * NASA Space Weather Dashboard panel.
 *
 * Renders into a <dialog> element. Shows live FLR, SEP, and CME events
 * fetched via nasaClient (Edge Function proxy or DEMO_KEY fallback).
 *
 * Provenance labelling matches the existing ARES-7 convention:
 *   "REAL NASA MEASUREMENT" for DONKI-sourced identifiers, times, and classes.
 *   "SIMULATED" for game abstractions (SEP bucket).
 *
 * Does NOT suggest that solar flare class is a measured proton dose.
 * Does NOT modify the fixed seven-Sol campaign.
 */

import type { SpaceWeatherData } from '../api/nasaClient'
import { fetchSpaceWeather } from '../api/nasaClient'
import type { NasaFlare, NasaSep, NasaCme } from '../api/nasaNormaliser'

const escH = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

const DONKI_URL = 'https://ccmc.gsfc.nasa.gov/tools/DONKI/'

function formatUtc(iso: string | null): string {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  } catch {
    return iso
  }
}

function classColor(letter: string): string {
  if (letter === 'X') return '#f87171'
  if (letter === 'M') return '#fb923c'
  if (letter === 'C') return '#fbbf24'
  return '#94a3b8'
}

function renderFlare(f: NasaFlare): string {
  const color = classColor(f.classLetter)
  return `
    <div class="sw-event-card">
      <div class="sw-event-header">
        <span class="sw-class-badge" style="color:${color};border-color:${color}">
          ${escH(f.classType)}
        </span>
        <span class="sw-event-id">
          <a href="${DONKI_URL}" target="_blank" rel="noreferrer"
             title="View in NASA CCMC DONKI">${escH(f.flrId)}</a>
        </span>
        <span class="sw-prov real">REAL NASA MEASUREMENT</span>
      </div>
      <dl class="sw-event-dl">
        <dt>Begin</dt><dd>${escH(formatUtc(f.beginTime))}</dd>
        <dt>Peak</dt><dd>${escH(formatUtc(f.peakTime))}</dd>
        <dt>End</dt><dd>${escH(formatUtc(f.endTime))}</dd>
        ${f.sourceLocation ? `<dt>Location</dt><dd>${escH(f.sourceLocation)}</dd>` : ''}
        ${f.activeRegionNum != null ? `<dt>Active region</dt><dd>AR${escH(String(f.activeRegionNum))}</dd>` : ''}
        ${f.linkedEventIds.length > 0 ? `<dt>Linked events</dt><dd>${f.linkedEventIds.map(escH).join(', ')}</dd>` : ''}
      </dl>
      <p class="sw-disclaimer">
        X-ray class is not a measured proton dose inside the habitat.
        The game SEP bucket is a simplified educational abstraction.
        <span class="sw-prov sim">GAME ABSTRACTION</span>
      </p>
    </div>`
}

function renderSep(s: NasaSep): string {
  return `
    <div class="sw-event-card">
      <div class="sw-event-header">
        <span class="sw-class-badge" style="color:#38bdf8;border-color:#38bdf8">SEP</span>
        <span class="sw-event-id">${escH(s.sepId)}</span>
        <span class="sw-prov real">REAL NASA MEASUREMENT</span>
      </div>
      <dl class="sw-event-dl">
        <dt>Event time</dt><dd>${escH(formatUtc(s.eventTime))}</dd>
        ${s.instruments.length > 0 ? `<dt>Instruments</dt><dd>${s.instruments.map(escH).join(', ')}</dd>` : ''}
        ${s.linkedEventIds.length > 0 ? `<dt>Linked events</dt><dd>${s.linkedEventIds.map(escH).join(', ')}</dd>` : ''}
      </dl>
    </div>`
}

function renderCme(c: NasaCme): string {
  return `
    <div class="sw-event-card">
      <div class="sw-event-header">
        <span class="sw-class-badge" style="color:#a78bfa;border-color:#a78bfa">CME</span>
        <span class="sw-event-id">${escH(c.activityId)}</span>
        <span class="sw-prov real">REAL NASA MEASUREMENT</span>
      </div>
      <dl class="sw-event-dl">
        <dt>Start time</dt><dd>${escH(formatUtc(c.startTime))}</dd>
        ${c.speed != null ? `<dt>Speed</dt><dd>${escH(String(Math.round(c.speed)))} km/s</dd>` : ''}
        ${c.type ? `<dt>Type</dt><dd>${escH(c.type)}</dd>` : ''}
        ${c.latitude != null ? `<dt>Latitude</dt><dd>${escH(String(c.latitude))}°</dd>` : ''}
        ${c.longitude != null ? `<dt>Longitude</dt><dd>${escH(String(c.longitude))}°</dd>` : ''}
        ${c.linkedEventIds.length > 0 ? `<dt>Linked events</dt><dd>${c.linkedEventIds.map(escH).join(', ')}</dd>` : ''}
      </dl>
    </div>`
}

export class NasaDashboard {
  private dialog: HTMLDialogElement
  private data: SpaceWeatherData | null = null
  private loading = false

  constructor(private root: HTMLElement) {
    this.dialog = this.createDialog()
    root.appendChild(this.dialog)
    this.dialog.addEventListener('close', () => {
      root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
    })
  }

  private createDialog(): HTMLDialogElement {
    const el = document.createElement('dialog')
    el.className = 'info-dialog nasa-dashboard-dialog'
    el.setAttribute('aria-labelledby', 'nasa-dash-title')
    el.innerHTML = `
      <div class="dialog-panel">
        <div class="dialog-heading">
          <div>
            <span class="panel-kicker">NASA DONKI / SPACE WEATHER EVENTS</span>
            <h2 id="nasa-dash-title">NASA Space Weather Dashboard</h2>
          </div>
          <button class="close-button" id="nasa-dash-close" aria-label="Close NASA dashboard">×</button>
        </div>
        <div id="nasa-dash-body" class="dialog-body">
          <p>Loading NASA DONKI data…</p>
        </div>
        <div class="dialog-footer">
          <span>Source: <a href="${DONKI_URL}" target="_blank" rel="noreferrer">NASA CCMC DONKI</a></span>
          <button class="secondary-button" id="nasa-dash-refresh">↺ Refresh</button>
          <button class="secondary-button" id="nasa-dash-close-btn">Close</button>
        </div>
      </div>`
    el.querySelector('#nasa-dash-close')?.addEventListener('click', () => el.close())
    el.querySelector('#nasa-dash-close-btn')?.addEventListener('click', () => el.close())
    el.querySelector('#nasa-dash-refresh')?.addEventListener('click', () => void this.refresh(true))
    return el
  }

  async open(): Promise<void> {
    this.dialog.showModal()
    this.root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
    if (!this.data && !this.loading) {
      await this.refresh(false)
    } else {
      this.render()
    }
  }

  async refresh(force: boolean): Promise<void> {
    this.loading = true
    this.renderLoading()
    this.data = await fetchSpaceWeather(30, force)
    this.loading = false
    this.render()
  }

  private renderLoading(): void {
    const body = this.dialog.querySelector<HTMLElement>('#nasa-dash-body')
    if (body) body.innerHTML = '<p class="sw-loading">⟳ Fetching NASA DONKI data…</p>'
  }

  private render(): void {
    const body = this.dialog.querySelector<HTMLElement>('#nasa-dash-body')
    if (!body) return

    if (!this.data) {
      body.innerHTML = `
        <div class="sw-offline">
          <p>⚠ NASA DONKI data unavailable — using saved offline data.</p>
          <p>The game's space weather events are based on saved observations from the
             NASA DONKI catalog. <a href="${DONKI_URL}" target="_blank" rel="noreferrer">View DONKI directly.</a></p>
          <p class="sw-prov real">REAL NASA MEASUREMENT — offline fallback</p>
        </div>`
      return
    }

    const { flares, sep, cme, fetchedAt, source } = this.data
    const sourceLabel = source === 'edge-function'
      ? 'Supabase Edge Function proxy'
      : source === 'cache'
        ? 'cached data'
        : 'direct NASA API (DEMO_KEY)'

    const flareSection = flares.length > 0
      ? `<section class="sw-section">
          <h3>Solar Flares (FLR) — last 30 days <span class="sw-count">${flares.length}</span></h3>
          ${flares.slice(0, 5).map(renderFlare).join('')}
          ${flares.length > 5 ? `<p class="sw-more">+ ${flares.length - 5} more flares on DONKI</p>` : ''}
        </section>`
      : `<section class="sw-section"><h3>Solar Flares</h3><p class="sw-none">No flare events in the last 30 days.</p></section>`

    const sepSection = sep.length > 0
      ? `<section class="sw-section">
          <h3>Solar Energetic Particles (SEP) <span class="sw-count">${sep.length}</span></h3>
          ${sep.slice(0, 3).map(renderSep).join('')}
        </section>`
      : `<section class="sw-section"><h3>Solar Energetic Particles</h3><p class="sw-none">No SEP events in the last 30 days.</p></section>`

    const cmeSection = cme.length > 0
      ? `<section class="sw-section">
          <h3>Coronal Mass Ejections (CME) <span class="sw-count">${cme.length}</span></h3>
          ${cme.slice(0, 3).map(renderCme).join('')}
        </section>`
      : `<section class="sw-section"><h3>Coronal Mass Ejections</h3><p class="sw-none">No CME events in the last 30 days.</p></section>`

    body.innerHTML = `
      <div class="sw-meta">
        <span class="sw-prov real">REAL NASA MEASUREMENT — from NASA CCMC DONKI</span>
        <span class="sw-sync-time">Last sync: ${escH(formatUtc(fetchedAt))} · via ${escH(sourceLabel)}</span>
      </div>
      ${flareSection}
      ${sepSection}
      ${cmeSection}
      <div class="sw-attribution">
        <p>Data from the <a href="${DONKI_URL}" target="_blank" rel="noreferrer">NASA Space Weather Database of
        Notifications, Knowledge and Information (DONKI)</a>, maintained by NASA's Community Coordinated
        Modeling Center (CCMC). Educational simulation only — not an official NASA product.</p>
      </div>`
  }
}
