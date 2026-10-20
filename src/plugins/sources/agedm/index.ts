import { PluginError, type AnimeSummary, type CatalogFilterDef, type CatalogQuery, type PluginContext, type PluginFactory, type RankGroup } from '../../host/types'
import type {
  AgedmDetailResponse,
  AgedmHomeList,
  AgedmItem,
  AgedmSearchItem,
  AgedmUpdateList,
} from './mapping'
import * as m from './mapping'
import { manifest } from './manifest'

const DEFAULT_API_BASE = 'https://api.agedm.io/v2/'
/** 开发联调通道（规范 §6.1 开发例外）：Vite dev server 同源代理，见 vite.config.ts */
const DEV_API_BASE = '/agedm-api/'
const LATEST_PAGE_SIZE = 30
const SEARCH_PAGE_SIZE = 24
const CATALOG_PAGE_SIZE = 30
/** resolvePlay 内部请求的 http 层缓存：详情 5 分钟、解析器结果 10 分钟（首播快、重复播放零请求） */
const DETAIL_TTL_MS = 300_000
const PARSER_TTL_MS = 600_000

/** 分类筛选组（站点 UI 固定项；年份区间与源站一致：今年~2009） */
function buildCatalogFilters(): CatalogFilterDef[] {
  const yearOpts = [{ value: 'all', label: '全部' }]
  for (let y = new Date().getFullYear(); y >= 2009; y--) yearOpts.push({ value: String(y), label: String(y) })
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  return [
    { key: 'region', label: '地区', options: [{ value: 'all', label: '全部' }, { value: '日本', label: '日本' }, { value: '中国', label: '中国' }, { value: '欧美', label: '欧美' }] },
    { key: 'genre', label: '版本', options: [{ value: 'all', label: '全部' }, { value: 'TV', label: 'TV' }, { value: '剧场版', label: '剧场版' }, { value: 'OVA', label: 'OVA' }] },
    { key: 'letter', label: '首字母', options: [{ value: 'all', label: '全部' }, ...letters.map((l) => ({ value: l, label: l }))] },
    { key: 'year', label: '年份', options: yearOpts },
  ]
}

const RANK_GROUP_NAMES = ['周榜', '月榜', '总榜']

export function createAgedmPlugin(): PluginFactory {
  return (host: PluginContext) => {
    let base = DEFAULT_API_BASE
    const api = (path: string) => base + path.replace(/^\//, '')

    return {
    manifest,
    async init(config) {
      const v = config['apiBaseUrl']
      base =
        typeof v === 'string' && v.trim()
          ? v.trim().replace(/\/+$/, '') + '/'
          : host.env.mode === 'dev'
            ? DEV_API_BASE
            : DEFAULT_API_BASE
    },
      async getWeeklySchedule(page = 1) {
        // home-list 单页返回整周数据，按规范周更表不做分页
        if (page > 1) return { items: [], page, hasMore: false }
        const data = m.unwrap<AgedmHomeList>(
          await host.http.getJson<unknown>(api('home-list')),
          'home-list',
        )
        const wl = data.week_list ?? {}
        const items: AnimeSummary[] = []
        for (const wd of Object.keys(wl).sort()) {
          for (const it of wl[wd] ?? []) items.push(m.weekToSummary(it))
        }
        return { items, page: 1, hasMore: false }
      },
      async getLatestUpdates(page = 1) {
        const data = m.unwrap<AgedmUpdateList>(
          await host.http.getJson<unknown>(api(`update?page=${page}&size=${LATEST_PAGE_SIZE}`)),
          'update',
        )
        const total = Number(data.total) || 0
        return {
          items: (data.videos ?? []).map((it: AgedmItem) => m.updateToSummary(it)),
          page,
          hasMore: total > page * LATEST_PAGE_SIZE,
        }
      },
      async search(keyword, page = 1) {
        const kw = encodeURIComponent(keyword)
        const data = m.unwrap<{ videos: AgedmSearchItem[] }>(
          await host.http.getJson<unknown>(api(`search?query=${kw}&page=${page}`)),
          'search',
        )
        return {
          items: (data.videos ?? []).map((it) => m.searchToSummary(it)),
          page,
          hasMore: (data.videos ?? []).length >= SEARCH_PAGE_SIZE,
        }
      },
      async getDetail(animeId) {
        const data = m.unwrap<AgedmDetailResponse>(
          await host.http.getJson<unknown>(api(`detail/${encodeURIComponent(animeId)}`)),
          'detail',
        )
        return m.toDetail(data)
      },
      async resolvePlay(animeId, episodeId) {
        const data = m.unwrap<AgedmDetailResponse>(
          await host.http.getJson<unknown>(api(`detail/${encodeURIComponent(animeId)}`), {
            ttlMs: DETAIL_TTL_MS,
          }),
          'detail',
        )
        const d = m.toDetail(data)
        const ep = d.episodes.find((e) => e.episodeId === episodeId)
        if (!ep?.playPageUrl) throw new PluginError('PARSE', `剧集不存在: ${animeId}:${episodeId}`)

        const streamUrl = await resolveStreamUrl(host, data, episodeId)
        if (streamUrl) return { type: 'stream', url: streamUrl, referer: m.SITE_URL }
        // 解析失败/加密线路：回落跳转源站播放页（规范 §5.1 PlayResult.type='page'）
        return { type: 'page', url: ep.playPageUrl }
      },
      getCatalogMeta() {
        return buildCatalogFilters()
      },
      async getCatalog(query: CatalogQuery, page = 1) {
        const qs = new URLSearchParams()
        for (const key of ['region', 'genre', 'letter', 'year']) {
          const v = query[key]
          qs.set(key, typeof v === 'string' && v ? v : 'all')
        }
        qs.set('page', String(page))
        qs.set('size', String(CATALOG_PAGE_SIZE))
        const data = m.unwrap<{ total: string | number; videos: AgedmSearchItem[] }>(
          await host.http.getJson<unknown>(api(`catalog?${qs.toString()}`)),
          'catalog',
        )
        const total = Number(data.total) || 0
        return {
          items: (data.videos ?? []).map((it) => m.searchToSummary(it)),
          page,
          hasMore: total > page * CATALOG_PAGE_SIZE,
        }
      },
      async getRank(year?: string) {
        const y = typeof year === 'string' && year ? year : 'all'
        const data = m.unwrap<{ rank: Array<Array<{ NO: number; AID: number | string; CCnt?: string; Title: string }>> }>(
          await host.http.getJson<unknown>(api(`rank?year=${encodeURIComponent(y)}`)),
          'rank',
        )
        return (data.rank ?? []).map((entries, gi): RankGroup => ({
          name: RANK_GROUP_NAMES[gi] ?? `榜${gi + 1}`,
          entries: entries.map((e) => ({
            rankNo: e.NO,
            animeId: String(e.AID),
            title: e.Title,
            score: e.CCnt,
          })),
        }))
      },
    }
  }
}

/** 规范 §5.1：默认导出工厂函数（打包分发与自动发现统一走默认导出） */
export default createAgedmPlugin()

/**
 * 剧集 token → 站方解析器 → 直连 m3u8（探测报告 §5 实测链路）。
 * 任一环节不满足（无 token/无解析器/解析失败/非流地址）返回 undefined，调用方回落跳转。
 */
async function resolveStreamUrl(
  host: PluginContext,
  data: AgedmDetailResponse,
  episodeId: string,
): Promise<string | undefined> {
  const parsed = /^(\d+):(\d+)$/.exec(episodeId)
  if (!parsed) return undefined
  const li = Number(parsed[1])
  const ei = Number(parsed[2])
  // 与 mapping.toDetail 的线路过滤/排序保持一致，保证 lineIndex 对齐
  const lines = Object.entries(data.video.playlists ?? {}).filter(
    ([, eps]) => Array.isArray(eps) && eps.length > 0,
  )
  const token = lines[li]?.[1]?.[ei]?.[1]
  const zj = data.player_jx?.zj
  if (!token || !zj) return undefined
  // VIP 线路走 vip 前缀（探测报告 §5）
  const vipCodes = (data.player_vip ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const prefix = vipCodes.includes(lines[li]?.[0] ?? '') ? (data.player_jx?.vip ?? zj) : zj
  try {
    const html = await host.http.getText(prefix + token, { ttlMs: PARSER_TTL_MS })
    const vurl = m.extractStreamVurl(html)
    if (!vurl) host.log.warn('解析器未返回流地址，回落跳转源站播放', episodeId)
    return vurl
  } catch (e) {
    host.log.warn('流地址解析失败，回落跳转源站播放', e)
    return undefined
  }
}
