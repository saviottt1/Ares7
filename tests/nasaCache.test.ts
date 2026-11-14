/**
 * Tests for nasaCache — two-layer cache (in-memory + sessionStorage mock).
 *
 * Vitest runs in Node; sessionStorage is not available, so the memory layer
 * must still function correctly and storage failures must be silent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock sessionStorage before importing the module so the module's
// IIFE-level code that might call sessionStorage still works.
const mockStorage: Record<string, string> = {}
const sessionStorageMock = {
  getItem: vi.fn((k: string) => mockStorage[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { mockStorage[k] = v }),
  removeItem: vi.fn((k: string) => { delete mockStorage[k] }),
  get length() { return Object.keys(mockStorage).length },
  key: vi.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
  clear: vi.fn(() => { for (const k of Object.keys(mockStorage)) delete mockStorage[k] }),
}

vi.stubGlobal('sessionStorage', sessionStorageMock)

import { getCached, setCached, evictCached, clearAllNasaCache } from '../src/api/nasaCache'

beforeEach(() => {
  sessionStorageMock.clear()
  clearAllNasaCache()
  vi.clearAllMocks()
})

describe('getCached / setCached', () => {
  it('returns null on cache miss', () => {
    expect(getCached('no-such-key')).toBeNull()
  })

  it('returns stored value immediately after setting', () => {
    const data = { flares: [{ id: 'flr-1' }], count: 42 }
    setCached('test-key', data)
    const result = getCached<typeof data>('test-key')
    expect(result).toEqual(data)
  })

  it('returns null for expired entries', () => {
    setCached('exp-key', { x: 1 }, -1) // already expired
    expect(getCached('exp-key')).toBeNull()
  })

  it('stores different types (string, number, array)', () => {
    setCached('str', 'hello')
    setCached('num', 99)
    setCached('arr', [1, 2, 3])
    expect(getCached('str')).toBe('hello')
    expect(getCached('num')).toBe(99)
    expect(getCached<number[]>('arr')).toEqual([1, 2, 3])
  })

  it('overwrites existing entries', () => {
    setCached('k', 'first')
    setCached('k', 'second')
    expect(getCached('k')).toBe('second')
  })
})

describe('evictCached', () => {
  it('removes an existing entry', () => {
    setCached('evict-me', { data: true })
    evictCached('evict-me')
    expect(getCached('evict-me')).toBeNull()
  })

  it('is a no-op for non-existent key', () => {
    expect(() => evictCached('ghost-key')).not.toThrow()
  })
})

describe('clearAllNasaCache', () => {
  it('removes all entries', () => {
    setCached('a', 1)
    setCached('b', 2)
    setCached('c', 3)
    clearAllNasaCache()
    expect(getCached('a')).toBeNull()
    expect(getCached('b')).toBeNull()
    expect(getCached('c')).toBeNull()
  })
})

describe('sessionStorage fallback', () => {
  it('populates sessionStorage when setting', () => {
    setCached('sw-key', { event: 'FLR' })
    expect(sessionStorageMock.setItem).toHaveBeenCalled()
  })

  it('survives sessionStorage.getItem throwing', () => {
    sessionStorageMock.getItem.mockImplementationOnce(() => { throw new Error('quota') })
    expect(() => getCached('safe-key')).not.toThrow()
    expect(getCached('safe-key')).toBeNull()
  })

  it('survives sessionStorage.setItem throwing', () => {
    sessionStorageMock.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    expect(() => setCached('quota-key', { x: 1 })).not.toThrow()
    // Memory layer still works even if storage failed
    expect(getCached('quota-key')).toEqual({ x: 1 })
  })
})
