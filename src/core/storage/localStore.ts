const PREFIX = 'asc:'

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // 配额满或不可用：静默放弃（缓存类数据可丢）
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* 忽略 */
  }
}

export function keysWithPrefix(prefix: string): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX + prefix)) out.push(k)
    }
  } catch {
    /* 忽略 */
  }
  return out
}

/** 删除所有 `asc:<prefix>` 开头的键，返回删除数（插件卸载时的私有 KV / 缓存回收用） */
export function removeKeysWithPrefix(prefix: string): number {
  const target = PREFIX + prefix
  const hits: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(target)) hits.push(k)
    }
    for (const k of hits) localStorage.removeItem(k)
  } catch {
    /* 忽略 */
  }
  return hits.length
}
