import { readJson, writeJson } from '../storage/localStore'

export interface CacheEntry<T> {
  data: T
  cachedAt: number
  expireAt: number
}

const PREFIX = 'cache:'
const mem = new Map<string, CacheEntry<unknown>>()

/** 取未过期的缓存（内存优先，本地兜底） */
export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const now = Date.now()
  const m = mem.get(key)
  if (m) {
    if (m.expireAt > now) return m as CacheEntry<T>
    mem.delete(key)
  }
  const l = readJson<CacheEntry<T>>(PREFIX + key)
  if (l && l.expireAt > now) {
    mem.set(key, l)
    return l
  }
  return null
}

/** 取已过期但存在的缓存（断网降级用），可附带过期时长 */
export function cacheGetStale<T>(key: string): CacheEntry<T> | null {
  const l = readJson<CacheEntry<T>>(PREFIX + key)
  if (l) return l
  return null
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): CacheEntry<T> {
  const now = Date.now()
  const entry: CacheEntry<T> = { data, cachedAt: now, expireAt: now + ttlMs }
  mem.set(key, entry)
  writeJson(PREFIX + key, entry)
  return entry
}

export function cacheClearAll(): void {
  mem.clear()
}
