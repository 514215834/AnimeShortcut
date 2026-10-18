import { PluginError, type AnimeDetail, type AnimeSummary, type Episode, type PlayResult } from '../../host/types'

// ========= agedm 原始响应结构（字段依据 docs/探测报告-agedm.md 实测）=========

/** search / detail 走信封结构；update / home-list 为裸结构 */
export interface AgedmEnvelope<T> {
  code: number
  message: string
  data?: T
}

export interface AgedmItem {
  AID: number | string
  Href?: string
  NewTitle?: string
  PicSmall?: string
  Title: string
}

export interface AgedmWeekItem {
  isnew?: number
  id: number | string
  wd: number
  name: string
  mtime?: string
  namefornew?: string
}

export interface AgedmHomeList {
  latest: AgedmItem[]
  recommend?: AgedmItem[]
  week_list?: Record<string, AgedmWeekItem[]>
}

export interface AgedmUpdateList {
  total: string | number
  videos: AgedmItem[]
}

export interface AgedmSearchItem {
  id: number | string
  name: string
  uptodate?: string
  time?: number
  status?: string
  cover?: string
  intro?: string
  tags_arr?: string[]
  tags?: string
  area?: string
  year?: string
  type?: string
}

export interface AgedmDetailResponse {
  video: {
    id: number | string
    name: string
    cover?: string
    intro?: string
    area?: string
    year?: string
    status?: string
    uptodate?: string
    tags_arr?: string[]
    tags?: string
    playlists?: Record<string, Array<[string, string]>>
  }
  player_label_arr?: Record<string, string>
}

export const SITE_URL = 'https://m.agedm.io'

/** 统一包裹处理：有 code 字段按信封解包，否则视为裸结构 */
export function unwrap<T>(raw: unknown, apiName: string): T {
  if (typeof raw === 'object' && raw !== null && 'code' in raw) {
    const env = raw as AgedmEnvelope<T>
    if (env.code === 200 && env.data !== undefined) return env.data
    const err = new PluginError(
      env.code === 40050 ? 'CONFIG_INVALID' : 'PARSE',
      `${apiName}: ${env.message || `code=${env.code}`}`,
    )
    throw err
  }
  return raw as T
}

/** 解析源站时间 "2026-10-18 01:02:53"（未标注时区，按站点受众惯例视为 UTC+8） */
export function parseSiteTime(mtime?: string): number | undefined {
  if (!mtime) return undefined
  const ts = Date.parse(mtime.replace(' ', 'T') + '+08:00')
  return Number.isNaN(ts) ? undefined : ts
}

/** 详情页跳转地址（源站 hash 路由） */
export function detailPageUrl(animeId: string | number): string {
  return `${SITE_URL}/#/detail/${animeId}`
}

/**
 * 播放页跳转地址。源站语义（探测报告 §5，已从源站代码确认）：
 * l = 1-based 非空线路序号，e = 1-based 集序号。
 */
export function playPageUrl(animeId: string | number, lineIndex0: number, episodeIndex0: number): string {
  return `${SITE_URL}/#/play/${animeId}/${lineIndex0 + 1}/${episodeIndex0 + 1}`
}

export function updateToSummary(it: AgedmItem): AnimeSummary {
  return {
    animeId: String(it.AID),
    title: it.Title,
    cover: it.PicSmall,
    latestEpisodeTitle: it.NewTitle,
    playPageUrl: detailPageUrl(it.AID),
  }
}

export function searchToSummary(it: AgedmSearchItem): AnimeSummary {
  return {
    animeId: String(it.id),
    title: it.name,
    cover: it.cover,
    latestEpisodeTitle: it.uptodate,
    updateTime: typeof it.time === 'number' ? it.time * 1000 : undefined,
    playPageUrl: detailPageUrl(it.id),
  }
}

export function weekToSummary(it: AgedmWeekItem): AnimeSummary {
  return {
    animeId: String(it.id),
    title: it.name,
    weekday: it.wd,
    latestEpisodeTitle: it.namefornew,
    updateTime: parseSiteTime(it.mtime),
    playPageUrl: detailPageUrl(it.id),
  }
}

const STATUS_MAP: Record<string, 'ongoing' | 'finished' | 'unknown'> = {
  连载: 'ongoing',
  完结: 'finished',
}

export function toDetail(resp: AgedmDetailResponse): AnimeDetail {
  const v = resp.video
  const lines = Object.entries(v.playlists ?? {}).filter(
    ([, eps]) => Array.isArray(eps) && eps.length > 0,
  )
  const label = resp.player_label_arr ?? {}
  const episodes: Episode[] = lines.flatMap(([code, eps], li) =>
    eps.map((ep, ei) => ({
      episodeId: `${li}:${ei}`,
      title: ep[0] || `第${ei + 1}集`,
      line: label[code] || code,
      lineIndex: li,
      episodeIndex: ei,
      playPageUrl: playPageUrl(v.id, li, ei),
    })),
  )
  return {
    animeId: String(v.id),
    title: v.name,
    cover: v.cover,
    description: v.intro,
    region: [v.area, v.year].filter(Boolean).join(' / ') || undefined,
    genres: v.tags_arr ?? (v.tags ? v.tags.split(/\s+/).filter(Boolean) : []),
    status: STATUS_MAP[v.status ?? ''] ?? 'unknown',
    latestEpisodeTitle: v.uptodate,
    playPageUrl: detailPageUrl(v.id),
    episodes,
  }
}

/** resolvePlay：MVP 返回源站播放页跳转（流地址解析在迭代 3） */
export function playResult(animeId: string, episodeId: string): PlayResult {
  const m = /^(\d+):(\d+)$/.exec(episodeId)
  if (!m) throw new PluginError('PARSE', `非法的剧集标识: ${episodeId}`)
  return { type: 'page', url: playPageUrl(animeId, Number(m[1]), Number(m[2])) }
}
