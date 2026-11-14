/**
 * Mission persistence — save completed missions to Supabase.
 *
 * Gracefully degrades: if Supabase is not configured, buildMissionRecord() and
 * buildSolRecords() still work (they are pure functions tested without DB).
 * saveMission() is a no-op when unconfigured, so game-over flow never breaks.
 *
 * Score computation (for anti-cheat):
 *   The final_score stored here uses the same missionStars() thresholds from
 *   the sim engine. The Edge Function can re-verify scores from mission_sols rows.
 */

import type { MissionState, SolResult, Allocation } from '../sim/engine'
import type { SiteKey } from '../sim/scenarios'
import { missionStars } from '../sim/engine'
import { isSupabaseConfigured, getSupabaseClient } from './supabaseClient'
import { getAuthState, getGuestSessionId } from './auth'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MissionRecord {
  user_id: string | null
  session_id: string
  mission_mode: 'campaign' | 'practice'
  mission_seed: string
  landing_site: SiteKey
  total_sols: number
  final_crew_health: number
  final_food: number
  final_oxygen_water: number
  cumulative_radiation: number
  remaining_battery: number
  final_score: number
  stars: 1 | 2 | 3
  completed_at: string
}

export interface SolRecord {
  sol_number: number
  shield_comms_allocation: number
  bio_dome_allocation: number
  habitat_allocation: number
  available_power: number
  radiation_level: number
  crew_health: number
  food_level: number
  oxygen_water_level: number
  battery_level: number
}

export interface MissionSummary {
  id: string
  mission_mode: 'campaign' | 'practice'
  mission_seed: string
  landing_site: SiteKey
  total_sols: number
  final_crew_health: number
  final_food: number
  final_oxygen_water: number
  cumulative_radiation: number
  final_score: number
  stars: 1 | 2 | 3
  completed_at: string
}

// ─── Pure builder functions (testable without DB) ────────────────────────────

/**
 * Build the mission record from game state. Pure function — no side effects.
 * final_score encodes the star rating as an integer (1–3).
 */
export function buildMissionRecord(
  finalState: MissionState,
  results: SolResult[],
  mode: 'campaign' | 'practice',
  seed: string,
  site: SiteKey,
): MissionRecord {
  const { user, session } = getAuthState()
  const stars = missionStars(finalState)
  return {
    user_id: user?.id ?? null,
    session_id: user ? (session?.access_token?.slice(0, 32) ?? getGuestSessionId()) : getGuestSessionId(),
    mission_mode: mode,
    mission_seed: seed,
    landing_site: site,
    total_sols: results.length,
    final_crew_health: Math.round(finalState.crewHealth * 100) / 100,
    final_food: Math.round(finalState.food * 100) / 100,
    final_oxygen_water: Math.round(finalState.o2Water * 100) / 100,
    cumulative_radiation: Math.round(finalState.cumRad * 1000) / 1000,
    remaining_battery: finalState.battery,
    final_score: stars,
    stars,
    completed_at: new Date().toISOString(),
  }
}

/**
 * Build per-Sol records from the results array. Pure function.
 */
export function buildSolRecords(results: SolResult[]): SolRecord[] {
  return results.map((result, index) => ({
    sol_number: index + 1,
    shield_comms_allocation: result.allocation.shield,
    bio_dome_allocation: result.allocation.bio,
    habitat_allocation: result.allocation.hab,
    available_power: result.available,
    radiation_level: Math.round(result.dose * 1000) / 1000,
    crew_health: Math.round(result.state.crewHealth * 100) / 100,
    food_level: Math.round(result.state.food * 100) / 100,
    oxygen_water_level: Math.round(result.state.o2Water * 100) / 100,
    battery_level: result.state.battery,
  }))
}

// ─── Database operations ─────────────────────────────────────────────────────

/**
 * Save a completed mission to Supabase.
 * No-ops silently when Supabase is not configured.
 * Does NOT throw on failure — always fire-and-forget.
 */
export async function saveMission(
  finalState: MissionState,
  results: SolResult[],
  mode: 'campaign' | 'practice',
  seed: string,
  site: SiteKey,
  _allocation: Allocation, // kept for future use
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null

  const record = buildMissionRecord(finalState, results, mode, seed, site)
  const solRecords = buildSolRecords(results)

  try {
    const supabase = getSupabaseClient()

    const { data: missionData, error: missionError } = await supabase
      .from('missions')
      .insert(record)
      .select('id')
      .single()

    if (missionError) {
      console.warn('[ARES-7] Failed to save mission:', missionError.message)
      return null
    }

    const missionId: string = (missionData as { id: string }).id

    const solRows = solRecords.map(sol => ({ ...sol, mission_id: missionId }))
    const { error: solError } = await supabase.from('mission_sols').insert(solRows)
    if (solError) {
      console.warn('[ARES-7] Failed to save Sol records:', solError.message)
      // Mission is saved — partial failure is logged, not surfaced to user
    }

    // Update profile totals (upsert — creates profile if first mission)
    const { user } = getAuthState()
    if (user) {
      await supabase.rpc('increment_profile_totals', {
        p_user_id: user.id,
        p_stars: record.stars,
      }).then(({ error }) => {
        if (error) console.warn('[ARES-7] Profile update failed:', error.message)
      })
    }

    return missionId
  } catch (err) {
    console.warn('[ARES-7] Mission save threw unexpectedly:', err)
    return null
  }
}

/**
 * Retrieve mission history for the current user or guest session.
 * Returns an empty array when Supabase is not configured.
 */
export async function getMissionHistory(): Promise<MissionSummary[]> {
  if (!isSupabaseConfigured()) return []

  try {
    const supabase = getSupabaseClient()
    const { user } = getAuthState()
    const sessionId = getGuestSessionId()

    let query = supabase
      .from('missions')
      .select('id, mission_mode, mission_seed, landing_site, total_sols, final_crew_health, final_food, final_oxygen_water, cumulative_radiation, final_score, stars, completed_at')
      .order('completed_at', { ascending: false })
      .limit(10)

    if (user) {
      query = query.eq('user_id', user.id)
    } else {
      query = query.eq('session_id', sessionId)
    }

    const { data, error } = await query
    if (error) {
      console.warn('[ARES-7] History fetch failed:', error.message)
      return []
    }
    return (data ?? []) as MissionSummary[]
  } catch (err) {
    console.warn('[ARES-7] History fetch threw:', err)
    return []
  }
}
