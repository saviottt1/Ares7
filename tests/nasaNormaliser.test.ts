/**
 * Tests for nasaNormaliser — pure functions, no network calls.
 */
import { describe, it, expect } from 'vitest'
import {
  normaliseFLR,
  normaliseSEP,
  normaliseCME,
  classToSepBucket,
  type RawFLR,
  type RawSEP,
  type RawCME,
} from '../src/api/nasaNormaliser'

// ── classToSepBucket ──────────────────────────────────────────────────────────
describe('classToSepBucket', () => {
  it('returns 1.0 for quiet/A/B/C classes', () => {
    expect(classToSepBucket('A1.0')).toBe(1.0)
    expect(classToSepBucket('B5.2')).toBe(1.0)
    expect(classToSepBucket('C3.4')).toBe(1.0)
    expect(classToSepBucket('unknown')).toBe(1.0)
  })

  it('returns 2.0 for M-class below M5', () => {
    expect(classToSepBucket('M1.2')).toBe(2.0)
    expect(classToSepBucket('M4.9')).toBe(2.0)
  })

  it('returns 3.8 for M5+', () => {
    expect(classToSepBucket('M5.0')).toBe(3.8)
    expect(classToSepBucket('M9.3')).toBe(3.8)
  })

  it('returns 5.0 for X1–X4', () => {
    expect(classToSepBucket('X1.0')).toBe(5.0)
    expect(classToSepBucket('X4.9')).toBe(5.0)
  })

  it('returns 7.5 for X5–X8', () => {
    expect(classToSepBucket('X5.0')).toBe(7.5)
    expect(classToSepBucket('X8.9')).toBe(7.5)
  })

  it('returns 9.5 for X9+', () => {
    expect(classToSepBucket('X9.0')).toBe(9.5)
    expect(classToSepBucket('X28')).toBe(9.5)
  })
})

// ── normaliseFLR ──────────────────────────────────────────────────────────────
describe('normaliseFLR', () => {
  it('returns empty array for non-array input', () => {
    expect(normaliseFLR(null)).toEqual([])
    expect(normaliseFLR(undefined)).toEqual([])
    expect(normaliseFLR('string')).toEqual([])
    expect(normaliseFLR({})).toEqual([])
  })

  it('skips records without flrID', () => {
    const raw: RawFLR[] = [{ classType: 'M1.0' }, { flrID: '', classType: 'X1.0' }]
    expect(normaliseFLR(raw)).toHaveLength(0)
  })

  it('normalises a valid FLR record', () => {
    const raw: RawFLR[] = [{
      flrID: 'flr-2024-01',
      classType: 'X2.5',
      beginTime: '2024-01-15T10:30:00Z',
      peakTime: '2024-01-15T10:45:00Z',
      endTime: '2024-01-15T11:00:00Z',
      sourceLocation: 'N28W15',
      activeRegionNum: 13200,
      linkedEvents: [{ activityID: 'cme-2024-01' }],
    }]
    const result = normaliseFLR(raw)
    expect(result).toHaveLength(1)
    const flare = result[0]
    expect(flare.flrId).toBe('flr-2024-01')
    expect(flare.classType).toBe('X2.5')
    expect(flare.classLetter).toBe('X')
    expect(flare.classMagnitude).toBe(2.5)
    expect(flare.sourceLocation).toBe('N28W15')
    expect(flare.activeRegionNum).toBe(13200)
    expect(flare.linkedEventIds).toEqual(['cme-2024-01'])
    expect(flare.gameSepBucket).toBe(5.0) // X1–X4 bucket
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawFLR[] = [{ flrID: 'flr-min', classType: 'C1.0' }]
    const [result] = normaliseFLR(raw)
    expect(result.beginTime).toBeNull()
    expect(result.peakTime).toBeNull()
    expect(result.endTime).toBeNull()
    expect(result.sourceLocation).toBeNull()
    expect(result.activeRegionNum).toBeNull()
    expect(result.linkedEventIds).toEqual([])
  })

  it('normalises multiple valid records', () => {
    const raw: RawFLR[] = [
      { flrID: 'a', classType: 'M2.0' },
      { flrID: 'b', classType: 'X9.1' },
      { classType: 'C1.0' }, // missing ID — should be skipped
    ]
    const result = normaliseFLR(raw)
    expect(result).toHaveLength(2)
    expect(result[0].flrId).toBe('a')
    expect(result[1].gameSepBucket).toBe(9.5)
  })
})

// ── normaliseSEP ──────────────────────────────────────────────────────────────
describe('normaliseSEP', () => {
  it('returns empty for non-array', () => {
    expect(normaliseSEP(null)).toEqual([])
  })

  it('skips records without sepID', () => {
    const raw: RawSEP[] = [{ eventTime: '2024-01-01T00:00:00Z' }]
    expect(normaliseSEP(raw)).toHaveLength(0)
  })

  it('normalises a valid SEP record', () => {
    const raw: RawSEP[] = [{
      sepID: 'sep-2024-01',
      eventTime: '2024-01-15T12:00:00Z',
      instruments: [{ displayName: 'GOES-16 EPS' }, { displayName: 'ACE EPAM' }],
      linkedEvents: [{ activityID: 'flr-2024-01' }],
    }]
    const [result] = normaliseSEP(raw)
    expect(result.sepId).toBe('sep-2024-01')
    expect(result.instruments).toEqual(['GOES-16 EPS', 'ACE EPAM'])
    expect(result.linkedEventIds).toEqual(['flr-2024-01'])
  })
})

// ── normaliseCME ──────────────────────────────────────────────────────────────
describe('normaliseCME', () => {
  it('returns empty for non-array', () => {
    expect(normaliseCME([])).toEqual([])
  })

  it('skips records without activityID', () => {
    const raw: RawCME[] = [{ startTime: '2024-01-01T00:00:00Z' }]
    expect(normaliseCME(raw)).toHaveLength(0)
  })

  it('normalises a valid CME with analysis', () => {
    const raw: RawCME[] = [{
      activityID: 'cme-2024-01',
      startTime: '2024-01-15T11:00:00Z',
      cmeAnalyses: [
        { speed: null, type: 'S', latitude: null, longitude: null },
        { speed: 1250, type: 'C', latitude: 10, longitude: -15 },
      ],
      linkedEvents: [{ activityID: 'flr-2024-01' }],
    }]
    const [result] = normaliseCME(raw)
    expect(result.activityId).toBe('cme-2024-01')
    expect(result.speed).toBe(1250) // picks the entry with speed
    expect(result.type).toBe('C')
    expect(result.latitude).toBe(10)
    expect(result.longitude).toBe(-15)
    expect(result.linkedEventIds).toEqual(['flr-2024-01'])
  })

  it('handles CME with no analysis', () => {
    const raw: RawCME[] = [{ activityID: 'cme-min' }]
    const [result] = normaliseCME(raw)
    expect(result.speed).toBeNull()
    expect(result.type).toBeNull()
  })
})
