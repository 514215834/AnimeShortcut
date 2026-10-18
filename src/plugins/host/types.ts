/** 插件能力标识（接口规范 §4） */
export type PluginCapability = 'weekly' | 'latest' | 'search' | 'detail' | 'play'

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

export interface AnimeSourcePlugin {
  readonly manifest: PluginManifest
  init(config: Record<string, string | number | boolean>): Promise<void>
  getWeeklySchedule?(page?: number): Promise<PagedResult<AnimeSummary>>
  getLatestUpdates?(page?: number): Promise<PagedResult<AnimeSummary>>
  search?(keyword: string, page?: number): Promise<PagedResult<AnimeSummary>>
  getDetail?(animeId: string): Promise<AnimeDetail>
  resolvePlay?(animeId: string, episodeId: string): Promise<PlayResult>
  onConfigChange?(config: Record<string, string | number | boolean>): Promise<void>
  onUnload?(): Promise<void>
}
