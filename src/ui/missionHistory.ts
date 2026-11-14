/**
 * Mission History panel.
 *
 * Shows the last 10 completed missions from Supabase (or empty when
 * Supabase is not configured). Renders as a <dialog>.
 *
 * Each row opens a printable per-mission report.
 */

import type { MissionSummary } from '../db/missionPersistence'
import { getMissionHistory } from '../db/missionPersistence'
import { isSupabaseConfigured } from '../db/supabaseClient'

const escH = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

function stars(n: 1 | 2 | 3): string {
  return '★'.repeat(n) + '☆'.repeat(3 - n)
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return iso }
}

function siteLabel(site: string): string {
  return site === 'jezero' ? 'Jezero Crater' : site === 'elysium' ? 'Elysium Planitia' : escH(site)
}

function renderRow(m: MissionSummary, index: number): string {
  return `
    <tr class="history-row" data-index="${index}">
      <td>${escH(formatDate(m.completed_at))}</td>
      <td>${escH(siteLabel(m.landing_site))}</td>
      <td>${escH(m.mission_mode === 'campaign' ? 'Campaign' : `Practice · ${m.mission_seed}`)}</td>
      <td>${escH(String(m.total_sols))}</td>
      <td class="history-stars">${escH(stars(m.stars))}</td>
      <td>${escH(String(Math.round(m.final_crew_health)))}</td>
      <td>${escH(m.cumulative_radiation.toFixed(2))} mSv</td>
    </tr>`
}

export class MissionHistory {
  private dialog: HTMLDialogElement
  private missions: MissionSummary[] = []
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
    el.className = 'info-dialog history-dialog'
    el.setAttribute('aria-labelledby', 'history-title')
    el.innerHTML = `
      <div class="dialog-panel">
        <div class="dialog-heading">
          <div>
            <span class="panel-kicker">MISSION LOG / COMPLETED RUNS</span>
            <h2 id="history-title">Mission History</h2>
          </div>
          <button class="close-button" id="history-close" aria-label="Close mission history">×</button>
        </div>
        <div id="history-body" class="dialog-body">
          <p>Loading mission history…</p>
        </div>
        <div class="dialog-footer">
          <span>Last 10 completed missions</span>
          <button class="secondary-button" id="history-close-btn">Close</button>
        </div>
      </div>`
    el.querySelector('#history-close')?.addEventListener('click', () => el.close())
    el.querySelector('#history-close-btn')?.addEventListener('click', () => el.close())
    return el
  }

  async open(): Promise<void> {
    this.dialog.showModal()
    this.root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
    if (!this.loading) {
      await this.load()
    }
  }

  private async load(): Promise<void> {
    this.loading = true
    this.renderLoading()
    this.missions = await getMissionHistory()
    this.loading = false
    this.render()
  }

  private renderLoading(): void {
    const body = this.dialog.querySelector<HTMLElement>('#history-body')
    if (body) body.innerHTML = '<p class="sw-loading">⟳ Loading mission history…</p>'
  }

  private render(): void {
    const body = this.dialog.querySelector<HTMLElement>('#history-body')
    if (!body) return

    if (!isSupabaseConfigured()) {
      body.innerHTML = `
        <div class="history-notice">
          <p>Mission history requires a Supabase database connection.</p>
          <p>Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
             to enable persistent mission history across sessions.</p>
          <p>See the <a href="https://github.com/saviottt1/Ares7#supabase-setup" target="_blank" rel="noreferrer">README</a>
             for setup instructions.</p>
        </div>`
      return
    }

    if (this.missions.length === 0) {
      body.innerHTML = `
        <div class="history-notice">
          <p>No completed missions yet. Finish your first seven-Sol campaign or practice run to see it here.</p>
        </div>`
      return
    }

    body.innerHTML = `
      <div class="history-scroll">
        <table class="history-table" role="grid">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Site</th>
              <th scope="col">Mode</th>
              <th scope="col">Sols</th>
              <th scope="col">Rating</th>
              <th scope="col">Crew</th>
              <th scope="col">Radiation</th>
            </tr>
          </thead>
          <tbody>
            ${this.missions.map((m, i) => renderRow(m, i)).join('')}
          </tbody>
        </table>
      </div>`
  }
}
