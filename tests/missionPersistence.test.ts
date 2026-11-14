/**
 * Tests for missionPersistence pure builder functions.
 *
 * buildMissionRecord() and buildSolRecords() are pure functions that do not
 * touch the database — they can be tested without any Supabase connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMissionRecord, buildSolRecords } from '../src/db/missionPersistence'
import type { MissionState, SolResult } from '../src/sim/engine'

// Mock auth so tests run without Supabase
vi.mock('../src/db/auth', () => ({
  getAuthState: () => ({ session: null, user: null }),
  getGuestSessionId: () => 'guest-test-session',
}))

// Mock supabaseClient so the import never blows up in Node
vi.mock('../src/db/supabaseClient', () => ({
  isSupabaseConfigured: () => false,
  getSupabaseClient: () => { throw new Error('Not configured') },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<MissionState> = {}): MissionState {
  return {
    o2Water: 80,
    food: 75,
    crewHealth: 90,
    cumRad: 2.1,
    battery: 10,
    replays: 0,
    ...overrides,
  }
}

function makeSolResult(solOverrides: Partial<SolResult> = {}): SolResult {
  return {
    state: makeState(),
    allocation: { shield: 30, bio: 25, hab: 20 },
    total: 75,
    available: 100,
    batteryDraw: 0,
    dose: 0.3,
    trace: [],
    ...solOverrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── buildMissionRecord ────────────────────────────────────────────────────────
describe('buildMissionRecord', () => {
  it('produces a record with correct mode', () => {
    const record = buildMissionRecord(makeState(), [makeSolResult()], 'campaign', 'ARES7-1', 'jezero')
    expect(record.mission_mode).toBe('campaign')
  })

  it('assigns stars = 3 for excellent state (all ≥65, cumRad ≤5.5)', () => {
    const state = makeState({ o2Water: 90, food: 90, crewHealth: 90, cumRad: 1.0 })
    const record = buildMissionRecord(state, [makeSolResult()], 'practice', 'SEED-1', 'elysium')
    expect(record.stars).toBe(3)
    expect(record.final_score).toBe(3)
  })

  it('assigns stars = 2 for moderate state', () => {
    const state = makeState({ o2Water: 60, food: 60, crewHealth: 60, cumRad: 6.0 })
    const record = buildMissionRecord(state, [makeSolResult()], 'campaign', 'ARES7-1', 'jezero')
    expect(record.stars).toBe(2)
  })

  it('assigns stars = 1 for poor state (any stock <50 or cumRad >6.5)', () => {
    const state = makeState({ o2Water: 20, food: 90, crewHealth: 90, cumRad: 1.0 })
    const record = buildMissionRecord(state, [makeSolResult()], 'campaign', 'ARES7-1', 'jezero')
    expect(record.stars).toBe(1)
  })

  it('stores guest session when user is null', () => {
    const record = buildMissionRecord(makeState(), [makeSolResult()], 'campaign', 'S', 'jezero')
    expect(record.user_id).toBeNull()
    expect(record.session_id).toBe('guest-test-session')
  })

  it('rounds numeric fields to limited decimal places', () => {
    const state = makeState({ cumRad: 2.123456789 })
    const record = buildMissionRecord(state, [makeSolResult()], 'campaign', 'S', 'jezero')
    // cumRad rounded to 3 decimal places
    expect(String(record.cumulative_radiation)).toMatch(/^\d+\.\d{1,3}$/)
  })

  it('total_sols matches results array length', () => {
    const results = [makeSolResult(), makeSolResult(), makeSolResult()]
    const record = buildMissionRecord(makeState(), results, 'campaign', 'S', 'jezero')
    expect(record.total_sols).toBe(3)
  })
})

// ── buildSolRecords ───────────────────────────────────────────────────────────
describe('buildSolRecords', () => {
  it('returns empty array for empty results', () => {
    expect(buildSolRecords([])).toEqual([])
  })

  it('assigns sol_number starting from 1', () => {
    const results = [makeSolResult(), makeSolResult()]
    const sols = buildSolRecords(results)
    expect(sols[0].sol_number).toBe(1)
    expect(sols[1].sol_number).toBe(2)
  })

  it('maps allocation fields correctly', () => {
    const result = makeSolResult({ allocation: { shield: 40, bio: 20, hab: 15 } })
    const [sol] = buildSolRecords([result])
    expect(sol.shield_comms_allocation).toBe(40)
    expect(sol.bio_dome_allocation).toBe(20)
    expect(sol.habitat_allocation).toBe(15)
  })

  it('maps state health fields correctly', () => {
    const state = makeState({ crewHealth: 72.5, food: 65.3, o2Water: 88.1, battery: 5 })
    const result = makeSolResult({ state })
    const [sol] = buildSolRecords([result])
    expect(sol.crew_health).toBeCloseTo(72.5, 1)
    expect(sol.food_level).toBeCloseTo(65.3, 1)
    expect(sol.oxygen_water_level).toBeCloseTo(88.1, 1)
    expect(sol.battery_level).toBe(5)
  })

  it('maps radiation level', () => {
    const result = makeSolResult({ dose: 0.456789 })
    const [sol] = buildSolRecords([result])
    expect(sol.radiation_level).toBeCloseTo(0.457, 3)
  })

  it('handles full 7-Sol campaign results', () => {
    const results = Array.from({ length: 7 }, () => makeSolResult())
    const sols = buildSolRecords(results)
    expect(sols).toHaveLength(7)
    expect(sols[6].sol_number).toBe(7)
  })
})
