import { PluginError, type AnimeDetail, type AnimeSummary, type Episode } from '../../host/types'

// ========= maccms（苹果CMS）原始结构（字段依据 docs/探测报告-yinhuadm.md 实测）=========

export interface MacVod {
  vod_id: number | string
  vod_name: string
  vod_pic?: string
  vod_remarks?: string
  vod_time?: string
  vod_class?: string
  vod_area?: string
  vod_year?: string | number
  vod_content?: string
  vod_weekday?: string
  vod_isend?: string | number
  vod_status?: string | number
  vod_play_from?: string
  vod_play_url?: string
}

/** ac=detail 响应信封（列表/搜索/详情共用） */
export interface MacDetailEnvelope {
  code: number
  page?: number | string
  limit?: number | string
  pagecount?: number | string
  total?: number | string
  list?: MacVod[]
}

export const SITE_BASE = 'https://www.yinhuadm.cc/'

/** 站点本地时间（UTC+8，无时区标注）→ 毫秒时间戳 */
export function parseVodTime(s?: string): number | undefined {
  if (!s) return undefined
  const ts = Date.parse(s.trim().replace(' ', 'T') + '+08:00')
  return Number.isNaN(ts) ? undefined : ts
}

/** vod_pic 相对路径 → 绝对 https URL；http: 一律升级 */
export function absCover(pic?: string): string | undefined {
  if (!pic) return undefined
  const p = pic.trim()
  const abs = /^https?:\/\//i.test(p) ? p : SITE_BASE + p.replace(/^\//, '')
  return abs.replace(/^http:\/\//i, 'https://')
}

export function detailPageUrl(vodId: string | number): string {
  return `${SITE_BASE}v/${vodId}.html`
}

/** JSON API 列表项（最新/搜索）→ 列表项 */
export function vodToSummary(v: MacVod): AnimeSummary {
  return {
    animeId: String(v.vod_id),
    title: v.vod_name,
    cover: absCover(v.vod_pic),
    latestEpisodeTitle: v.vod_remarks || undefined,
    updateTime: parseVodTime(v.vod_time),
    playPageUrl: detailPageUrl(v.vod_id),
  }
}

/** 剧集播放页（线路/集均 1-based，探测报告 §2.3） */
export function playPageUrl(vodId: string | number, lineIndex0: number, epIndex0: number): string {
  return `${SITE_BASE}p/${vodId}-${lineIndex0 + 1}-${epIndex0 + 1}.html`
}

/** 周表中文档期 → 规范 weekday（0=周日）；无法识别返回 undefined */
export function weekdayFromLabel(label: string): number | undefined {
  const i = '日一二三四五六'.indexOf(label.replace(/^周/, '').trim().charAt(0))
  return i < 0 ? undefined : i
}

/** 剥 HTML 标签（vod_content 个别含内联标签） */
export function stripHtml(s?: string): string | undefined {
  if (!s) return undefined
  const t = s.replace(/<[^>]+>/g, '').trim()
  return t || undefined
}

/** 信封校验：maccms 恒回 code:1 + list 数组（空结果也是 code:1） */
export function unwrapEnvelope<T extends MacDetailEnvelope>(raw: unknown, apiName: string): T & { list: MacVod[] } {
  if (typeof raw !== 'object' || raw === null || (raw as T).code !== 1 || !Array.isArray((raw as T).list)) {
    throw new PluginError('PARSE', `${apiName}: 响应结构异常（源站可能改版）`)
  }
  return raw as T & { list: MacVod[] }
}

const STATUS_RE = /完结/

export function statusOf(v: MacVod): 'ongoing' | 'finished' | 'unknown' {
  if (String(v.vod_isend) === '1' || STATUS_RE.test(v.vod_remarks ?? '')) return 'finished'
  if (String(v.vod_status) === '1') return 'ongoing'
  return 'unknown'
}

/** 线路代码 → 展示名（探测报告 §5；未知代码原样展示） */
const LINE_NAMES: Record<string, string> = {
  bfzym3u8: '暴风',
  lzm3u8: '量子',
  ffm3u8: '非凡',
  wjm3u8: '无尽',
  xlm3u8: '星辰',
  zjm3u8: '加强',
  kkm3u8: '快看',
  mdm3u8: '木莓',
  dbm3u8: '豆瓣',
  tpm3u8: '淘片',
}

export function lineName(code: string): string {
  return LINE_NAMES[code.trim()] ?? code.trim()
}

/** vod_play_url → 剧集列表：线路 `$$$` 分隔，集 `#` 分隔，集名$URL */
export function episodesOf(v: MacVod): Episode[] {
  const froms = (v.vod_play_from ?? '').split('$$$').map((s) => s.trim())
  const groups = (v.vod_play_url ?? '').split('$$$')
  const episodes: Episode[] = []
  groups.forEach((group, li) => {
    const segs = group.split('#').filter((s) => s.trim())
    segs.forEach((seg, ei) => {
      const di = seg.indexOf('$')
      const title = di > 0 ? seg.slice(0, di).trim() : seg.trim()
      const url = di > 0 ? seg.slice(di + 1).trim() : ''
      if (!url && !title) return
      episodes.push({
        episodeId: `${li}:${ei}`,
        title: title || `第${ei + 1}集`,
        line: froms[li] ? lineName(froms[li]) : undefined,
        lineIndex: li,
        episodeIndex: ei,
        playPageUrl: playPageUrl(v.vod_id, li, ei),
      })
    })
  })
  return episodes
}

/** 详情映射。decodeEntities 允许返回 Promise：Worker 沙箱下 utils.decodeEntities 是异步 RPC（规范 §10），main 沙箱为同步字符串 */
export async function toDetail(v: MacVod, decodeEntities: (s: string) => string | Promise<string>): Promise<AnimeDetail> {
  const rawContent = await decodeEntities(v.vod_content ?? '')
  return {
    animeId: String(v.vod_id),
    title: v.vod_name,
    cover: absCover(v.vod_pic),
    description: stripHtml(rawContent) || undefined,
    region: [v.vod_area, v.vod_year ? String(v.vod_year) : ''].filter(Boolean).join(' / ') || undefined,
    genres: (v.vod_class ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    status: statusOf(v),
    latestEpisodeTitle: v.vod_remarks || undefined,
    playPageUrl: detailPageUrl(v.vod_id),
    episodes: episodesOf(v),
  }
}

/** 周表卡片（/label/week.html a.module-poster-item）→ 列表项 */
export function weekCardToSummary(href: string | null, title: string | null, note: string | null, cover: string | null, weekday: number | undefined): AnimeSummary {
  const m = /\/v\/([0-9]+)\.html/.exec(href ?? '')
  if (!m || !title) throw new PluginError('PARSE', '周表卡片结构异常（缺少番剧 id 或标题）')
  return {
    animeId: m[1],
    title,
    cover: absCover(cover ?? undefined),
    latestEpisodeTitle: note || undefined,
    weekday,
    playPageUrl: detailPageUrl(m[1]),
  }
}
