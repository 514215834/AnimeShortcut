/**
 * 代理链（技术架构设计 §4.2.2）：
 * 对每个目标 URL 按通道顺序尝试 —— 直连 → 用户自部署 Worker → 公共代理回退。
 * 成功通道会被记住（localStorage），后续请求直接从它开始。
 */

export type ChannelName = 'direct' | 'worker' | 'public:allorigins' | 'public:codetabs'

export interface Channel {
  name: ChannelName
  /** 把目标 URL 包装成本通道实际请求的 URL */
  wrap(url: string): string
}

const WORKER_URL_KEY = 'http:proxyWorkerUrl'
const LAST_GOOD_KEY = 'http:lastGoodChannel'

let workerUrl = readWorkerUrl()
let lastGood: ChannelName | null = readLastGood()

function readWorkerUrl(): string {
  try {
    return localStorage.getItem('asc:' + WORKER_URL_KEY) ?? ''
  } catch {
    return ''
  }
}

function readLastGood(): ChannelName | null {
  try {
    const v = localStorage.getItem('asc:' + LAST_GOOD_KEY)
    return v ? (v as ChannelName) : null
  } catch {
    return null
  }
}

export function getWorkerUrl(): string {
  return workerUrl
}

export function setWorkerUrl(url: string): void {
  workerUrl = url.trim()
  try {
    if (workerUrl) localStorage.setItem('asc:' + WORKER_URL_KEY, workerUrl)
    else localStorage.removeItem('asc:' + WORKER_URL_KEY)
  } catch {
    /* 忽略 */
  }
}

export function setLastGoodChannel(name: ChannelName): void {
  lastGood = name
  try {
    localStorage.setItem('asc:' + LAST_GOOD_KEY, name)
  } catch {
    /* 忽略 */
  }
}

export function getLastGoodChannel(): ChannelName | null {
  return lastGood
}

function encode(url: string): string {
  return encodeURIComponent(url)
}

function buildChannels(): Channel[] {
  const all: Channel[] = [
    { name: 'direct', wrap: (u) => u },
    {
      name: 'worker',
      wrap: (u) => `${workerUrl}${workerUrl.includes('?') ? '&' : '?'}url=${encode(u)}`,
    },
    { name: 'public:allorigins', wrap: (u) => `https://api.allorigins.win/raw?url=${encode(u)}` },
    { name: 'public:codetabs', wrap: (u) => `https://api.codetabs.com/v1/proxy?quest=${encode(u)}` },
  ]
  if (!workerUrl) all.splice(1, 1)
  if (lastGood) {
    const idx = all.findIndex((c) => c.name === lastGood)
    if (idx > 0) all.unshift(all.splice(idx, 1)[0])
  }
  return all
}

export function channelsFor(): Channel[] {
  return buildChannels()
}
