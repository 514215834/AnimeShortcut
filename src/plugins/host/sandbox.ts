import { createPluginContext } from './context'
import { createWorkerSandbox } from './workerBridge'
import {
  PluginError,
  type AnimeSourcePlugin,
  type PluginFactory,
  type PluginManifest,
  type SandboxHandle,
} from './types'

/**
 * 内置插件的本地句柄：工厂已在主线程实例化，call 直调方法。
 * 与 worker 桥共用 SandboxHandle，宿主内核对两种装载方式无感。
 */
export function createLocalHandle(plugin: AnimeSourcePlugin): SandboxHandle {
  return {
    async call(method, args) {
      const fn = (plugin as unknown as Record<string, unknown>)[method]
      if (typeof fn !== 'function') throw new PluginError('UNSUPPORTED', `插件未实现 ${method}`)
      return await (fn as (...a: unknown[]) => unknown).apply(plugin, args)
    },
    destroy() {
      /* 本地直载无沙箱可终止 */
    },
  }
}

/**
 * 内置插件装载：主线程直调工厂（规范 §3 的 main 沙箱形态）。
 * manifestRef 在工厂返回后回填，供 ctx 的域名白名单/存储命名空间读取。
 */
export async function instantiateBuiltin(
  factory: PluginFactory,
): Promise<{ plugin: AnimeSourcePlugin; handle: SandboxHandle }> {
  const manifestRef = { current: null as PluginManifest | null }
  const ctx = createPluginContext(manifestRef)
  const plugin = await factory(ctx)
  manifestRef.current = plugin.manifest
  return { plugin, handle: createLocalHandle(plugin) }
}

/**
 * 导入插件的沙箱路由（设计 §2 D1）：强制 Worker 沙箱；
 * 仅 import.meta.env.DEV 下允许 main 沙箱直载，便于调试插件包（对齐规范 §6.1 开发联调例外精神）。
 */
export function startSandbox(opts: { code: string; manifest: PluginManifest }): Promise<SandboxHandle> {
  if (opts.manifest.sandbox === 'worker') return Promise.resolve(createWorkerSandbox(opts))
  if (import.meta.env.DEV) return createDevMainSandbox(opts)
  return Promise.reject(
    new PluginError('CONFIG_INVALID', '导入插件仅允许 worker 沙箱（main 沙箱保留给内置插件）'),
  )
}

/** DEV 例外：Blob 模块动态导入插件 code，主线程直载（与内置同等的无隔离执行，仅限开发调试） */
async function createDevMainSandbox(opts: {
  code: string
  manifest: PluginManifest
}): Promise<SandboxHandle> {
  const manifestRef = { current: opts.manifest }
  const ctx = createPluginContext(manifestRef)
  const blobUrl = URL.createObjectURL(new Blob([opts.code], { type: 'text/javascript' }))
  let factory: PluginFactory
  try {
    await import(/* @vite-ignore */ blobUrl)
    factory = (globalThis as Record<string, unknown>).__AS_PLUGIN__ as PluginFactory
  } catch (e) {
    URL.revokeObjectURL(blobUrl)
    throw new PluginError(
      'CONFIG_INVALID',
      `插件脚本加载失败: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  if (typeof factory !== 'function') {
    URL.revokeObjectURL(blobUrl)
    throw new PluginError('CONFIG_INVALID', '插件缺少 __AS_PLUGIN__ 工厂导出')
  }
  delete (globalThis as Record<string, unknown>).__AS_PLUGIN__

  const plugin = await factory(ctx)
  return {
    async call(method, args) {
      const fn = (plugin as unknown as Record<string, unknown>)[method]
      if (typeof fn !== 'function') throw new PluginError('UNSUPPORTED', `插件未实现 ${method}`)
      return await (fn as (...a: unknown[]) => unknown).apply(plugin, args)
    },
    destroy() {
      URL.revokeObjectURL(blobUrl)
    },
  }
}
