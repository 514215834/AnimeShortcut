/** 插件能力标识（接口规范 §4；v1.2 追加 catalog/rank 扩展能力） */
export type PluginCapability =
  | 'weekly'
  | 'latest'
  | 'search'
  | 'detail'
  | 'play'
  | 'catalog'
  | 'rank'

/** 分类筛选组定义（getCatalogMeta 返回） */
export interface CatalogFilterDef {
  key: string
  label: string
  options: Array<{ value: string; label: string }>
}

/** 分类查询参数：key 为筛选组 key（如 region/genre），值 "all" 表示不限 */
export type CatalogQuery = Record<string, string>

export interface RankEntry {
  rankNo: number
  animeId: string
  title: string
  /** 热度/计数等展示值 */
  score?: string
}

export interface RankGroup {
  name: string
  entries: RankEntry[]
}

/** manifest 的用户可配置项声明（接口规范 §4.2） */
export interface PluginConfigField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  default?: string | number | boolean
  options?: Array<{ value: string; label: string }>
  required?: boolean
  placeholder?: string
}

/** 插件清单（接口规范 §4） */
export interface PluginManifest {
  manifestVersion: string
  id: string
  name: string
  version: string
  siteUrl: string
  icon?: string
  type: 'builtin' | 'remote'
  entry: string
  sandbox: 'worker' | 'main'
  capabilities: PluginCapability[]
  permissions: { domains: string[]; storage?: boolean }
  config?: PluginConfigField[]
  cacheHints?: Partial<Record<PluginCapability, number>>
  description?: string
  author?: string
  sha256?: string
}

/** 插件可抛出的标准错误（接口规范 §9） */
export type PluginErrorCode =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'DOMAIN_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'PARSE'
  | 'UNSUPPORTED'
  | 'CONFIG_INVALID'
  | 'UPSTREAM_CHANGED'
  | 'UNKNOWN'

export class PluginError extends Error {
  readonly code: PluginErrorCode
  constructor(code: PluginErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options ? { cause: options.cause } : undefined)
    this.name = 'PluginError'
    this.code = code
  }
}

// ========= 统一领域模型（接口规范 §7）=========

/** 列表项（周更表/最新更新/搜索共用）。sourceId 由宿主在调用返回后注入，插件不携带 */
export interface AnimeSummary {
  /** 宿主注入的来源插件 id（= manifest.id）；插件返回值中不存在 */
  sourceId?: string
  animeId: string
  title: string
  cover?: string
  weekday?: number
  latestEpisodeTitle?: string
  updateTime?: number
  playPageUrl?: string
}

export interface Episode {
  episodeId: string
  title: string
  playPageUrl?: string
  updateTime?: number
  /** 所在线路显示名与序号（规范 v1.1 追加的可选字段，用于详情页线路分组） */
  line?: string
  lineIndex?: number
  episodeIndex?: number
}

export interface AnimeDetail extends AnimeSummary {
  description?: string
  region?: string
  genres: string[]
  status?: 'ongoing' | 'finished' | 'unknown'
  episodes: Episode[]
}

export interface PagedResult<T> {
  items: T[]
  page: number
  hasMore: boolean
}

export interface PlayResult {
  type: 'page' | 'stream'
  url: string
  referer?: string
}

// ========= 宿主上下文（接口规范 §6）=========

export interface RawResponse {
  status: number
  headers: Record<string, string>
  body: ArrayBuffer
}

export interface HttpOptions {
  timeoutMs?: number
  headers?: Record<string, string>
  referer?: string
  ttlMs?: number
}

export interface PluginEnv {
  hostVersion: string
  specVersion: '1.0'
  locale: string
  timezone: string
  /** 宿主运行形态：插件可据此选择开发联调通道（如同源相对路径），生产必须走白名单域名 */
  mode: 'dev' | 'production'
}

export interface PluginContext {
  env: PluginEnv
  http: {
    getJson<T>(url: string, opts?: HttpOptions): Promise<T>
    getText(url: string, opts?: HttpOptions): Promise<string>
    getRaw(url: string, opts?: HttpOptions): Promise<RawResponse>
  }
  dom: {
    query(
      html: string,
      selector: string,
      opts?: { attr?: string; all?: boolean },
    ): Promise<string | Array<string | null> | null>
  }
  /** 仅 sandbox: main 提供完整 DOMParser 文档 */
  domDocument?: { parse(html: string): Document }
  storage: {
    get<T>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    keys(): Promise<string[]>
  }
  log: {
    debug(...a: unknown[]): void
    info(...a: unknown[]): void
    warn(...a: unknown[]): void
    error(...a: unknown[]): void
  }
  utils: {
    absUrl(base: string, path: string): string
    decodeEntities(text: string): string
    hashId(input: string): string
  }
}

export type PluginFactory = (
  host: PluginContext,
) => AnimeSourcePlugin | Promise<AnimeSourcePlugin>

// ========= 插件包与沙箱（docs/插件导入导出与热插拔设计.md §3/§5）=========

/** 插件包：导入/导出/持久化的统一载体，单文件 JSON（.asplugin.json） */
export interface PluginPackage {
  formatVersion: 1
  manifest: PluginManifest
  /** esbuild/rolldown IIFE 自包含 bundle 文本；工厂函数按规范 §5.1 挂 self.__AS_PLUGIN__ */
  code: string
}

/** 已安装插件的持久化记录（IndexedDB: plugins，keyPath: key = manifest.id） */
export interface InstalledPluginRecord {
  key: string
  manifest: PluginManifest
  code: string
  installedAt: number
  origin: 'file' | 'url'
  sourceUrl?: string
}

/** 沙箱句柄：宿主对插件实例的统一调用面（builtin 本地直载与 worker 桥共用） */
export interface SandboxHandle {
  /** 方法名与规范 §5.1 接口一致，含 init / onUnload 生命周期 */
  call(method: string, args: unknown[]): Promise<unknown>
  destroy(): void
}

export interface AnimeSourcePlugin {
  readonly manifest: PluginManifest
  init(config: Record<string, string | number | boolean>): Promise<void>
  getWeeklySchedule?(page?: number): Promise<PagedResult<AnimeSummary>>
  getLatestUpdates?(page?: number): Promise<PagedResult<AnimeSummary>>
  search?(keyword: string, page?: number): Promise<PagedResult<AnimeSummary>>
  getDetail?(animeId: string): Promise<AnimeDetail>
  resolvePlay?(animeId: string, episodeId: string): Promise<PlayResult>
  /** 分类：meta 返回筛选组定义；getCatalog 按筛选查询（v1.2 扩展能力） */
  getCatalogMeta?(): CatalogFilterDef[]
  getCatalog?(query: CatalogQuery, page?: number): Promise<PagedResult<AnimeSummary>>
  /** 榜单：一次返回各榜单分组（周/月/总等，不分页）（v1.2 扩展能力） */
  getRank?(year?: string): Promise<RankGroup[]>
  onConfigChange?(config: Record<string, string | number | boolean>): Promise<void>
  onUnload?(): Promise<void>
}
