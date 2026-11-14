/**
 * Supabase JavaScript client singleton.
 *
 * Uses VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the anon key).
 * The service-role key is NEVER used in the browser — only in Edge Functions.
 *
 * isSupabaseConfigured() must be checked before any DB call.
 * All database modules guard on this — the game works fully without credentials.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  return Boolean(url && key && url.startsWith('https://') && key.length > 10)
}

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  _client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return _client
}
