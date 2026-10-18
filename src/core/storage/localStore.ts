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
