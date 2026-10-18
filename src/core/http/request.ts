import { cacheGet, cacheGetStale, cacheSet } from './cache'
import { FetchError, type FetchErrorKind } from './errors'
import { channelsFor, setLastGoodChannel } from './proxyChain'

export interface RequestOptions {
  timeoutMs?: number // 默认 10s
  retries?: number // 通道全失败后的整体重试轮数，默认 0（通道回退已含冗余，避免长阻塞）
  headers?: Record<string, string>
  ttlMs?: number // 结果缓存时长（0 = 不缓存）
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

let fetchImpl: FetchLike = (...args) => fetch(...args)

/** 测试注入点：替换底层 fetch */
export function setFetcher(fn: FetchLike): void {
  fetchImpl = fn
}

const DEFAULT_TIMEOUT = 10_000
const MAX_TIMEOUT = 30_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  channel: string,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new FetchError('timeout', `请求超时（${channel}）`, { channel, cause: e })
    }
    throw new FetchError('network', `网络错误（${channel}）`, { channel, cause: e })
  } finally {
    clearTimeout(timer)
  }
}

async function readResponse(res: Response, channel: string): Promise<string> {
  if (!res.ok) {
    const kind: FetchErrorKind = res.status === 429 ? 'proxy' : 'http-status'
    throw new FetchError(kind, `HTTP ${res.status}（${channel}）`, { status: res.status, channel })
  }
  const text = await res.text().catch((e: unknown) => {
    throw new FetchError('network', `响应读取失败（${channel}）`, { channel, cause: e })
  })
  return text
}

async function runPipeline(
  url: string,
  opts: RequestOptions,
): Promise<string> {
  const timeoutMs = Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT, MAX_TIMEOUT)
  const retries = opts.retries ?? 0
  const channels = channelsFor()
  let lastError: FetchError = new FetchError('network', '未发起请求')

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * attempt)
    for (const ch of channels) {
      try {
        const res = await fetchWithTimeout(ch.wrap(url), {
          headers: opts.headers,
          redirect: 'follow',
        }, timeoutMs, ch.name)
        const text = await readResponse(res, ch.name)
        setLastGoodChannel(ch.name)
        return text
      } catch (e) {
        lastError =
          e instanceof FetchError ? e : new FetchError('network', String(e), { channel: ch.name })
      }
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function cacheKey(url: string, method: string): string {
  return `req:${method}:${url}`
}

/** 请求并解析 JSON；ttlMs>0 时先读缓存、成功后写缓存 */
export async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const key = cacheKey(url, 'GET')
  if (opts.ttlMs && opts.ttlMs > 0) {
    const hit = cacheGet<T>(key)
    if (hit) return hit.data
  }
  const text = await runPipeline(url, opts)
  let data: T
  try {
    data = JSON.parse(text) as T
  } catch (e) {
    // 代理可能返回 200 + 错误页
    throw new FetchError('parse', '响应不是有效 JSON', { cause: e })
  }
  if (opts.ttlMs && opts.ttlMs > 0) cacheSet(key, data, opts.ttlMs)
  return data
}

export async function requestText(url: string, opts: RequestOptions = {}): Promise<string> {
  const key = cacheKey(url, 'GET')
  if (opts.ttlMs && opts.ttlMs > 0) {
    const hit = cacheGet<string>(key)
    if (hit) return hit.data
  }
  const text = await runPipeline(url, opts)
  if (opts.ttlMs && opts.ttlMs > 0) cacheSet(key, text, opts.ttlMs)
  return text
}

/** 断网降级：取上一次成功请求的缓存（可能已过期） */
export function staleJson<T>(url: string): T | null {
  const hit = cacheGetStale<T>(cacheKey(url, 'GET'))
  return hit ? hit.data : null
}
