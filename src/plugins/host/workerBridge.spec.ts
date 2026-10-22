import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkerSandbox } from './workerBridge'

/**
 * 宿主 → 插件 postMessage 载荷纯化回归（规范 §10）：
 * 页面层曾把 Vue 响应式 Proxy 直接作 catalog 参数传入，结构化克隆抛
 * "DataCloneError: #<Object> could not be cloned"（仅 worker 沙箱插件受影响）。
 * 桥接边界必须把 args/config 纯化为可克隆的普通对象。
 */

interface SentMsg {
  v: number
  id?: string
  op?: string
  method?: string
  args?: unknown[]
  config?: unknown
  env?: unknown
  ctxId?: string
  ok?: boolean
  data?: unknown
  error?: { code?: string; message?: string }
}

class FakeWorker {
  static last: FakeWorker | null = null
  onmessage: ((ev: { data: SentMsg }) => void) | null = null
  onerror: ((e: { message: string }) => void) | null = null
  posted: SentMsg[] = []
  constructor(public url: string) {
    FakeWorker.last = this
  }
  postMessage(msg: SentMsg): void {
    this.posted.push(msg)
  }
  /** 测试驱动：模拟 Worker 内脚本回包 */
  replyFromWorker(msg: SentMsg): void {
    this.onmessage?.({ data: msg })
  }
  terminate(): void {}
}

const manifest = {
  manifestVersion: '1.0',
  id: 'fakeplug',
  name: 'Fake',
  version: '1.0.0',
  siteUrl: 'https://fake.example/',
  type: 'remote' as const,
  entry: 'index.js',
  sandbox: 'worker' as const,
  capabilities: ['catalog' as const],
  permissions: { domains: ['fake.example'] },
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeWorker.last = null
})

describe('workerBridge：postMessage 载荷纯化', () => {
  it('invoke 的 Proxy 参数被纯化为普通对象且可结构化克隆', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)

    const sandbox = createWorkerSandbox({ code: '/* noop */', manifest })
    const proxied = new Proxy({ type: '22', class: 'all' }, {})
    const call = sandbox.call('getCatalog', [proxied, 1])

    const sent = FakeWorker.last?.posted.find((m) => m.op === 'invoke')
    expect(sent, '应发出 invoke 消息').toBeTruthy()
    const arg0 = sent?.args?.[0] as Record<string, unknown>
    expect(arg0).not.toBe(proxied)
    expect(Object.getPrototypeOf(arg0)).toBe(Object.prototype)
    expect(arg0).toEqual({ type: '22', class: 'all' })
    // 验证载荷满足结构化克隆（真实 postMessage 不再抛 DataCloneError）
    expect(() => structuredClone(sent?.args)).not.toThrow()

    FakeWorker.last?.replyFromWorker({ v: 1, id: sent!.id!, ok: true, data: { items: [], page: 1, hasMore: false } })
    await expect(call).resolves.toEqual({ items: [], page: 1, hasMore: false })
  })

  it('init 的 config 同样纯化', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)

    const sandbox = createWorkerSandbox({ code: '/* noop */', manifest })
    const reactiveConfig = new Proxy({ siteBaseUrl: 'https://fake.example/' }, {})
    const call = sandbox.call('init', [reactiveConfig])

    const sent = FakeWorker.last?.posted.find((m) => m.op === 'init')
    expect(sent, '应发出 init 消息').toBeTruthy()
    expect(sent?.config).toEqual({ siteBaseUrl: 'https://fake.example/' })
    expect(Object.getPrototypeOf(sent?.config)).toBe(Object.prototype)

    FakeWorker.last?.replyFromWorker({ v: 1, id: sent!.id!, ok: true, data: null })
    await expect(call).resolves.toBeNull()
  })

  it('普通对象参数行为不变（透传语义）', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)

    const sandbox = createWorkerSandbox({ code: '/* noop */', manifest })
    const call = sandbox.call('getCatalog', [{ type: '22' }, 2])
    const sent = FakeWorker.last?.posted.find((m) => m.op === 'invoke')
    expect(sent?.args).toEqual([{ type: '22' }, 2])

    FakeWorker.last?.replyFromWorker({ v: 1, id: sent!.id!, ok: true, data: { items: [], page: 2, hasMore: false } })
    await expect(call).resolves.toEqual({ items: [], page: 2, hasMore: false })
  })

  it('循环引用等不可序列化载荷 → CONFIG_INVALID 而非原生 TypeError', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)

    const sandbox = createWorkerSandbox({ code: '/* noop */', manifest })
    const circular: Record<string, unknown> = { type: '22' }
    circular.self = circular
    await expect(sandbox.call('getCatalog', [circular, 1])).rejects.toMatchObject({ code: 'CONFIG_INVALID' })
  })
})
