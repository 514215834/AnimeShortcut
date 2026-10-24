import { manifest } from './manifest';
import { PluginError } from './types';
import type { AnimeDetail, AnimeSourcePlugin, PluginContext, PlayResult } from './types';
import * as m from './mapping';

/**
 * 动漫MIKU（www.dmmiku.com / maccms）数据源插件。
 *
 * 能力 → 端点（详见 PROBE.md）：
 *   getLatestUpdates → /index.php/map/index.html          （最近更新，全量单页）
 *   search           → /index.php/vod/search?wd=…        （单页全量）
 *   getDetail        → /index.php/vod/detail/id/{id}.html
 *   resolvePlay      → 详情定位剧集 → 播放页 player_aaaa（可流播则 stream，否则 page）
 *   getCatalog(Meta) → /index.php/vod/show/[class/…][id/…][year/…][letter/…][page/N].html
 *   getRank          → 详情页侧栏「新番周排行榜」（借稳定锚点详情页，1 次请求）
 *
 * 单次能力调用上游请求 ≤ 3；分页 page 从 1 起；失败 throw { code, message }。
 */
export default function createPlugin(host: PluginContext): AnimeSourcePlugin {
  let base = m.SITE_ROOT;
  let rankAnchorId = m.DEFAULT_RANK_ANCHOR_ID;

  const applyConfig = (config: Record<string, string | number | boolean>): void => {
    const v = config.siteBaseUrl;
    if (typeof v === 'string' && v.trim()) {
      base = v.trim().replace(/\/+$/, '').replace(/^http:/i, 'https:') + '/';
    } else {
      base = m.SITE_ROOT; // 幂等：恢复默认
    }
    const r = config.rankAnchorId;
    if (typeof r === 'number' && Number.isInteger(r) && r > 0) rankAnchorId = String(r);
    else if (typeof r === 'string' && /^\d+$/.test(r.trim())) rankAnchorId = r.trim();
    else rankAnchorId = m.DEFAULT_RANK_ANCHOR_ID;
  };

  return {
    manifest,

    /** 生命周期：幂等初始化，不发网络请求（规范 §5.2）。 */
    async init(config) {
      applyConfig(config);
      host.log.debug(`[dmmiku] init(base=${base}, rankAnchor=${rankAnchorId}, mode=${host.env.mode})`);
    },

    async onConfigChange(config) {
      applyConfig(config);
    },

    // ———— latest：最近更新（全量单页容量 120 条，hasMore 恒 false）————
    async getLatestUpdates(page = 1) {
      if (page > 1) return { items: [], page, hasMore: false };
      let html: string;
      try {
        html = await host.http.getText(`${base}index.php/map/index.html`);
      } catch (e) {
        m.rethrowUpstream(e);
      }
      const items = await m.listFromMapPage(host, base, html);
      return { items, page: 1, hasMore: false };
    },

    // ———— search：站内搜索（单页全量）————
    async search(keyword, page = 1) {
      const kw = (keyword ?? '').trim();
      if (!kw) return { items: [], page: 1, hasMore: false }; // 空关键字=查无结果，不请求
      if (page > 1) return { items: [], page, hasMore: false };
      let html: string;
      try {
        html = await host.http.getText(`${base}index.php/vod/search.html?wd=${encodeURIComponent(kw)}`);
      } catch (e) {
        m.rethrowUpstream(e);
      }
      const items = await m.listFromSearchPage(host, base, html);
      return { items, page: 1, hasMore: false };
    },

    // ———— detail：详情 + 剧集（1 次上游请求）————
    async getDetail(animeId) {
      const id = (animeId ?? '').trim();
      if (!id) throw new PluginError('CONFIG_INVALID', 'getDetail 缺少 animeId');
      let html: string;
      try {
        html = await host.http.getText(`${base}index.php/vod/detail/id/${encodeURIComponent(id)}.html`);
      } catch (e) {
        m.rethrowUpstream(e);
      }
      return m.parseDetailHtml(host, base, id, html);
    },

    // ———— play：详情定位剧集 → 播放页（预算 2/3；不可流播一律 page 跳转）————
    async resolvePlay(animeId, episodeId): Promise<PlayResult> {
      const id = (animeId ?? '').trim();
      const ep = (episodeId ?? '').trim();
      if (!id || !ep) throw new PluginError('CONFIG_INVALID', 'resolvePlay 缺少 animeId/episodeId');

      // 1) 详情（宿主 5min 去重缓存；并发与页面浏览重复命中）
      let detailHtml: string;
      try {
        detailHtml = await host.http.getText(
          `${base}index.php/vod/detail/id/${encodeURIComponent(id)}.html`,
          { ttlMs: 300_000 },
        );
      } catch (e) {
        m.rethrowUpstream(e);
      }
      const detail: AnimeDetail = await m.parseDetailHtml(host, base, id, detailHtml);
      const target = detail.episodes.find((e) => e.episodeId === ep);
      if (!target) throw new PluginError('PARSE', `剧集不存在: ${id}:${ep}`);

      const pageUrl = target.playPageUrl ?? m.firstEpisodePageUrl(base, id);

      // 2) 播放页提流：player_aaaa.url 为直链媒体文件时升级 stream；占位 token/解析器依赖 → page
      let playHtml: string;
      try {
        playHtml = await host.http.getText(pageUrl);
      } catch (e) {
        m.rethrowUpstream(e);
      }
      const player = m.parsePlayerData(playHtml);
      if (!player) throw new PluginError('PARSE', '源站可能改版：播放页缺少 player_aaaa 数据');
      const stream = m.streamUrlFrom(player);
      if (stream) {
        return { type: 'stream', url: stream, referer: base };
      }
      return { type: 'page', url: pageUrl };
    },

    // ———— catalog：静态筛选组 + maccms 筛选路由分页 ————
    getCatalogMeta: () => m.catalogMeta(),

    async getCatalog(query, page = 1) {
      const p = Math.max(1, Math.floor(Number(page) || 1));
      const url = m.catalogUrl(base, query ?? {}, p);
      let html: string;
      try {
        html = await host.http.getText(url);
      } catch (e) {
        m.rethrowUpstream(e);
      }
      const items = await m.listFromTypePage(host, base, html);
      return { items, page: p, hasMore: m.catalogHasMore(html, p) };
    },

    // ———— rank：详情页侧栏周榜（站点无独立榜单页，无月榜/总榜）————
    async getRank() {
      let html: string;
      try {
        html = await host.http.getText(
          `${base}index.php/vod/detail/id/${encodeURIComponent(rankAnchorId)}.html`,
        );
      } catch (e) {
        m.rethrowUpstream(e);
      }
      return m.parseRankSidebar(host, html);
    },

    async onUnload() {
      host.log.debug('[dmmiku] unloaded');
    },
  };
}
