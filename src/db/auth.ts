/**
 * Supabase Auth wrapper.
 *
 * All methods are no-ops when Supabase is not configured — the game works as a
 * fully functional guest experience without any credentials.
 *
 * Session changes are broadcast via a custom DOM event 'ares7:auth-change'
 * so that UI panels can react without tight coupling.
 */

import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, getSupabaseClient } from './supabaseClient'

export type AuthState = {
  session: Session | null
  user: User | null
}

let _authState: AuthState = { session: null, user: null }

function broadcastAuthChange(state: AuthState): void {
  window.dispatchEvent(new CustomEvent('ares7:auth-change', { detail: state }))
}

/**
 * Initialize auth listener. Call once at app startup.
 * Returns the current session (null for guests).
 */
export async function initAuth(): Promise<AuthState> {
  if (!isSupabaseConfigured()) return _authState

  const supabase = getSupabaseClient()
  const { data } = await supabase.auth.getSession()
  _authState = { session: data.session, user: data.session?.user ?? null }

  supabase.auth.onAuthStateChange((_event, session) => {
    _authState = { session, user: session?.user ?? null }
    broadcastAuthChange(_authState)
  })

  return _authState
}

/** Get the current cached auth state (synchronous). */
export function getAuthState(): AuthState {
  return _authState
}

/** Sign in with an OAuth provider (GitHub, Google, etc.). Redirects the browser. */
export async function signInWithOAuth(provider: 'github' | 'google'): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.warn('[ARES-7] Supabase not configured — sign-in unavailable.')
    return
  }
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.href },
  })
  if (error) console.error('[ARES-7] Sign-in error:', error.message)
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  await supabase.auth.signOut()
}

/** Get a stable guest session ID from sessionStorage. */
export function getGuestSessionId(): string {
  const key = 'ares7.guestSessionId'
  let id: string | null = null
  try { id = sessionStorage.getItem(key) } catch { /* ignore */ }
  if (!id) {
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    id = 'guest-' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    try { sessionStorage.setItem(key, id) } catch { /* ignore */ }
  }
  return id
}
