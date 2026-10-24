/**
 * 宿主契约类型（与 src/plugins/host/types 保持一致的最小自包含声明）
 *
 * 说明：本文件仅声明《数据源插件接口规范》v1.6 定义的形状；
 * 若宿主仓库已存在 `src/plugins/host/types`，可整体删除本文件并改为
 * `import type { ... } from '../../host/types'`（agedm 插件即为此形态）。
 */

// ———— §5.1 能力与清单 ————

export type PluginCapability =
  | 'weekly'
  | 'latest'
  | 'search'
  | 'detail'
  | 'play'
  | 'catalog'
  | 'rank';

export interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
}

export interface PluginManifest {
  manifestVersion: string;
  id: string;
  name: string;
  version: string;
  siteUrl: string;
  icon?: string;
  type: 'builtin' | 'remote';
  entry: string;
  sandbox: 'worker' | 'main';
  capabilities: PluginCapability[];
  permissions: { domains: string[]; storage?: boolean };
  config?: ConfigField[];
  cacheHints?: Record<string, number>;
  description?: string;
  author?: string;
  sha256?: string;
}

// ———— §6 宿主上下文 ————

export interface HttpOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  referer?: string;
  ttlMs?: number;
}

export interface RawResponse {
  status: number;
  headers?: Record<string, string>;
  body?: ArrayBuffer | null;
}

export interface PluginContext {
  env: {
    hostVersion: string;
    specVersion: '1.0';
    locale: string;
    timezone: string;
    mode: 'dev' | 'production';
  };
  http: {
    getJson<T>(url: string, opts?: HttpOptions): Promise<T>;
    getText(url: string, opts?: HttpOptions): Promise<string>;
    getRaw(url: string, opts?: HttpOptions): Promise<RawResponse>;
  };
  dom: {
    query(
      html: string,
      selector: string,
      opts?: { attr?: string; all?: boolean },
    ): Promise<string | string[] | null>;
  };
  /** 仅 sandbox: main 时存在；worker 沙箱下为 undefined。本插件不使用。 */
  domDocument?: { parse(html: string): Document };
  storage: {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  log: {
    debug(...a: unknown[]): void;
    info(...a: unknown[]): void;
    warn(...a: unknown[]): void;
    error(...a: unknown[]): void;
  };
  utils: {
    absUrl(base: string, path: string): string;
    decodeEntities(text: string): string;
    hashId(input: string): string;
  };
}

// ———— §7 统一数据模型 ————

export interface AnimeSummary {
  animeId: string;
  title: string;
  cover?: string;
  weekday?: number;
  latestEpisodeTitle?: string;
  updateTime?: number;
  playPageUrl?: string;
}

export interface Episode {
  episodeId: string;
  title: string;
  playPageUrl?: string;
  updateTime?: number;
  line?: string;
  lineIndex?: number;
  episodeIndex?: number;
}

export interface AnimeDetail extends AnimeSummary {
  description?: string;
  region?: string;
  genres: string[];
  status?: 'ongoing' | 'finished' | 'unknown';
  episodes: Episode[];
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

export interface PlayResult {
  type: 'page' | 'stream';
  url: string;
  referer?: string;
}

// ———— §15 扩展能力 ————

export interface CatalogFilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export type CatalogQuery = Record<string, string>;

export interface RankEntry {
  rankNo: number;
  animeId: string;
  title: string;
  score?: string;
}

export interface RankGroup {
  name: string;
  entries: RankEntry[];
}

// ———— §5.1 插件实现接口 ————

export interface AnimeSourcePlugin {
  readonly manifest: PluginManifest;
  init(config: Record<string, string | number | boolean>): Promise<void>;
  getLatestUpdates?(page?: number): Promise<PagedResult<AnimeSummary>>;
  search?(keyword: string, page?: number): Promise<PagedResult<AnimeSummary>>;
  getDetail?(animeId: string): Promise<AnimeDetail>;
  resolvePlay?(animeId: string, episodeId: string): Promise<PlayResult>;
  getCatalogMeta?(): CatalogFilterDef[];
  getCatalog?(
    query: CatalogQuery,
    page?: number,
  ): Promise<PagedResult<AnimeSummary>>;
  getRank?(year?: string): Promise<RankGroup[]>;
  onConfigChange?(config: Record<string, string | number | boolean>): Promise<void>;
  onUnload?(): Promise<void>;
}

// ———— §9 错误 ————

/** 插件抛出的错误须为可识别形状 { code, message, cause? } */
export class PluginError extends Error {
  readonly code: string;
  declare readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    if (cause !== undefined) {
      // 兼容 ES2022 之前的 lib：手动绑定 cause
      Object.defineProperty(this, 'cause', { value: cause, enumerable: false, writable: true, configurable: true });
    }
  }
}
