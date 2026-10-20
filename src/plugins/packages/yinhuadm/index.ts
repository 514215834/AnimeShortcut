import { PluginError, type AnimeSummary, type PlayResult, type PluginContext, type PluginFactory, type PagedResult } from '../../host/types'
import * as m from './mapping'
import { manifest } from './manifest'

/** maccms JSON API 相对基址（探测报告 §2.1） */
const API = 'api.php/provide/vod/'
/** 每页条数由接口固定返回（limit=20），分页语义以 pagecount 为准 */
const WEEK_PAGE_PATH = 'label/week.html'

export function createYinhuadmPlugin(): PluginFactory {
  return (host: PluginContext) => {
    const api = (query: string) => m.SITE_BASE + API + query
    const decode = (s: string) => host.utils.decodeEntities(s)

    return {
      manifest,
      async init() {
        /* 无配置项；站内派生状态在每次调用时从响应解析，无状态 */
      },
      // 周更表：/label/week.html 七个面板 DOM 顺序 = 周一~周日（探测报告 §2.2），整表单页返回。
      // 全程只用标准 dom.query（attr 支持 outerHTML 分块二次解析），不依赖 main 沙箱的 domDocument ——
      // 插件包可在 Worker 沙箱以 remote 形态运行（规范 §3/§6）
      async getWeeklySchedule(page = 1): Promise<PagedResult<AnimeSummary>> {
        if (page > 1) return { items: [], page, hasMore: false }
        const html = await host.http.getText(m.SITE_BASE + WEEK_PAGE_PATH)
        const panels = await host.dom.query(html, 'div.module-main', { attr: 'outerHTML', all: true })
        if (!panels || panels.length === 0) {
          throw new PluginError('PARSE', '周表结构异常（未找到分日面板，源站可能改版）')
        }
        const labels = (await host.dom.query(html, '.module-tab-week .module-tab-item', { all: true })) ?? []
        const CARD_SEL = 'a.module-poster-item'
        const items: AnimeSummary[] = []
        for (let pi = 0; pi < panels.length; pi++) {
          const weekday = m.weekdayFromLabel((labels[pi] ?? '').trim()) ?? ((pi + 1) % 7)
          const panelHtml = panels[pi]
          if (!panelHtml) continue
          const [hrefs, titles, notes, covers] = await Promise.all([
            host.dom.query(panelHtml, CARD_SEL, { attr: 'href', all: true }),
            host.dom.query(panelHtml, CARD_SEL, { attr: 'title', all: true }),
            host.dom.query(panelHtml, `${CARD_SEL} .module-item-note`, { all: true }),
            host.dom.query(panelHtml, `${CARD_SEL} img`, { attr: 'data-original', all: true }),
          ])
          const n = hrefs?.length ?? 0
          for (let ci = 0; ci < n; ci++) {
            items.push(
              m.weekCardToSummary(
                hrefs?.[ci] ?? null,
                titles?.[ci] ?? null,
                notes?.[ci] ?? null,
                covers?.[ci] ?? null,
                weekday,
              ),
            )
          }
        }
        return { items, page: 1, hasMore: false }
      },
      async getLatestUpdates(page = 1): Promise<PagedResult<AnimeSummary>> {
        const env = m.unwrapEnvelope(
          await host.http.getJson<unknown>(api(`?ac=detail&pg=${page}`)),
          '最新更新',
        )
        const pagecount = Number(env.pagecount) || 1
        return {
          items: env.list.map((v) => m.vodToSummary(v)),
          page,
          hasMore: page < pagecount,
        }
      },
      async search(keyword, page = 1): Promise<PagedResult<AnimeSummary>> {
        const env = m.unwrapEnvelope(
          await host.http.getJson<unknown>(api(`?ac=detail&wd=${encodeURIComponent(keyword)}&pg=${page}`)),
          '搜索',
        )
        const pagecount = Number(env.pagecount) || 1
        return {
          items: env.list.map((v) => m.vodToSummary(v)),
          page,
          hasMore: page < pagecount,
        }
      },
      async getDetail(animeId) {
        const env = m.unwrapEnvelope(
          await host.http.getJson<unknown>(api(`?ac=detail&ids=${encodeURIComponent(animeId)}`)),
          '详情',
        )
        const v = env.list[0]
        if (!v) throw new PluginError('PARSE', `番剧不存在: ${animeId}`)
        return m.toDetail(v, decode)
      },
      // vod_play_url 直出 m3u8（探测报告 §2.1），单请求完成流解析；缺集/无直链回落跳转
      async resolvePlay(animeId, episodeId): Promise<PlayResult> {
        const env = m.unwrapEnvelope(
          await host.http.getJson<unknown>(api(`?ac=detail&ids=${encodeURIComponent(animeId)}`)),
          '详情',
        )
        const v = env.list[0]
        if (!v) throw new PluginError('PARSE', `番剧不存在: ${animeId}`)
        const parsed = /^(\d+):(\d+)$/.exec(episodeId)
        if (!parsed) throw new PluginError('PARSE', `非法的剧集标识: ${episodeId}`)
        const ep = m.episodesOf(v).find((e) => e.episodeId === episodeId)
        if (!ep) throw new PluginError('PARSE', `剧集不存在: ${animeId}:${episodeId}`)

        // 从 vod_play_url 原文取该集 URL（episodesOf 不回传流地址，按 li:ei 重查）
        const li = Number(parsed[1])
        const ei = Number(parsed[2])
        const group = (v.vod_play_url ?? '').split('$$$')[li] ?? ''
        const seg = group.split('#').filter((s) => s.trim())[ei] ?? ''
        const di = seg.indexOf('$')
        const url = di > 0 ? seg.slice(di + 1).trim() : ''
        if (/^https:\/\//i.test(url)) {
          return { type: 'stream', url, referer: m.SITE_BASE }
        }
        return { type: 'page', url: ep.playPageUrl ?? `https://www.yinhuadm.cc/p/${animeId}-${li + 1}-${ei + 1}.html` }
      },
    }
  }
}

/** 规范 §5.1：默认导出工厂函数（打包分发与自动发现统一走默认导出） */
export default createYinhuadmPlugin()
