/**
 * Supabase Edge Function: nasa-space-weather
 *
 * Secure proxy for the NASA DONKI API. The NASA_API_KEY secret is stored
 * server-side and NEVER sent to the browser.
 *
 * Usage:
 *   GET /functions/v1/nasa-space-weather?type=FLR&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Query parameters:
 *   type       — FLR | SEP | CME  (required)
 *   startDate  — YYYY-MM-DD       (required)
 *   endDate    — YYYY-MM-DD       (required)
 *
 * Deploy:
 *   supabase functions deploy nasa-space-weather
 *   supabase secrets set NASA_API_KEY=your_real_key
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DONKI_BASE = 'https://api.nasa.gov/DONKI'
const ALLOWED_TYPES = new Set(['FLR', 'SEP', 'CME'])
const REQUEST_TIMEOUT_MS = 15_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  // Validate inputs
  if (!type || !ALLOWED_TYPES.has(type)) {
    return errorResponse(`Invalid type. Must be one of: ${[...ALLOWED_TYPES].join(', ')}`)
  }
  if (!startDate || !isValidDate(startDate)) {
    return errorResponse('Invalid startDate. Format: YYYY-MM-DD')
  }
  if (!endDate || !isValidDate(endDate)) {
    return errorResponse('Invalid endDate. Format: YYYY-MM-DD')
  }
  if (new Date(startDate) > new Date(endDate)) {
    return errorResponse('startDate must be before or equal to endDate')
  }

  // Get server-side NASA API key — never sent to browser
  const nasaKey = Deno.env.get('NASA_API_KEY')
  if (!nasaKey) {
    console.error('[nasa-space-weather] NASA_API_KEY secret is not set')
    return errorResponse('Server configuration error', 500)
  }

  const donkiUrl = `${DONKI_BASE}/${type}?startDate=${startDate}&endDate=${endDate}&api_key=${encodeURIComponent(nasaKey)}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let donkiResponse: Response
    try {
      donkiResponse = await fetch(donkiUrl, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (!donkiResponse.ok) {
      const body = await donkiResponse.text().catch(() => '')
      console.warn(`[nasa-space-weather] DONKI ${type} returned ${donkiResponse.status}: ${body}`)
      return errorResponse(`NASA DONKI returned ${donkiResponse.status}`, 502)
    }

    const data = await donkiResponse.json()

    // Persist new events to the database (best-effort, don't fail the response)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceKey && Array.isArray(data)) {
        const supabase = createClient(supabaseUrl, serviceKey)
        const rows = data
          .filter((item: Record<string, unknown>) => {
            const id = item.flrID ?? item.sepID ?? item.activityID
            return typeof id === 'string' && id.length > 0
          })
          .map((item: Record<string, unknown>) => ({
            external_event_id: (item.flrID ?? item.sepID ?? item.activityID) as string,
            event_type: type,
            event_class: (item.classType as string | undefined) ?? null,
            event_start_time: (item.beginTime ?? item.eventTime ?? item.startTime) as string | null,
            event_peak_time: (item.peakTime as string | undefined) ?? null,
            event_end_time: (item.endTime as string | undefined) ?? null,
            source_location: (item.sourceLocation as string | undefined) ?? null,
            raw_data: item,
            fetched_at: new Date().toISOString(),
          }))
        if (rows.length > 0) {
          await supabase
            .from('nasa_space_weather')
            .upsert(rows, { onConflict: 'external_event_id', ignoreDuplicates: false })
        }
      }
    } catch (dbErr) {
      console.warn('[nasa-space-weather] DB persist failed (non-fatal):', dbErr)
    }

    return jsonResponse({ data, fetchedAt: new Date().toISOString() })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return errorResponse('NASA DONKI request timed out', 504)
    }
    console.error('[nasa-space-weather] Unexpected error:', err)
    return errorResponse('Internal server error', 500)
  }
})
