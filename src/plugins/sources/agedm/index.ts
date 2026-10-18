import { PluginError, type AnimeSummary, type PluginContext, type PluginFactory } from '../../host/types'
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
const LATEST_PAGE_SIZE = 30
const SEARCH_PAGE_SIZE = 24

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
          await host.http.getJson<unknown>(api(`detail/${encodeURIComponent(animeId)}`)),
          'detail',
        )
        const d = m.toDetail(data)
        const ep = d.episodes.find((e) => e.episodeId === episodeId)
        if (!ep?.playPageUrl) throw new PluginError('PARSE', `剧集不存在: ${animeId}:${episodeId}`)
        return { type: 'page', url: ep.playPageUrl }
      },
    }
  }
}
