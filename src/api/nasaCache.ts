/**
 * NASA API response cache.
 *
 * Two-layer: in-memory Map (fast) + sessionStorage (survives soft navigation).
 * TTL defaults to 30 minutes. Stale or corrupt entries are silently evicted.
 */

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const STORAGE_PREFIX = 'ares7.nasa.'

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

// In-memory layer
const memCache = new Map<string, CacheEntry<unknown>>()

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`
}

/** Read from sessionStorage safely; returns null on any error. */
function readStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (typeof parsed.expiresAt !== 'number' || parsed.data === undefined) return null
    return parsed
  } catch {
    return null
  }
}

/** Write to sessionStorage safely; silently ignores quota errors. */
function writeStorage<T>(key: string, entry: CacheEntry<T>): void {
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch {
    // Quota exceeded or storage unavailable — in-memory cache still works
  }
}

/**
 * Retrieve a cached value.
 * Returns null on cache miss or expired entry.
 */
export function getCached<T>(key: string): T | null {
  const now = Date.now()

  // Check in-memory first
  const mem = memCache.get(key)
  if (mem) {
    if (now < mem.expiresAt) return mem.data as T
    memCache.delete(key)
  }

  // Fall back to sessionStorage
  const stored = readStorage<T>(key)
  if (!stored) return null
  if (now >= stored.expiresAt) {
    try { sessionStorage.removeItem(storageKey(key)) } catch { /* ignore */ }
    return null
  }

  // Warm the memory layer
  memCache.set(key, stored)
  return stored.data
}

/**
 * Store a value in the cache with the default TTL.
 */
export function setCached<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void {
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs }
  memCache.set(key, entry)
  writeStorage(key, entry)
}

/**
 * Evict a specific key from both layers.
 */
export function evictCached(key: string): void {
  memCache.delete(key)
  try { sessionStorage.removeItem(storageKey(key)) } catch { /* ignore */ }
}

/**
 * Clear all ARES-7 NASA cache entries from both layers.
 */
export function clearAllNasaCache(): void {
  memCache.clear()
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(STORAGE_PREFIX)) keysToRemove.push(k)
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
