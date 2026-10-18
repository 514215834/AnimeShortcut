/**
 * 极简 IndexedDB 封装（技术架构设计 §5.1）。
 * 环境不支持（如 Node 测试）时自动回退内存 Map，接口不变。
 */

const DB_NAME = 'animeshortcut'
const DB_VERSION = 1
export const STORES = ['subscriptions', 'history'] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('subscriptions')) {
          db.createObjectStore('subscriptions', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'key' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

// 内存回退
const memStores = new Map<string, Map<string, unknown>>()

function memStore(name: StoreName): Map<string, unknown> {
  let m = memStores.get(name)
  if (!m) {
    m = new Map()
    memStores.set(name, m)
  }
  return m
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openDb()
  if (!db) return (memStore(store).get(key) as T | undefined) ?? null
  const tx = db.transaction(store, 'readonly')
  const v = await reqAsPromise(tx.objectStore(store).get(key))
  return (v as T | undefined) ?? null
}

export async function idbPut(store: StoreName, value: { key: string }): Promise<void> {
  const db = await openDb()
  if (!db) {
    memStore(store).set(value.key, value)
    return
  }
  const tx = db.transaction(store, 'readwrite')
  await reqAsPromise(tx.objectStore(store).put(value))
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memStore(store).delete(key)
    return
  }
  const tx = db.transaction(store, 'readwrite')
  await reqAsPromise(tx.objectStore(store).delete(key))
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  if (!db) return Array.from(memStore(store).values()) as T[]
  const tx = db.transaction(store, 'readonly')
  return (await reqAsPromise(tx.objectStore(store).getAll())) as T[]
}
