/**
 * NASA DONKI API client.
 *
 * Routing strategy:
 *   1. If VITE_SUPABASE_URL is set → call the Supabase Edge Function proxy.
 *      The private NASA_API_KEY lives only on the server; it never reaches the browser.
 *   2. Otherwise → call NASA DONKI directly with VITE_NASA_API_KEY (or DEMO_KEY).
 *      DEMO_KEY is intentionally public and rate-limited; suitable for GitHub Pages.
 *
 * All results are cached by nasaCache.ts (30-minute TTL, sessionStorage-backed).
 * Failed requests return null; callers should fall back to saved offline data.
 */

import type { NasaFlare, NasaSep, NasaCme } from './nasaNormaliser'
import { normaliseFLR, normaliseSEP, normaliseCME } from './nasaNormaliser'
import { getCached, setCached } from './nasaCache'

const DONKI_BASE = 'https://api.nasa.gov/DONKI'
const REQUEST_TIMEOUT_MS = 10_000

export type DonkiEventType = 'FLR' | 'SEP' | 'CME'

export interface SpaceWeatherData {
  flares: NasaFlare[]
  sep: NasaSep[]
  cme: NasaCme[]
  fetchedAt: string
  source: 'edge-function' | 'direct' | 'cache'
}

function buildDateRange(daysBack = 30): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date(end.getTime() - daysBack * 86_400_000)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

async function fetchWithTimeout(url: string, timeoutMs = REQUEST_TIMEOUT_MS, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch a single DONKI endpoint directly (fallback path). */
async function fetchDonkiDirect(
  type: DonkiEventType,
  startDate: string,
  endDate: string,
  apiKey: string,
): Promise<unknown> {
  const url = `${DONKI_BASE}/${type}?startDate=${startDate}&endDate=${endDate}&api_key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`DONKI ${type} ${response.status} ${response.statusText}`)
  return response.json()
}

/** Fetch via the Supabase Edge Function proxy (preferred path, keeps key server-side). */
async function fetchViaEdgeFunction(
  type: DonkiEventType,
  startDate: string,
  endDate: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<unknown> {
  const url = `${supabaseUrl}/functions/v1/nasa-space-weather?type=${type}&startDate=${startDate}&endDate=${endDate}`
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Edge function ${type} ${response.status}: ${body}`)
  }
  const json = await response.json() as { data?: unknown; error?: string }
  if (json.error) throw new Error(`Edge function returned error: ${json.error}`)
  return json.data ?? json
}

/**
 * Fetch all space weather event types (FLR, SEP, CME) for the last `daysBack` days.
 * Results are cached; pass `forceRefresh = true` to bypass the cache.
 */
export async function fetchSpaceWeather(
  daysBack = 30,
  forceRefresh = false,
): Promise<SpaceWeatherData | null> {
  const { startDate, endDate } = buildDateRange(daysBack)
  const cacheKey = `space-weather:${startDate}:${endDate}`

  if (!forceRefresh) {
    const cached = getCached<SpaceWeatherData>(cacheKey)
    if (cached) return { ...cached, source: 'cache' }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const nasaKey = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY'
  const useProxy = Boolean(supabaseUrl && anonKey)

  try {
    let rawFLR: unknown, rawSEP: unknown, rawCME: unknown
    const source: SpaceWeatherData['source'] = useProxy ? 'edge-function' : 'direct'

    if (useProxy) {
      ;[rawFLR, rawSEP, rawCME] = await Promise.all([
        fetchViaEdgeFunction('FLR', startDate, endDate, supabaseUrl, anonKey),
        fetchViaEdgeFunction('SEP', startDate, endDate, supabaseUrl, anonKey),
        fetchViaEdgeFunction('CME', startDate, endDate, supabaseUrl, anonKey),
      ])
    } else {
      ;[rawFLR, rawSEP, rawCME] = await Promise.all([
        fetchDonkiDirect('FLR', startDate, endDate, nasaKey),
        fetchDonkiDirect('SEP', startDate, endDate, nasaKey),
        fetchDonkiDirect('CME', startDate, endDate, nasaKey),
      ])
    }

    const data: SpaceWeatherData = {
      flares: normaliseFLR(rawFLR),
      sep: normaliseSEP(rawSEP),
      cme: normaliseCME(rawCME),
      fetchedAt: new Date().toISOString(),
      source,
    }

    setCached(cacheKey, data)
    return data
  } catch (err) {
    console.warn('[ARES-7] NASA fetch failed; using saved offline data.', err)
    return null
  }
}

/**
 * Fetch FLR only (used by the existing syncDonki flow in main.ts).
 * Returns the most recent flare sorted by beginTime descending, or null.
 */
export async function fetchLatestFlare(daysBack = 30): Promise<NasaFlare | null> {
  const data = await fetchSpaceWeather(daysBack)
  if (!data || data.flares.length === 0) return null
  return [...data.flares]
    .filter(f => f.beginTime !== null)
    .sort((a, b) => String(b.beginTime).localeCompare(String(a.beginTime)))[0] ?? null
}
