import { cacheGet, cacheSet } from '../../core/http/cache'
import { createPluginContext } from './context'
import {
  PluginError,
  type AnimeDetail,
  type AnimeSummary,
  type PlayResult,
  type PluginCapability,
  type PluginFactory,
  type PluginManifest,
  type PagedResult,
} from './types'

const METHOD_BY_CAP: Record<PluginCapability, string> = {
  weekly: 'getWeeklySchedule',
  latest: 'getLatestUpdates',
  search: 'search',
  detail: 'getDetail',
  play: 'resolvePlay',
}

const DEFAULT_HINTS: Record<PluginCapability, number> = {
  weekly: 600,
  latest: 600,
  search: 0,
  detail: 3600,
  play: 0,
}

interface Loaded {
  manifest: PluginManifest
  plugin: import('./types').AnimeSourcePlugin
}

const loaded = new Map<string, Loaded>()

let enabledProvider: (id: string) => boolean = () => true
let configProvider: (id: string) => Record<string, string | number | boolean> = () => ({})

export interface SourceInfo {
  id: string
  name: string
  version: string
  capabilities: PluginCapability[]
  enabled: boolean
}

/** 宿主启动时加载全部内置插件（remote 插件在迭代 3 引入） */
export async function initPluginHost(opts?: {
  enabledProvider?: (id: string) => boolean
  configProvider?: (id: string) => Record<string, string | number | boolean>
  /** 测试注入点：覆盖内置插件注册表 */
  factories?: PluginFactory[]
}): Promise<void> {
  enabledProvider = opts?.enabledProvider ?? (() => true)
  configProvider = opts?.configProvider ?? (() => ({}))
  // 显式传入 factories（测试场景）时重置注册表，保证多次初始化确定性
  if (opts?.factories) loaded.clear()

  const factories =
    opts?.factories ?? (await import('../sources/registry')).builtinFactories
  for (const factory of factories) {
    const manifestRef = { current: null as PluginManifest | null }
    const ctx = createPluginContext(manifestRef)
    const plugin = await factory(ctx)
    manifestRef.current = plugin.manifest
    if (loaded.has(plugin.manifest.id)) {
      console.warn(`[PluginHost] 重复插件 id: ${plugin.manifest.id}，已忽略`)
      continue
    }
    loaded.set(plugin.manifest.id, { manifest: plugin.manifest, plugin })
    await plugin.init(configProvider(plugin.manifest.id))
  }
}

export function listSources(): SourceInfo[] {
  return Array.from(loaded.values()).map(({ manifest }) => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    capabilities: manifest.capabilities,
    enabled: enabledProvider(manifest.id),
  }))
}

function hintFor(l: Loaded, cap: PluginCapability): number {
  return l.manifest.cacheHints?.[cap] ?? DEFAULT_HINTS[cap]
}

/** 能力调用：缓存（按 manifest.cacheHints）+ 能力协商 + 错误透传 */
async function invoke<T>(
  sourceId: string,
  cap: PluginCapability,
  args: unknown[],
  run: (plugin: import('./types').AnimeSourcePlugin) => Promise<T>,
  post?: (data: T) => T,
): Promise<T> {
  const l = loaded.get(sourceId)
  if (!l) throw new PluginError('UNSUPPORTED', `数据源未加载: ${sourceId}`)
  if (!enabledProvider(sourceId)) throw new PluginError('CONFIG_INVALID', `数据源已停用: ${l.manifest.name}`)
  if (!l.manifest.capabilities.includes(cap)) {
    throw new PluginError('UNSUPPORTED', `${l.manifest.name} 未声明能力 ${cap}`)
  }
  const method = METHOD_BY_CAP[cap]
  if (typeof l.plugin[method as keyof import('./types').AnimeSourcePlugin] !== 'function') {
    throw new PluginError('UNSUPPORTED', `${l.manifest.name} 未实现 ${method}`)
  }

  const ttl = hintFor(l, cap)
  const key = `plugin:${sourceId}:${cap}:${JSON.stringify(args)}`
  if (ttl > 0) {
    const hit = cacheGet<T>(key)
    if (hit) return hit.data
  }
  const data = await run(l.plugin)
  const result = post ? post(data) : data
  if (ttl > 0) cacheSet(key, result, ttl)
  return result
}

/** 注入 sourceId（插件按规范不携带） */
const tagItems = (sourceId: string) => (r: PagedResult<AnimeSummary>): PagedResult<AnimeSummary> => ({
  ...r,
  items: r.items.map((it) => ({ ...it, sourceId })),
})

export const sources = {
  weekly(sourceId: string, page = 1): Promise<PagedResult<AnimeSummary>> {
    return invoke(sourceId, 'weekly', [page], (p) => p.getWeeklySchedule!(page), tagItems(sourceId))
  },
  latest(sourceId: string, page = 1): Promise<PagedResult<AnimeSummary>> {
    return invoke(sourceId, 'latest', [page], (p) => p.getLatestUpdates!(page), tagItems(sourceId))
  },
  search(sourceId: string, keyword: string, page = 1): Promise<PagedResult<AnimeSummary>> {
    return invoke(sourceId, 'search', [keyword, page], (p) => p.search!(keyword, page), tagItems(sourceId))
  },
  detail(sourceId: string, animeId: string): Promise<AnimeDetail> {
    return invoke(sourceId, 'detail', [animeId], (p) => p.getDetail!(animeId), (d) => ({ ...d, sourceId }))
  },
  play(sourceId: string, animeId: string, episodeId: string): Promise<PlayResult> {
    return invoke(sourceId, 'play', [animeId, episodeId], (p) => p.resolvePlay!(animeId, episodeId))
  },
}
