import { createPluginContext, HOST_VERSION } from './context'
import { PluginError, type HttpOptions, type PluginManifest, type SandboxHandle } from './types'

/** 消息级超时（接口规范 §10） */
const MSG_TIMEOUT_MS = 30_000

/**
 * Worker 内运行时垫片：与插件 code 拼成同一个 Blob Worker（自包含，无跨域 import）。
 * init 时取 self.__AS_PLUGIN__ 工厂并注入 ctx 桩；invoke 转发能力方法；
 * 桩方法经反向 RPC 回宿主执行——域名白名单、代理链、存储命名空间都在宿主侧强制。
 */
const RUNTIME_SHIM = String.raw`
(function () {
  var plugin = null
  var seq = 0
  var pending = new Map()

  function reply(id, ok, payload) {
    var msg = { v: 1, id: id, ok: ok }
    if (ok) msg.data = payload
    else msg.error = payload
    self.postMessage(msg)
  }

  function errShape(e) {
    if (e && typeof e === 'object' && e.code) return { code: e.code, message: String(e.message) }
    return { code: 'UNKNOWN', message: String(e) }
  }

  function callHost(op, args) {
    return new Promise(function (resolve, reject) {
      var ctxId = 'c' + (++seq)
      pending.set(ctxId, { resolve: resolve, reject: reject })
      self.postMessage({ v: 1, ctxId: ctxId, op: op, args: args })
    })
  }

  var stubCtx = {
    env: null,
    http: {
      getJson: function (url, opts) { return callHost('http.getJson', [url, opts]) },
      getText: function (url, opts) { return callHost('http.getText', [url, opts]) },
      getRaw: function (url, opts) { return callHost('http.getRaw', [url, opts]) },
    },
    dom: {
      query: function (html, selector, o) { return callHost('dom.query', [html, selector, o]) },
    },
    storage: {
      get: function (key) { return callHost('storage.get', [key]) },
      set: function (key, value) { return callHost('storage.set', [key, value]) },
      delete: function (key) { return callHost('storage.delete', [key]) },
      keys: function () { return callHost('storage.keys', []) },
    },
    log: {
      debug: function () { return callHost('log.debug', [].slice.call(arguments)) },
      info: function () { return callHost('log.info', [].slice.call(arguments)) },
      warn: function () { return callHost('log.warn', [].slice.call(arguments)) },
      error: function () { return callHost('log.error', [].slice.call(arguments)) },
    },
    utils: {
      absUrl: function (base, path) { return callHost('utils.absUrl', [base, path]) },
      decodeEntities: function (text) { return callHost('utils.decodeEntities', [text]) },
      hashId: function (input) { return callHost('utils.hashId', [input]) },
    },
  }

  self.onmessage = function (ev) {
    var msg = ev.data
    if (!msg || msg.v !== 1) return

    if (msg.ctxId !== undefined) {
      var p = pending.get(msg.ctxId)
      if (!p) return
      pending.delete(msg.ctxId)
      if (msg.ok) p.resolve(msg.data)
      else {
        var e = new Error((msg.error && msg.error.message) || '宿主调用失败')
        e.code = msg.error && msg.error.code
        p.reject(e)
      }
      return
    }

    if (msg.op === 'init') {
      Promise.resolve()
        .then(function () {
          var factory = self.__AS_PLUGIN__
          if (typeof factory !== 'function') {
            throw { code: 'CONFIG_INVALID', message: '插件缺少 __AS_PLUGIN__ 工厂导出' }
          }
          stubCtx.env = msg.env
          return Promise.resolve(factory(stubCtx)).then(function (created) {
            plugin = created
            return plugin.init(msg.config)
          })
        })
        .then(
          function () { reply(msg.id, true, null) },
          function (e) { reply(msg.id, false, errShape(e)) },
        )
      return
    }

    if (msg.op === 'invoke') {
      Promise.resolve()
        .then(function () {
          var fn = plugin && plugin[msg.method]
          if (typeof fn !== 'function') {
            throw { code: 'UNSUPPORTED', message: '插件未实现 ' + msg.method }
          }
          return fn.apply(plugin, msg.args || [])
        })
        .then(
          function (data) { reply(msg.id, true, data) },
          function (e) { reply(msg.id, false, errShape(e)) },
        )
    }
  }
})();
`

type WorkerMsg = {
  v: 1
  id?: string
  ok?: boolean
  data?: unknown
  error?: { code?: string; message?: string }
  ctxId?: string
  op?: string
  args?: unknown[]
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

function errShape(e: unknown): { code: string; message: string } {
  if (e instanceof PluginError) return { code: e.code, message: e.message }
  if (e instanceof Error) return { code: (e as { code?: string }).code ?? 'UNKNOWN', message: e.message }
  return { code: 'UNKNOWN', message: String(e) }
}

/**
 * 创建 Worker 沙箱。init 握手不在创建期：宿主 activate 阶段经 handle.call('init', [config]) 完成
 * （规范 §10 初始化序列），插件实例在垫片收到 init 消息时才创建。
 */
export function createWorkerSandbox(opts: { code: string; manifest: PluginManifest }): SandboxHandle {
  const manifestRef = { current: opts.manifest }
  // 宿主侧真实上下文：插件的所有 ctx 反向调用都经它执行
  const ctx = createPluginContext(manifestRef)

  let url: string
  let worker: Worker
  try {
    url = URL.createObjectURL(new Blob([RUNTIME_SHIM + '\n' + opts.code], { type: 'text/javascript' }))
    worker = new Worker(url)
  } catch (e) {
    throw new PluginError(
      'CONFIG_INVALID',
      `Worker 沙箱创建失败: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  const pending = new Map<string, Pending>()
  let seq = 0
  let dead = false

  const failAll = (e: PluginError): void => {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(e)
    }
    pending.clear()
  }

  const destroy = (): void => {
    if (dead) return
    dead = true
    worker.terminate()
    URL.revokeObjectURL(url)
    failAll(new PluginError('UNKNOWN', '插件沙箱已终止'))
  }

  const execCtxOp = async (op: string, args: unknown[]): Promise<unknown> => {
    const a0 = args[0]
    const a1 = args[1]
    switch (op) {
      case 'http.getJson':
        return ctx.http.getJson(a0 as string, args[1] as HttpOptions | undefined)
      case 'http.getText':
        return ctx.http.getText(a0 as string, args[1] as HttpOptions | undefined)
      case 'http.getRaw':
        return ctx.http.getRaw(a0 as string, args[1] as HttpOptions | undefined)
      case 'dom.query':
        return ctx.dom.query(
          a0 as string,
          args[1] as string,
          args[2] as { attr?: string; all?: boolean } | undefined,
        )
      case 'storage.get':
        return ctx.storage.get(a0 as string)
      case 'storage.set':
        return ctx.storage.set(a0 as string, a1)
      case 'storage.delete':
        return ctx.storage.delete(a0 as string)
      case 'storage.keys':
        return ctx.storage.keys()
      case 'log.debug':
      case 'log.info':
      case 'log.warn':
      case 'log.error': {
        const level = op.slice(4) as 'debug' | 'info' | 'warn' | 'error'
        try {
          ctx.log[level](...args)
        } catch {
          /* 日志参数不可克隆等情况忽略 */
        }
        return null
      }
      case 'utils.absUrl':
        return ctx.utils.absUrl(a0 as string, a1 as string)
      case 'utils.decodeEntities':
        return ctx.utils.decodeEntities(a0 as string)
      case 'utils.hashId':
        return ctx.utils.hashId(a0 as string)
      default:
        throw new PluginError('UNSUPPORTED', `未知 ctx 操作: ${op}`)
    }
  }

  worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
    const msg = ev.data
    if (!msg || msg.v !== 1) return

    // 反向 RPC：插件 → 宿主 ctx
    if (msg.ctxId !== undefined) {
      void execCtxOp(msg.op ?? '', msg.args ?? [])
        .then((data) => worker.postMessage({ v: 1, ctxId: msg.ctxId, ok: true, data }))
        .catch((e: unknown) =>
          worker.postMessage({ v: 1, ctxId: msg.ctxId, ok: false, error: errShape(e) }),
        )
      return
    }

    // 宿主 → 插件调用的回包
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (!p) return
      clearTimeout(p.timer)
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.data)
      else {
        const code = (msg.error?.code as PluginError['code'] | undefined) ?? 'UNKNOWN'
        p.reject(new PluginError(code, msg.error?.message ?? '插件调用失败'))
      }
    }
  }

  worker.onerror = (e) => {
    dead = true
    failAll(new PluginError('UNKNOWN', `插件脚本运行异常: ${e.message}`))
  }

  const call = (method: string, args: unknown[]): Promise<unknown> => {
    if (dead) return Promise.reject(new PluginError('UNKNOWN', '插件沙箱已终止'))
    return new Promise((resolve, reject) => {
      const id = 'm' + (++seq)
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new PluginError('TIMEOUT', `插件调用超时（30s）: ${method}`))
      }, MSG_TIMEOUT_MS)
      pending.set(id, { resolve, reject, timer })
      if (method === 'init') {
        worker.postMessage({
          v: 1,
          id,
          op: 'init',
          config: args[0] ?? {},
          env: {
            hostVersion: HOST_VERSION,
            specVersion: '1.0' as const,
            locale: 'zh-CN',
            timezone: 'Asia/Shanghai',
            mode: import.meta.env.DEV ? ('dev' as const) : ('production' as const),
          },
        })
      } else {
        worker.postMessage({ v: 1, id, op: 'invoke', method, args })
      }
    })
  }

  return { call, destroy }
}
