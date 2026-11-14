/**
 * Global Leaderboard panel.
 *
 * Shows the top-10 astronauts from Supabase.
 * Requires Supabase configuration; shows a friendly message otherwise.
 * Does NOT submit scores from the client — scores are stored server-side
 * and computed from mission_sols rows by the Edge Function.
 */

import { getLeaderboard, type LeaderboardEntry } from '../db/leaderboardService'
import { getAuthState } from '../db/auth'
import { isSupabaseConfigured } from '../db/supabaseClient'

const escH = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

function medalEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}.`
}

function renderEntry(e: LeaderboardEntry, isMe: boolean): string {
  const stars = '★'.repeat(e.best_stars) + '☆'.repeat(3 - e.best_stars)
  return `
    <tr class="${isMe ? 'leaderboard-me' : ''}">
      <td class="lb-rank">${escH(medalEmoji(e.rank))}</td>
      <td class="lb-name">
        ${e.avatar_url ? `<img class="lb-avatar" src="${escH(e.avatar_url)}" alt="" width="24" height="24" loading="lazy">` : '<span class="lb-avatar-placeholder" aria-hidden="true">👤</span>'}
        ${escH(e.username)}
        ${isMe ? '<span class="lb-you">(you)</span>' : ''}
      </td>
      <td class="lb-stars">${escH(stars)}</td>
      <td class="lb-missions">${escH(String(e.total_missions))}</td>
      <td class="lb-score">${escH(String(e.total_score))}</td>
    </tr>`
}

export class Leaderboard {
  private dialog: HTMLDialogElement
  private loaded = false
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
    el.className = 'info-dialog leaderboard-dialog'
    el.setAttribute('aria-labelledby', 'lb-title')
    el.innerHTML = `
      <div class="dialog-panel">
        <div class="dialog-heading">
          <div>
            <span class="panel-kicker">GLOBAL RANKINGS / TOP ASTRONAUTS</span>
            <h2 id="lb-title">Leaderboard</h2>
          </div>
          <button class="close-button" id="lb-close" aria-label="Close leaderboard">×</button>
        </div>
        <div id="lb-body" class="dialog-body">
          <p>Loading leaderboard…</p>
        </div>
        <div class="dialog-footer">
          <span>Top 10 astronauts worldwide</span>
          <button class="secondary-button" id="lb-refresh">↺ Refresh</button>
          <button class="secondary-button" id="lb-close-btn">Close</button>
        </div>
      </div>`
    el.querySelector('#lb-close')?.addEventListener('click', () => el.close())
    el.querySelector('#lb-close-btn')?.addEventListener('click', () => el.close())
    el.querySelector('#lb-refresh')?.addEventListener('click', () => { this.loaded = false; void this.open() })
    return el
  }

  async open(): Promise<void> {
    this.dialog.showModal()
    this.root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
    if (!this.loaded && !this.loading) {
      await this.load()
    }
  }

  private async load(): Promise<void> {
    this.loading = true
    this.renderLoading()
    const result = await getLeaderboard()
    this.loading = false
    this.loaded = true
    this.render(result)
  }

  private renderLoading(): void {
    const body = this.dialog.querySelector<HTMLElement>('#lb-body')
    if (body) body.innerHTML = '<p class="sw-loading">⟳ Loading leaderboard…</p>'
  }

  private render(result: Awaited<ReturnType<typeof getLeaderboard>>): void {
    const body = this.dialog.querySelector<HTMLElement>('#lb-body')
    if (!body) return

    if (!isSupabaseConfigured()) {
      body.innerHTML = `
        <div class="history-notice">
          <p>The global leaderboard requires a Supabase database connection.</p>
          <p>Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
             to enable it. See the <a href="https://github.com/saviottt1/Ares7#supabase-setup" target="_blank" rel="noreferrer">README</a>.</p>
        </div>`
      return
    }

    const { entries, myRank } = result
    const { user } = getAuthState()

    if (entries.length === 0) {
      body.innerHTML = `
        <div class="history-notice">
          <p>No missions have been submitted to the leaderboard yet. Complete a mission to be first!</p>
        </div>`
      return
    }

    const myRankNote = myRank !== null
      ? `<p class="lb-my-rank">Your current rank: <strong>#${escH(String(myRank))}</strong></p>`
      : user
        ? '<p class="lb-my-rank">Complete a mission to appear on the leaderboard.</p>'
        : '<p class="lb-my-rank">Sign in to appear on the leaderboard.</p>'

    body.innerHTML = `
      ${myRankNote}
      <div class="history-scroll">
        <table class="history-table leaderboard-table" role="grid">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Astronaut</th>
              <th scope="col">Best rating</th>
              <th scope="col">Missions</th>
              <th scope="col">Total score</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(e => renderEntry(e, e.user_id === (user?.id ?? ''))).join('')}
          </tbody>
        </table>
      </div>`
  }
}
