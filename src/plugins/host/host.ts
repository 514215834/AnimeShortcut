import { cacheClearByPrefix, cacheGet, cacheSet } from '../../core/http/cache'
import { getLastGoodChannel, type ChannelName } from '../../core/http/proxyChain'
import { idbAll, idbDelete, idbGet, idbPut } from '../../core/storage/idb'
import { removeKeysWithPrefix } from '../../core/storage/localStore'
import { instantiateBuiltin, startSandbox } from './sandbox'
import { validateImportedManifest, verifyPackageIntegrity } from './manifestValidator'
import {
  PluginError,
  type AnimeDetail,
  type AnimeSummary,
  type CatalogFilterDef,
  type CatalogQuery,
  type InstalledPluginRecord,
  type PagedResult,
  type PlayResult,
  type PluginCapability,
  type PluginFactory,
  type PluginManifest,
  type PluginPackage,
  type RankGroup,
  type SandboxHandle,
} from './types'

const DEFAULT_HINTS: Record<PluginCapability, number> = {
  weekly: 600,
  latest: 600,
  search: 0,
  detail: 3600,
  play: 0,
  catalog: 600,
  rank: 1800,
}

const UNLOAD_TIMEOUT_MS = 3_000

/**
 * 探活映射（规范 §11 步骤 4）：按声明能力选一个良性调用；
 * 仅声明 detail/play 的插件无无参良性调用，init 成功即视为可用。
 */
const PROBE_CALLS: Partial<Record<PluginCapability, { method: string; args: unknown[] }>> = {
  latest: { method: 'getLatestUpdates', args: [1] },
  weekly: { method: 'getWeeklySchedule', args: [1] },
  rank: { method: 'getRank', args: [] },
  catalog: { method: 'getCatalogMeta', args: [] },
  search: { method: 'search', args: ['', 1] },
}

interface Loaded {
  manifest: PluginManifest
  handle: SandboxHandle
  origin: 'builtin' | 'file' | 'url'
  /** builtin 重载时复用的工厂 */
  factory?: PluginFactory
}

const loaded = new Map<string, Loaded>()
const listeners = new Set<(sources: SourceInfo[]) => void>()

let enabledProvider: (id: string) => boolean = () => true
let configProvider: (id: string) => Record<string, string | number | boolean> = () => ({})

export interface SourceInfo {
  id: string
  name: string
  version: string
  type: 'builtin' | 'remote'
  capabilities: PluginCapability[]
  enabled: boolean
}

function infoOf(manifest: PluginManifest): SourceInfo {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    capabilities: manifest.capabilities,
    enabled: enabledProvider(manifest.id),
  }
}

/** 注册表快照；UI 通过 onSourcesChanged / stores/plugins 获得响应式列表 */
export function listSources(): SourceInfo[] {
  return Array.from(loaded.values()).map(({ manifest }) => infoOf(manifest))
}

function notifyChange(): void {
  const snapshot = listSources()
  for (const cb of listeners) {
    try {
      cb(snapshot)
    } catch {
      /* 监听器异常不影响宿主 */
    }
  }
}

/** 注册表变更订阅（安装/卸载/更新时触发），返回取消函数 */
export function onSourcesChanged(cb: (sources: SourceInfo[]) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function withTimeout(p: Promise<unknown>, ms: number, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} 超时（${ms}ms）`)), ms)
    p.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** 释放实例：onUnload（限时，未实现/失败不阻断）→ 沙箱销毁 */
async function release(l: Loaded): Promise<void> {
  try {
    await withTimeout(l.handle.call('onUnload', []), UNLOAD_TIMEOUT_MS, 'onUnload')
  } catch {
    /* 卸载钩子失败或未实现不阻断摘除 */
  }
  l.handle.destroy()
}

/** 摘除实例：先出注册表（新调用立即 UNSUPPORTED），再释放 */
async function detach(id: string): Promise<boolean> {
  const l = loaded.get(id)
  if (!l) return false
  loaded.delete(id)
  await release(l)
  return true
}

async function mountBuiltinFactory(factory: PluginFactory): Promise<void> {
  const { plugin, handle } = await instantiateBuiltin(factory)
  const manifest = plugin.manifest
  if (loaded.has(manifest.id)) {
    console.warn(`[PluginHost] 重复插件 id: ${manifest.id}，已忽略`)
    handle.destroy()
    return
  }
  try {
    await handle.call('init', [configProvider(manifest.id)])
  } catch (e) {
    handle.destroy()
    throw e
  }
  loaded.set(manifest.id, { manifest, handle, origin: 'builtin', factory })
  notifyChange()
}

/**
 * 导入包装载全流程（设计 §6）：校验 → 完整性 → 新沙箱 init + 探活 → 换装 → 持久化。
 * 新沙箱全部通过后才替换旧实例：更新/安装失败时已装插件原地不动，不留半装状态。
 * probe 仅安装/重载时执行（规范 §11 信任流程）；启动恢复必须传 false——
 * 探活是一次绕过缓存的实时网络调用，恢复期执行会阻塞首屏且让可用性随网络波动（设计 §7 只要求 sha256 复核）。
 */
async function mountPackage(
  pkg: PluginPackage,
  opts: { origin: 'file' | 'url'; sourceUrl?: string; persist: boolean; probe?: boolean },
): Promise<SourceInfo> {
  const check = validateImportedManifest(pkg.manifest)
  if (!check.ok) {
    throw new PluginError('CONFIG_INVALID', `清单校验失败: ${check.errors.join('；')}`)
  }
  const manifest = check.manifest
  const id = manifest.id

  await verifyPackageIntegrity(pkg, manifest)
  const handle = await startSandbox({ code: pkg.code, manifest })
  try {
    await handle.call('init', [configProvider(id)])
    if (opts.probe ?? true) {
      const probe = manifest.capabilities.map((c) => PROBE_CALLS[c]).find(Boolean)
      if (probe) await handle.call(probe.method, probe.args)
    }
  } catch (e) {
    handle.destroy()
    throw e instanceof PluginError
      ? e
      : new PluginError('UNKNOWN', `插件装载失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 换装：注册新实例（此后调用即路由到新实例）→ 释放旧实例
  const previous = loaded.get(id)
  loaded.set(id, { manifest, handle, origin: opts.origin })
  if (previous) await release(previous)
  if (opts.persist) {
    await idbPut('plugins', {
      key: id,
      manifest,
      code: pkg.code,
      installedAt: Date.now(),
      origin: opts.origin,
      sourceUrl: opts.sourceUrl,
    })
  }
  notifyChange()
  return infoOf(manifest)
}

/**
 * 宿主启动：内置插件 → 恢复已安装的外置插件（单条失败仅告警跳过，不阻塞启动）→ 发首次变更事件。
 * 外置插件恢复走 Worker 沙箱（规范 §3），并重新校验清单与 sha256。
 */
export async function initPluginHost(opts?: {
  enabledProvider?: (id: string) => boolean
  configProvider?: (id: string) => Record<string, string | number | boolean>
  /** 测试注入点：覆盖内置插件注册表 */
  factories?: PluginFactory[]
  /** 测试注入点：替代 IndexedDB 的已安装插件包 */
  packages?: Array<PluginPackage & Partial<InstalledPluginRecord>>
}): Promise<void> {
  enabledProvider = opts?.enabledProvider ?? (() => true)
  configProvider = opts?.configProvider ?? (() => ({}))
  // 显式传入 factories（测试场景）时重置注册表，保证多次初始化确定性
  if (opts?.factories) loaded.clear()

  const factories =
    opts?.factories ?? (await import('../sources/registry')).builtinFactories
  for (const factory of factories) {
    await mountBuiltinFactory(factory)
  }

  const raw = opts?.packages ?? (await idbAll<InstalledPluginRecord>('plugins'))
  const records = raw.map((p) => ({
    key: p.key ?? p.manifest.id,
    manifest: p.manifest,
    code: p.code,
    installedAt: p.installedAt ?? 0,
    origin: p.origin ?? ('file' as const),
    sourceUrl: p.sourceUrl,
  }))
  for (const rec of records) {
    try {
      // 恢复不重写 IDB（persist:false），保留原 installedAt/origin；不探活（probe:false）——恢复只做
      // 清单/sha256 复核 + init，可用性由调用期错误态兜底，不因探活网络失败把已装插件整个跳过
      await mountPackage(
        { formatVersion: 1, manifest: rec.manifest, code: rec.code },
        { origin: rec.origin, sourceUrl: rec.sourceUrl, persist: false, probe: false },
      )
    } catch (e) {
      console.warn(`[PluginHost] 插件 ${rec.key} 恢复失败，已跳过`, e)
    }
  }
  notifyChange()
}

// ========= 热插拔 API（docs/插件导入导出与热插拔设计.md §4）=========

export interface InstallOptions {
  /** 包来源（决定持久化记录的 origin），默认 file */
  origin?: 'file' | 'url'
  sourceUrl?: string
  /** 是否持久化（默认 true；测试可关） */
  persist?: boolean
}

/** 安装（同 id 已存在时为覆盖更新）。校验/沙箱/探活任一失败即回滚，不留半装状态 */
export async function installPlugin(pkg: PluginPackage, opts?: InstallOptions): Promise<SourceInfo> {
  if (!pkg || pkg.formatVersion !== 1) {
    throw new PluginError('CONFIG_INVALID', '插件包 formatVersion 必须为 1')
  }
  return await mountPackage(pkg, {
    origin: opts?.origin ?? 'file',
    sourceUrl: opts?.sourceUrl,
    persist: opts?.persist ?? true,
  })
}

/**
 * 卸载：摘实例 + 清方法级缓存 + 删持久化记录；wipeStorage 时连插件私有 KV 一起清。
 * 订阅/历史不删（复合主键含 sourceId，重装同 id 自动恢复语义）。
 */
export async function uninstallPlugin(id: string, opts?: { wipeStorage?: boolean }): Promise<void> {
  const wasLoaded = await detach(id)
  const record = await idbGet<InstalledPluginRecord>('plugins', id)
  if (!wasLoaded && !record) throw new PluginError('UNSUPPORTED', `插件未安装: ${id}`)
  cacheClearByPrefix(`plugin:${id}:`)
  if (opts?.wipeStorage) removeKeysWithPrefix(`plugin:${id}:`)
  await idbDelete('plugins', id)
  notifyChange()
}

/** 重载：builtin 按注册表工厂重建；导入插件按持久化记录重建（用于确定性恢复） */
export async function reloadPlugin(id: string): Promise<void> {
  const l = loaded.get(id)
  if (!l) throw new PluginError('UNSUPPORTED', `插件未加载: ${id}`)
  if (l.origin === 'builtin' && l.factory) {
    await detach(id)
    cacheClearByPrefix(`plugin:${id}:`)
    await mountBuiltinFactory(l.factory)
    return
  }
  const record = await idbGet<InstalledPluginRecord>('plugins', id)
  if (!record) throw new PluginError('UNSUPPORTED', `插件无持久化记录: ${id}`)
  await detach(id)
  cacheClearByPrefix(`plugin:${id}:`)
  await mountPackage(
    { formatVersion: 1, manifest: record.manifest, code: record.code },
    { origin: record.origin, sourceUrl: record.sourceUrl, persist: true },
  )
}

/** 取已安装插件包（导出用）；未安装返回 null */
export async function getInstalledPackage(id: string): Promise<PluginPackage | null> {
  const rec = await idbGet<InstalledPluginRecord>('plugins', id)
  return rec ? { formatVersion: 1, manifest: rec.manifest, code: rec.code } : null
}

function hintFor(l: Loaded, cap: PluginCapability): number {
  // cacheHints 按规范以秒声明（§8.5），缓存层以毫秒计——此前直接透传导致能力缓存仅存活亚秒级
  return (l.manifest.cacheHints?.[cap] ?? DEFAULT_HINTS[cap]) * 1000
}

/** 能力调用：缓存（按 manifest.cacheHints）+ 能力协商 + 错误透传 */
async function invoke<T>(
  sourceId: string,
  cap: PluginCapability,
  args: unknown[],
  call: (handle: SandboxHandle) => Promise<unknown>,
  post?: (data: T) => T,
  opts?: { bypassCache?: boolean },
): Promise<T> {
  const l = loaded.get(sourceId)
  if (!l) throw new PluginError('UNSUPPORTED', `数据源未加载: ${sourceId}`)
  if (!enabledProvider(sourceId)) throw new PluginError('CONFIG_INVALID', `数据源已停用: ${l.manifest.name}`)
  if (!l.manifest.capabilities.includes(cap)) {
    throw new PluginError('UNSUPPORTED', `${l.manifest.name} 未声明能力 ${cap}`)
  }

  const ttl = hintFor(l, cap)
  const key = `plugin:${sourceId}:${cap}:${JSON.stringify(args)}`
  if (ttl > 0 && !opts?.bypassCache) {
    const hit = cacheGet<T>(key)
    if (hit) return hit.data
  }
  let data: T
  try {
    data = (await call(l.handle)) as T
  } catch (e) {
    throw e instanceof PluginError ? e : new PluginError('UNKNOWN', String(e), { cause: e })
  }
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
    return invoke(
      sourceId,
      'weekly',
      [page],
      (h) => h.call('getWeeklySchedule', [page]),
      tagItems(sourceId),
    )
  },
  latest(sourceId: string, page = 1): Promise<PagedResult<AnimeSummary>> {
    return invoke(
      sourceId,
      'latest',
      [page],
      (h) => h.call('getLatestUpdates', [page]),
      tagItems(sourceId),
    )
  },
  search(sourceId: string, keyword: string, page = 1): Promise<PagedResult<AnimeSummary>> {
    return invoke(
      sourceId,
      'search',
      [keyword, page],
      (h) => h.call('search', [keyword, page]),
      tagItems(sourceId),
    )
  },
  detail(sourceId: string, animeId: string, cacheOpts?: { fresh?: boolean }): Promise<AnimeDetail> {
    return invoke(
      sourceId,
      'detail',
      [animeId],
      (h) => h.call('getDetail', [animeId]),
      (d) => ({ ...d, sourceId }),
      cacheOpts?.fresh ? { bypassCache: true } : undefined,
    )
  },
  play(sourceId: string, animeId: string, episodeId: string): Promise<PlayResult> {
    return invoke(sourceId, 'play', [animeId, episodeId], (h) =>
      h.call('resolvePlay', [animeId, episodeId]),
    )
  },
  async catalogMeta(sourceId: string): Promise<CatalogFilterDef[]> {
    const l = loaded.get(sourceId)
    if (!l?.manifest.capabilities.includes('catalog')) {
      throw new PluginError('UNSUPPORTED', `${l?.manifest.name ?? sourceId} 未提供分类筛选定义`)
    }
    return (await invoke(sourceId, 'catalog', ['meta'], (h) => h.call('getCatalogMeta', []))) as CatalogFilterDef[]
  },
  catalog(
    sourceId: string,
    query: CatalogQuery,
    page = 1,
  ): Promise<PagedResult<AnimeSummary>> {
    return invoke(
      sourceId,
      'catalog',
      [query, page],
      (h) => h.call('getCatalog', [query, page]),
      tagItems(sourceId),
    )
  },
  rank(sourceId: string, year?: string): Promise<RankGroup[]> {
    return invoke(sourceId, 'rank', [year ?? 'all'], (h) => h.call('getRank', [year]))
  },
}

export interface ProbeResult {
  sourceId: string
  name: string
  /** 代理链在本次探测后记住的可用通道 */
  channel: ChannelName | null
}

/**
 * 通用连通性探测（设置页用）：按启停顺序找第一个有良性能力的已启用源，
 * 绕过缓存真实拉取一次，成功即证明「代理链 + 插件解析」整链路可用——不含任何单源特判。
 */
export async function probeSource(): Promise<ProbeResult> {
  for (const src of listSources()) {
    if (!enabledProvider(src.id)) continue
    const probe = src.capabilities.map((c) => PROBE_CALLS[c]).find(Boolean)
    if (!probe) continue
    await invoke(src.id, PROBE_CAP_OF[probe.method] ?? 'latest', probe.args, (h) =>
      h.call(probe.method, probe.args),
      undefined,
      { bypassCache: true },
    )
    return { sourceId: src.id, name: src.name, channel: getLastGoodChannel() }
  }
  throw new PluginError('CONFIG_INVALID', '没有已启用的数据源可供测试')
}

/** 探测方法对应的能力（用于预检与缓存键） */
const PROBE_CAP_OF: Record<string, PluginCapability> = {
  getLatestUpdates: 'latest',
  getWeeklySchedule: 'weekly',
  getRank: 'rank',
  getCatalogMeta: 'catalog',
  search: 'search',
}
