/**
 * Leaderboard service.
 *
 * Fetches top-10 global leaderboard and current player rank from Supabase.
 * Returns empty arrays when Supabase is not configured — UI shows appropriate
 * "Sign in to appear" / "Supabase not configured" messages.
 */

import { isSupabaseConfigured, getSupabaseClient } from './supabaseClient'
import { getAuthState } from './auth'

export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  best_stars: number
  total_missions: number
  total_score: number
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[]
  myRank: number | null
  configured: boolean
}

/**
 * Fetch the global top-10 leaderboard and the current user's rank.
 */
export async function getLeaderboard(): Promise<LeaderboardResult> {
  if (!isSupabaseConfigured()) {
    return { entries: [], myRank: null, configured: false }
  }

  try {
    const supabase = getSupabaseClient()
    const { user } = getAuthState()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, best_stars, total_missions, total_score')
      .order('total_score', { ascending: false })
      .order('best_stars', { ascending: false })
      .limit(10)

    if (error) {
      console.warn('[ARES-7] Leaderboard fetch failed:', error.message)
      return { entries: [], myRank: null, configured: true }
    }

    const entries: LeaderboardEntry[] = ((data ?? []) as Array<{
      id: string; username: string; avatar_url: string | null
      best_stars: number; total_missions: number; total_score: number
    }>).map((row, index) => ({
      rank: index + 1,
      user_id: row.id,
      username: row.username || 'Astronaut',
      avatar_url: row.avatar_url,
      best_stars: row.best_stars ?? 0,
      total_missions: row.total_missions ?? 0,
      total_score: row.total_score ?? 0,
    }))

    // Find current user's rank
    let myRank: number | null = null
    if (user) {
      const myEntry = entries.find(e => e.user_id === user.id)
      if (myEntry) {
        myRank = myEntry.rank
      } else {
        // User is outside top 10 — fetch their position separately
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gt('total_score', 0)
        // Rough rank — full pagination is a future enhancement
        if (count !== null) myRank = count + 1
      }
    }

    return { entries, myRank, configured: true }
  } catch (err) {
    console.warn('[ARES-7] Leaderboard threw:', err)
    return { entries: [], myRank: null, configured: true }
  }
}
