/**
 * NASA DONKI data normaliser.
 *
 * Pure functions — no network calls, fully testable.
 * Converts raw NASA DONKI JSON into typed internal models.
 * Missing optional fields are normalised to null, never throw.
 *
 * Provenance labelling follows the existing ARES-7 convention:
 *   'REAL NASA MEASUREMENT' — identifiers, times, classes from DONKI
 *   'SCALED PHYSICS MODEL'  — game SEP bucket derived from class
 *   'NORMALIZED GAME UNIT'  — purely game values
 */

// ─── Raw NASA shapes ──────────────────────────────────────────────────────────

export interface RawFLR {
  flrID?: string
  beginTime?: string
  peakTime?: string
  endTime?: string
  classType?: string
  sourceLocation?: string
  activeRegionNum?: number | null
  linkedEvents?: Array<{ activityID?: string }> | null
  [key: string]: unknown
}

export interface RawSEP {
  sepID?: string
  eventTime?: string
  instruments?: Array<{ displayName?: string }> | null
  linkedEvents?: Array<{ activityID?: string }> | null
  [key: string]: unknown
}

export interface RawCME {
  activityID?: string
  startTime?: string
  cmeAnalyses?: Array<{
    speed?: number | null
    type?: string
    latitude?: number | null
    longitude?: number | null
    halfAngle?: number | null
  }> | null
  linkedEvents?: Array<{ activityID?: string }> | null
  [key: string]: unknown
}

// ─── Normalised internal models ───────────────────────────────────────────────

export interface NasaFlare {
  /** DONKI flrID — REAL NASA MEASUREMENT */
  flrId: string
  classType: string
  classLetter: string
  classMagnitude: number
  beginTime: string | null
  peakTime: string | null
  endTime: string | null
  sourceLocation: string | null
  activeRegionNum: number | null
  linkedEventIds: string[]
  /**
   * Game SEP bucket derived from class — SCALED PHYSICS MODEL.
   * X-ray class is NOT a measured proton dose; this is a simplified
   * educational game abstraction only.
   */
  gameSepBucket: number
}

export interface NasaSep {
  /** DONKI sepID — REAL NASA MEASUREMENT */
  sepId: string
  eventTime: string | null
  instruments: string[]
  linkedEventIds: string[]
}

export interface NasaCme {
  /** DONKI activityID — REAL NASA MEASUREMENT */
  activityId: string
  startTime: string | null
  speed: number | null
  type: string | null
  latitude: number | null
  longitude: number | null
  linkedEventIds: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return null
}

function safeNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

function linkedIds(events: Array<{ activityID?: string }> | null | undefined): string[] {
  if (!Array.isArray(events)) return []
  return events
    .map(e => safeString(e.activityID))
    .filter((id): id is string => id !== null)
}

/**
 * Derive game SEP bucket from DONKI class type.
 *
 * IMPORTANT EDUCATIONAL DISCLAIMER: X-ray flare class does NOT directly
 * determine the solar energetic particle (proton) dose received in a habitat.
 * These buckets are a simplified game abstraction for educational purposes only.
 * Real space weather decisions require particle flux measurements, not class alone.
 */
export function classToSepBucket(classType: string): number {
  const letter = classType.charAt(0).toUpperCase()
  const magnitudeMatch = classType.match(/^[A-Za-z](\d+(?:\.\d+)?)/)
  const magnitude = magnitudeMatch ? Number(magnitudeMatch[1]) : 0

  if (letter === 'X') {
    if (magnitude >= 9) return 9.5
    if (magnitude >= 5) return 7.5
    if (magnitude >= 1) return 5.0
    return 3.0
  }
  if (letter === 'M' && magnitude >= 5) return 3.8
  if (letter === 'M') return 2.0
  return 1.0 // A, B, C, or unknown → quiet baseline
}

// ─── Normaliser functions ─────────────────────────────────────────────────────

/**
 * Normalise a raw FLR array from NASA DONKI.
 * Records without a valid flrID are silently dropped.
 */
export function normaliseFLR(raw: unknown): NasaFlare[] {
  if (!Array.isArray(raw)) return []
  const results: NasaFlare[] = []
  for (const item of raw as RawFLR[]) {
    const flrId = safeString(item.flrID)
    if (!flrId) continue // ID is required; skip incomplete records
    const classType = safeString(item.classType) ?? 'Unknown'
    results.push({
      flrId,
      classType,
      classLetter: classType.charAt(0).toUpperCase(),
      classMagnitude: (() => {
        const m = classType.match(/^[A-Za-z](\d+(?:\.\d+)?)/)
        return m ? Number(m[1]) : 0
      })(),
      beginTime: safeString(item.beginTime),
      peakTime: safeString(item.peakTime),
      endTime: safeString(item.endTime),
      sourceLocation: safeString(item.sourceLocation),
      activeRegionNum: safeNumber(item.activeRegionNum),
      linkedEventIds: linkedIds(item.linkedEvents),
      gameSepBucket: classToSepBucket(classType),
    })
  }
  return results
}

/**
 * Normalise a raw SEP array from NASA DONKI.
 * Records without a valid sepID are silently dropped.
 */
export function normaliseSEP(raw: unknown): NasaSep[] {
  if (!Array.isArray(raw)) return []
  const results: NasaSep[] = []
  for (const item of raw as RawSEP[]) {
    const sepId = safeString(item.sepID)
    if (!sepId) continue
    results.push({
      sepId,
      eventTime: safeString(item.eventTime),
      instruments: Array.isArray(item.instruments)
        ? item.instruments
            .map(inst => safeString(inst.displayName))
            .filter((n): n is string => n !== null)
        : [],
      linkedEventIds: linkedIds(item.linkedEvents),
    })
  }
  return results
}

/**
 * Normalise a raw CME array from NASA DONKI.
 * Records without a valid activityID are silently dropped.
 */
export function normaliseCME(raw: unknown): NasaCme[] {
  if (!Array.isArray(raw)) return []
  const results: NasaCme[] = []
  for (const item of raw as RawCME[]) {
    const activityId = safeString(item.activityID)
    if (!activityId) continue
    // Use the best-available analysis (first entry with a speed value, fallback to first)
    const analyses = Array.isArray(item.cmeAnalyses) ? item.cmeAnalyses : []
    const best = analyses.find(a => a.speed != null) ?? analyses[0] ?? null
    results.push({
      activityId,
      startTime: safeString(item.startTime),
      speed: best ? safeNumber(best.speed) : null,
      type: best ? safeString(best.type) : null,
      latitude: best ? safeNumber(best.latitude) : null,
      longitude: best ? safeNumber(best.longitude) : null,
      linkedEventIds: linkedIds(item.linkedEvents),
    })
  }
  return results
}
