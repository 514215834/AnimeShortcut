import { FetchError } from '../../core/http/errors'
import { readJson, removeKey, keysWithPrefix, writeJson } from '../../core/storage/localStore'
import { requestJson, requestText } from '../../core/http/request'
import { PluginError, type HttpOptions, type PluginContext, type PluginManifest, type RawResponse } from './types'

export interface ContextOptions {
  /** 测试注入点：替换真实网络与存储 */
  transport?: {
    fetchJson?: <T>(url: string, opts?: HttpOptions) => Promise<T>
    fetchText?: (url: string, opts?: HttpOptions) => Promise<string>
  }
}

const HOST_VERSION = '0.1.0'

export function createPluginContext(
  manifestRef: { current: PluginManifest | null },
  opts: ContextOptions = {},
): PluginContext {
  const pluginId = () => manifestRef.current?.id ?? 'unknown'

  function checkDomain(url: string): void {
    // 开发环境允许同源相对路径（配合 Vite dev server 代理，见 vite.config.ts）
    if (import.meta.env.DEV && url.startsWith('/')) return
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      throw new PluginError('CONFIG_INVALID', `非法 URL: ${url}`)
    }
    const allowed = manifestRef.current?.permissions.domains ?? []
    if (!allowed.some((d) => host === d || host.endsWith('.' + d))) {
      throw new PluginError('DOMAIN_NOT_ALLOWED', `域名不在插件白名单中: ${host}`)
    }
  }

  function mapFetchError(e: unknown): PluginError {
    if (e instanceof PluginError) return e
    if (e instanceof FetchError) {
      const cause = { cause: e }
      // e.message 已含通道标识（如 "请求超时（worker）"），透传给 UI 便于定位
      if (e.kind === 'timeout') return new PluginError('TIMEOUT', e.message, cause)
      if (e.kind === 'parse') return new PluginError('PARSE', e.message, cause)
      if (e.status === 429) return new PluginError('RATE_LIMITED', '请求过于频繁（' + e.channel + '）', cause)
      if (e.kind === 'http-status') return new PluginError('NETWORK', `HTTP ${e.status}（${e.channel}）`, cause)
      return new PluginError('NETWORK', e.message, cause)
    }
    return new PluginError('UNKNOWN', String(e), { cause: e })
  }

  const http = {
    async getJson<T>(url: string, o?: HttpOptions): Promise<T> {
      checkDomain(url)
      try {
        if (opts.transport?.fetchJson) return await opts.transport.fetchJson<T>(url, o)
        return await requestJson<T>(url, {
          timeoutMs: o?.timeoutMs,
          headers: o?.headers,
          ttlMs: o?.ttlMs,
        })
      } catch (e) {
        throw mapFetchError(e)
      }
    },
    async getText(url: string, o?: HttpOptions): Promise<string> {
      checkDomain(url)
      try {
        if (opts.transport?.fetchText) return await opts.transport.fetchText(url, o)
        return await requestText(url, { timeoutMs: o?.timeoutMs, headers: o?.headers, ttlMs: o?.ttlMs })
      } catch (e) {
        throw mapFetchError(e)
      }
    },
    async getRaw(url: string, o?: HttpOptions): Promise<RawResponse> {
      checkDomain(url)
      const text = await http.getText(url, o)
      return { status: 200, headers: {}, body: new TextEncoder().encode(text).buffer as ArrayBuffer }
    },
  }

  const nsKey = (key: string) => `plugin:${pluginId()}:${key}`

  return {
    env: { hostVersion: HOST_VERSION, specVersion: '1.0', locale: 'zh-CN', timezone: 'Asia/Shanghai' },
    http,
    dom: {
      async query(html, selector, o) {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const els = Array.from(doc.querySelectorAll(selector))
        const pick = (el: Element): string | null =>
          o?.attr ? el.getAttribute(o.attr) : (el.textContent?.trim() ?? null)
        return o?.all ? els.map(pick) : els.length > 0 ? pick(els[0]) : null
      },
    },
    domDocument: { parse: (html) => new DOMParser().parseFromString(html, 'text/html') },
    storage: {
      get: async <T>(key: string) => readJson<T>(nsKey(key)),
      set: async (key, value) => writeJson(nsKey(key), value),
      delete: async (key) => removeKey(nsKey(key)),
      keys: async () => keysWithPrefix(`plugin:${pluginId()}:`),
    },
    log: {
      debug: (...a) => console.debug(`[plugin:${pluginId()}]`, ...a),
      info: (...a) => console.info(`[plugin:${pluginId()}]`, ...a),
      warn: (...a) => console.warn(`[plugin:${pluginId()}]`, ...a),
      error: (...a) => console.error(`[plugin:${pluginId()}]`, ...a),
    },
    utils: {
      absUrl(base, path) {
        try {
          return new URL(path, base).href
        } catch {
          return path
        }
      },
      decodeEntities(text) {
        const el = document.createElement('textarea')
        el.innerHTML = text
        return el.value
      },
      hashId(input) {
        let h = 5381
        for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
        return h.toString(36)
      },
    },
  }
}
