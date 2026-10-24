import { PluginError } from './types';
import type {
  AnimeDetail,
  AnimeSummary,
  CatalogFilterDef,
  Episode,
  PluginContext,
  RankEntry,
  RankGroup,
} from './types';

/**
 * dmmiku.com（maccms v10 + conch 模板）字段映射与解析。
 * 探测报告见 PROBE.md；所有 ctx 方法在 worker 沙箱下均为异步 RPC，一律 await。
 */

/** 源站入口（https）。站点数据无时区标注者按站方（UTC+8）语义解读。 */
export const SITE_ROOT = 'https://www.dmmiku.com/';

/** 排行榜数据宿主：站点无独立榜单页，唯一稳定出处是详情页侧栏「新番周排行榜」。取收录最早、长期更新的入口：海贼王。 */
export const DEFAULT_RANK_ANCHOR_ID = '1293';

function fail(reason: string, cause?: unknown): never {
  throw new PluginError('PARSE', `源站可能改版：${reason}`, cause);
}

// ———————————————— 错误转发 ————————————————

/** 宿主 http 失败转发：宿主按 §9 形状抛出（含 code）原样上抛；否则启发式归一化错误码。 */
export function rethrowUpstream(err: unknown): never {
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string') {
    throw err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  let code = 'UNKNOWN';
  if (/timeout|timed?\s?out/i.test(msg)) code = 'TIMEOUT';
  else if (/domain|whitelist|白名单/i.test(msg)) code = 'DOMAIN_NOT_ALLOWED';
  else if (/429|rate\s?limit/i.test(msg)) code = 'RATE_LIMITED';
  else if (/network|fetch|connect|dns|断网/i.test(msg)) code = 'NETWORK';
  throw new PluginError(code, `上游请求失败: ${msg}`, err);
}

// ———————————————— 文本/URL 净化 ————————————————

/** 纯文本净化：剥标签 + 解实体 + 折叠空白（规范 §7.4）。
 *  Worker 沙箱下 utils.decodeEntities 是异步 RPC（main 沙箱为同步字符串），统一 await 兼容两种形态。 */
export async function clean(host: PluginContext, raw: unknown): Promise<string> {
  if (raw === undefined || raw === null) return '';
  let s = String(raw).replace(/<[^>]*>/g, ' ');
  s = await host.utils.decodeEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

function toHttps(url: string): string | undefined {
  const up = url.replace(/^http:/i, 'https:');
  return /^https:\/\//i.test(up) && /^https:\/\/\S/.test(up) ? up : undefined;
}

/** URL 净化：仅 https（http 一律升级；其它协议/异常形态丢弃）。 */
export function httpsUrl(base: string, raw: unknown): string | undefined {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return toHttps(s);
  if (/^\/\//.test(s)) return toHttps(`https:${s}`);
  if (/^\/[^/]/.test(s)) {
    // 站内根相对路径：基于 https 化的 base 解析
    try {
      return toHttps(new URL(s, base.replace(/^http:/i, 'https:')).toString());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** 从 /vod/detail/id/(\d+)\.html 提取番剧数字 id（maccms vod id，长期稳定）。 */
export function animeIdFromHref(href: string): string | undefined {
  const m = /\/vod\/detail\/id\/(\d+)\.html/.exec(href || '');
  return m ? m[1] : undefined;
}

/** 播放页直链（详情页「立即播放」同构：sid/nid 自 1 起）。 */
export function firstEpisodePageUrl(base: string, animeId: string): string {
  return `${base}index.php/vod/play/id/${encodeURIComponent(animeId)}/sid/1/nid/1.html`;
}

// ———————————————— 时间/状态 ————————————————

/**
 * MM-DD（无年份、无时区标注）→ 毫秒时间戳。
 * 站方数据无年份：按 UTC+8 语义取「不晚于今天+36h」最近的候选年（当年/上一年）；
 * 无候选可满足则缺省，不虚构（规范 §7.3）。
 */
export function monthDayToTs(md: string, now = Date.now()): number | undefined {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((md || '').trim());
  if (!m) return undefined;
  const mo = Number(m[1]);
  const dy = Number(m[2]);
  if (!(mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31)) return undefined;
  const year = new Date(now).getUTCFullYear();
  for (const y of [year, year - 1]) {
    const ts = Date.UTC(y, mo - 1, dy) - 8 * 3600_000; // 站点时区 UTC+8 的 00:00
    if (ts <= now + 36 * 3600_000) return ts;
  }
  return undefined;
}

/** 状态文字 → 枚举（「已完结」/「第N集」「更新至…」等备注）。 */
export function mapStatus(text: string): 'ongoing' | 'finished' | 'unknown' {
  const s = text || '';
  if (s.includes('完结')) return 'finished';
  if (/连载|更新至/.test(s) || /^第[0-9一二三四五六七八九十百零]+集/.test(s)) return 'ongoing';
  return 'unknown';
}

/** 备注是否具备「最新更新集」语义（排除纯状态词）。 */
export function episodeLikeRemark(r: string): boolean {
  const s = (r || '').trim();
  if (!s) return false;
  if (/完结|连载中|未知/.test(s)) return false;
  return /第.{1,12}集|更新至|SP$|OVA|剧场版|预告/i.test(s);
}

// ———————————————— 列表条目 ————————————————

interface ZippedCard {
  animeId: string;
  title: string;
  cover?: string;
  remark?: string;
}

function summaryOf(
  base: string,
  c: ZippedCard,
  extras: { updateTime?: number; latestEpisodeTitle?: string },
): AnimeSummary {
  const item: AnimeSummary = { animeId: c.animeId, title: c.title };
  if (c.cover) item.cover = c.cover;
  if (extras.updateTime !== undefined) item.updateTime = extras.updateTime;
  if (extras.latestEpisodeTitle !== undefined) item.latestEpisodeTitle = extras.latestEpisodeTitle;
  item.playPageUrl = firstEpisodePageUrl(base, c.animeId);
  return item;
}

interface CardStrip {
  hrefs: unknown;
  titles: unknown;
  covers: unknown;
  remarks: unknown;
}

/** 按 DOM 顺序对齐扁平槽位（href/title/cover/remark），长度不一致取最短集合并告警。 */
type CardExtras = { updateTime?: number; latestEpisodeTitle?: string };

async function zipCards(
  host: PluginContext,
  base: string,
  s: CardStrip,
  mkExtras: (i: number, card: ZippedCard) => CardExtras | Promise<CardExtras>,
): Promise<AnimeSummary[]> {
  const hs = Array.isArray(s.hrefs) ? s.hrefs : [];
  const ts = Array.isArray(s.titles) ? s.titles : [];
  const cs = Array.isArray(s.covers) ? s.covers : [];
  const rs = Array.isArray(s.remarks) ? s.remarks : [];
  if (hs.length !== ts.length || hs.length !== cs.length || hs.length !== rs.length) {
    host.log.warn(
      `[dmmiku] 列表槽位长度不一致 href=${hs.length} title=${ts.length} cover=${cs.length} remark=${rs.length}`,
    );
  }
  const out: AnimeSummary[] = [];
  const n = Math.min(hs.length, ts.length, cs.length, rs.length);
  for (let i = 0; i < n; i++) {
    const animeId = animeIdFromHref(String(hs[i] ?? ''));
    if (!animeId) continue;
    const title = await clean(host, ts[i] ?? '');
    if (!title) continue;
    const card: ZippedCard = { animeId, title };
    const cover = httpsUrl(base, cs[i]);
    if (cover !== undefined) card.cover = cover;
    const remark = await clean(host, rs[i]);
    if (remark) card.remark = remark;
    out.push(summaryOf(base, card, await mkExtras(i, card)));
  }
  return out;
}

function remarkOrUndefined(r: string | undefined): string | undefined {
  return r !== undefined && episodeLikeRemark(r) ? r : undefined;
}

/** 筛选/分类页（/vod/type、/vod/show）主列表：li.vodlist_item。 */
export async function listFromTypePage(
  host: PluginContext,
  base: string,
  html: string,
): Promise<AnimeSummary[]> {
  // 哨兵：具备列表/筛选/分页任一结构才视为有效页面（challenge/改版页 → PARSE）；
  // 结构在但条目为 0 是合法空结果（items: []）
  if (!/class="(?:vodlist|vodlist_item|screen_list|wrapper_fl|page_tips|page )/.test(html)) {
    fail('未找到列表/筛选页面结构');
  }
  const strip: CardStrip = {
    hrefs: await host.dom.query(html, 'ul.vodlist_wi li.vodlist_item a.vodlist_thumb', {
      attr: 'href',
      all: true,
    }),
    titles: await host.dom.query(html, 'ul.vodlist_wi li.vodlist_item a.vodlist_thumb', {
      attr: 'title',
      all: true,
    }),
    covers: await host.dom.query(html, 'ul.vodlist_wi li.vodlist_item a.vodlist_thumb', {
      attr: 'data-original',
      all: true,
    }),
    remarks: await host.dom.query(html, 'ul.vodlist_wi li.vodlist_item span.pic_text', { all: true }),
  };
  return await zipCards(host, base, strip, (_i, c) => {
    const rem = remarkOrUndefined(c.remark);
    return rem ? { latestEpisodeTitle: rem } : {};
  });
}

/**
 * 最近更新页（/index.php/map/index.html 全量单页）：
 * div.vodlist_smt > li.ranklist_item（含 span.vod_tname 内 <em>MM-DD</em> 更新日期）。
 */
export async function listFromMapPage(
  host: PluginContext,
  base: string,
  html: string,
): Promise<AnimeSummary[]> {
  const block = await host.dom.query(html, 'div.vodlist_smt', { attr: 'outerHTML' });
  if (typeof block !== 'string' || !block) fail('未找到 vodlist_smt 更新列表');
  const strip: CardStrip = {
    hrefs: await host.dom.query(block, 'li.ranklist_item > a', { attr: 'href', all: true }),
    titles: await host.dom.query(block, 'li.ranklist_item > a', { attr: 'title', all: true }),
    covers: await host.dom.query(block, 'li.ranklist_item div.ranklist_thumb', {
      attr: 'data-original',
      all: true,
    }),
    remarks: await host.dom.query(block, 'li.ranklist_item p > span.vodlist_sub', { all: true }),
  };
  const dateEms = await host.dom.query(block, 'li.ranklist_item span.vod_tname em', { all: true });
  const dates = Array.isArray(dateEms) ? dateEms : [];
  return await zipCards(host, base, strip, async (i, c) => {
    const note = (await clean(host, c.remark ?? '')).replace(/^状态[:：]/, '');
    const rem = remarkOrUndefined(note);
    const ts = monthDayToTs(await clean(host, dates[i] ?? ''));
    const extras: { updateTime?: number; latestEpisodeTitle?: string } = {};
    if (ts !== undefined) extras.updateTime = ts;
    if (rem !== undefined) extras.latestEpisodeTitle = rem;
    return extras;
  });
}

/** 搜索结果页（/vod/search?wd=）：li.searchlist_item（单页全量，站点无搜索分页）。 */
export async function listFromSearchPage(
  host: PluginContext,
  base: string,
  html: string,
): Promise<AnimeSummary[]> {
  const block = await host.dom.query(html, 'div.search_box', { attr: 'outerHTML' });
  if (typeof block !== 'string' || !block) fail('未找到 search_box 结果容器');
  const strip: CardStrip = {
    hrefs: await host.dom.query(block, 'li.searchlist_item a.vodlist_thumb', { attr: 'href', all: true }),
    titles: await host.dom.query(block, 'li.searchlist_item a.vodlist_thumb', { attr: 'title', all: true }),
    covers: await host.dom.query(block, 'li.searchlist_item a.vodlist_thumb', {
      attr: 'data-original',
      all: true,
    }),
    remarks: await host.dom.query(block, 'li.searchlist_item span.pic_text', { all: true }),
  };
  return await zipCards(host, base, strip, (_i, c) => {
    const rem = remarkOrUndefined(c.remark);
    return rem ? { latestEpisodeTitle: rem } : {};
  });
}

/** 筛选页「尾页」绝对页码 → hasMore；无分页器/尾页无链接（btns_disad）= 已到末页。 */
export function catalogHasMore(html: string, page: number): boolean {
  const m = /href="[^"]*\/page\/(\d+)\.html"[^>]*>\s*尾页/.exec(html);
  const total = m ? Number(m[1]) : 0;
  return total > 0 && page < total;
}

// ———————————————— 详情页 ————————————————

/** 详情 HTML → AnimeDetail（剧集按线路分组，episodeId =「线路序号:集序号」均 0-based）。 */
export async function parseDetailHtml(
  host: PluginContext,
  base: string,
  animeId: string,
  html: string,
): Promise<AnimeDetail> {
  const block = await host.dom.query(html, 'div.detail_list_box', { attr: 'outerHTML' });
  if (typeof block !== 'string' || !block) fail('未找到 detail_list_box');

  const title = await clean(host, await host.dom.query(block, 'h2.title'));
  if (!title) fail('未找到详情标题');
  const cover = httpsUrl(base, await host.dom.query(block, 'a.vodlist_thumb', { attr: 'data-original' }));

  // 播放页直链：详情页「立即播放」按钮 href（缺失时构造首集链接）
  const playHref = await host.dom.query(block, 'a.btn_primary', { attr: 'href' });

  // —— 元信息：li.data 行（年份=year 链接 / 地区=area / 类型=class）——
  const anchors = await host.dom.query(block, 'div.content_detail.content_min li.data a', {
    attr: 'outerHTML',
    all: true,
  });
  const genreAnchors = Array.isArray(anchors) ? anchors : [];
  const genres: string[] = [];
  let region: string | undefined;
  for (const a of genreAnchors) {
    const rawHtml = String(a ?? '');
    const href = /href="([^"]+)"/.exec(rawHtml)?.[1] ?? '';
    const label = await clean(host, rawHtml);
    if (href.includes('/area/')) region = label || undefined;
    else if (href.includes('/class/') && label && !genres.includes(label)) genres.push(label);
  }
  const statusText = await clean(host, await host.dom.query(block, 'div.content_detail.content_min li.data span.data_style'));
  const dateEms = await host.dom.query(block, 'div.content_detail.content_min li.data em', { all: true });
  const updateTime = monthDayToTs(await clean(host, (Array.isArray(dateEms) ? dateEms[0] : dateEms) ?? ''));

  // —— 简介：full_text 块 innerHTML 剥标签；「暂无」视为缺省 ——
  const descRaw =
    (await host.dom.query(block, 'div.content_desc.full_text', { attr: 'innerHTML' })) ??
    (await host.dom.query(block, 'div.content_desc', { attr: 'innerHTML' }));
  const descClean = await clean(host, descRaw);
  const description = descClean && !/^(暂无|暂无简介)$/.test(descClean) ? descClean : undefined;

  // —— 剧集线路：.play_source_tab a[alt] 与 .play_list_box 按 DOM 序对齐 ——
  const tabAlt = await host.dom.query(html, '.play_source_tab a', { attr: 'alt', all: true });
  const tabNames = Array.isArray(tabAlt) ? tabAlt : [];
  const boxes = await host.dom.query(html, 'div.play_source div.play_list_box', {
    attr: 'outerHTML',
    all: true,
  });
  const boxList = Array.isArray(boxes) ? boxes : [];
  const episodes: Episode[] = [];
  for (let li = 0; li < boxList.length; li++) {
    const box = String(boxList[li] ?? '');
    const hrefs = await host.dom.query(box, 'div#playlistbox ul.content_playlist li a', {
      attr: 'href',
      all: true,
    });
    const epTitles = await host.dom.query(box, 'div#playlistbox ul.content_playlist li a', { all: true });
    const hs = Array.isArray(hrefs) ? hrefs : [];
    const ts = Array.isArray(epTitles) ? epTitles : [];
    const lineName = (await clean(host, tabNames[li] ?? '')) || `线路${li + 1}`;
    // playPageUrl 走 ctx.utils.absUrl（异步 RPC，批量；解析结果一律 https）
    const absUrls = await Promise.all(hs.map((h) => host.utils.absUrl(base, String(h ?? ''))));
    for (let e = 0; e < hs.length; e++) {
      const ep: Episode = {
        episodeId: `${li}:${e}`,
        title: (await clean(host, ts[e] ?? '')) || `第${e + 1}集`,
        line: lineName,
        lineIndex: li,
        episodeIndex: e,
      };
      const page = toHttps(absUrls[e] ?? '');
      if (page !== undefined) ep.playPageUrl = page;
      episodes.push(ep);
    }
  }

  const detail: AnimeDetail = { animeId, title, genres, status: mapStatus(statusText), episodes };
  if (cover !== undefined) detail.cover = cover;
  const playPageUrl =
    typeof playHref === 'string' && playHref ? httpsUrl(base, playHref) : undefined;
  detail.playPageUrl = playPageUrl ?? firstEpisodePageUrl(base, animeId);
  if (description !== undefined) detail.description = description;
  if (region !== undefined) detail.region = region;
  if (updateTime !== undefined) detail.updateTime = updateTime;
  const remark = remarkOrUndefined(statusText);
  if (remark !== undefined) detail.latestEpisodeTitle = remark;
  return detail;
}

// ———————————————— 播放解析 ————————————————

interface PlayerData {
  encrypt: number;
  url: string;
  url_next?: string;
  from?: string;
  server?: string;
}

/** 读取播放页内嵌 maccms 播放器数据 player_aaaa。 */
export function parsePlayerData(html: string): PlayerData | undefined {
  const m = /var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/.exec(html);
  if (!m) return undefined;
  try {
    const data = JSON.parse(m[1]) as PlayerData;
    if (typeof data.url !== 'string') return undefined;
    return data;
  } catch (e) {
    return undefined;
  }
}

/** maccms encrypt=1：unescape 语义（%uXXXX 与 %XX）。 */
function macUnescape(s: string): string {
  return s.replace(
    /%u([0-9a-fA-F]{4})|%([0-9a-fA-F]{2})/g,
    (_all: string, u: string, h: string) => String.fromCharCode(parseInt(u ?? h, 16)),
  );
}

/** maccms encrypt=2：base64 → 字节 → UTF-8 → unescape（与官方 player.js 等价）。 */
function macBase64Unescape(s: string): string {
  const bin =
    typeof atob === 'function'
      ? atob(s.trim())
      : (() => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
          let out = '';
          let bits = 0;
          let acc = 0;
          for (const ch of s.trim().replace(/[^A-Za-z0-9+/=]/g, '')) {
            if (ch === '=') break;
            const v = chars.indexOf(ch);
            if (v < 0) continue;
            acc = (acc << 6) | v;
            bits += 6;
            if (bits >= 8) {
              bits -= 8;
              out += String.fromCharCode((acc >> bits) & 0xff);
            }
          }
          return out;
        })();
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return macUnescape(new TextDecoder('utf-8').decode(bytes));
}

/** 解密后的播放地址若可直接流播（m3u8/mp4/flv）→ 升 https 返回；否则 undefined（回落 page）。 */
export function streamUrlFrom(data: PlayerData): string | undefined {
  let url = (data.url || '').trim();
  if (!url) return undefined;
  if (data.encrypt === 1) url = macUnescape(url);
  else if (data.encrypt === 2) url = macBase64Unescape(url);
  if (!/^https?:\/\//i.test(url)) return undefined;
  if (!/\.(m3u8|mp4|flv)([?#]|$)/i.test(url)) return undefined;
  return toHttps(url);
}

// ———————————————— 排行榜 ————————————————

/** 详情页侧栏「新番周排行榜」→ RankGroup[]（站点唯一榜单组）。 */
export async function parseRankSidebar(
  host: PluginContext,
  html: string,
): Promise<RankGroup[]> {
  const sidebar = await host.dom.query(html, 'div.right_row', { attr: 'outerHTML' });
  if (typeof sidebar !== 'string' || !sidebar) fail('未找到排行侧栏 right_row');
  const groupName = await clean(host, await host.dom.query(sidebar, 'h3.title'));

  const entries: RankEntry[] = [];

  // 第 1 名：li.ranklist_item（title 属性 + 面板头热度数字）
  const firstHref = await host.dom.query(sidebar, 'li.ranklist_item > a', { attr: 'href' });
  const firstTitle = await host.dom.query(sidebar, 'li.ranklist_item > a', { attr: 'title' });
  if (typeof firstHref === 'string' && firstHref && typeof firstTitle === 'string' && firstTitle) {
    const animeId = animeIdFromHref(firstHref);
    const title = await clean(host, firstTitle);
    if (animeId && title) {
      const heats = await host.dom.query(sidebar, 'li.ranklist_item div.pannel_head > span.text_muted', {
        all: true,
      });
      const score = (await clean(host, (Array.isArray(heats) ? heats[0] : heats) ?? '')).match(/\d+/)?.[0];
      entries.push({ rankNo: 1, animeId, title, ...(score ? { score } : {}) });
    }
  }

  // 第 2..N 名：li.part_eone（innerHTML 剥 span 取标题；span.part_nums=名次；span.renqi=热度）
  const items = await host.dom.query(sidebar, 'li.part_eone a', { attr: 'outerHTML', all: true });
  const list = Array.isArray(items) ? items : [];
  for (const itemHTML of list) {
    const raw = String(itemHTML ?? '');
    const href = /href="([^"]+)"/.exec(raw)?.[1] ?? '';
    const animeId = animeIdFromHref(href);
    if (!animeId) continue;
    const title =
      await clean(
        host,
        raw
          .replace(/<span[^>]*part_nums[\s\S]*?<\/span>/g, '')
          .replace(/<span[^>]*renqi[\s\S]*?<\/span>/g, ''),
      );
    if (!title) continue;
    const rankNo = /part_num(\d+)/.exec(raw)?.[1];
    const renqi = /<span[^>]*renqi[\s\S]*?<\/span>/g;
    const score = /(\d+)\s*<\/i>?\s*<\/span>\s*$/.exec(raw)?.[1]
      ?? (await clean(host, (raw.match(renqi) ?? []).join(''))).match(/\d+/)?.[0];
    const no = rankNo ? Number(rankNo) : entries.length + 1;
    entries.push({ rankNo: no, animeId, title, ...(score ? { score } : {}) });
  }

  if (entries.length === 0) fail('排行侧栏为空');
  return [{ name: groupName || '新番周榜', entries }];
}

// ———————————————— catalog ————————————————

/** 站点分类筛选组（静态探测自 /vod/show/id/22.html 与 /id/20.html 筛选面板）。 */
const CLASSES = [
  'BD无修', '奇幻', '恋爱', '后宫', '学園', '热血', '神魔', '萝莉', '治愈', '搞笑',
  '百合', '冒险', '魔法', '机战', '战争', '战斗', '犯罪', '悬疑', '推理', '科幻',
  '竞技', '运动', '耽美', '其他', 'OVA', '剧场版', '1月新番', '4月新番', '7月新番', '10月新番',
];
const YEARS: string[] = Array.from({ length: 30 }, (_v, i) => String(2026 - i));
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['0-9']);

export function catalogMeta(): CatalogFilterDef[] {
  return [
    {
      key: 'type',
      label: '分区',
      options: [
        { value: 'all', label: '全部' },
        { value: '22', label: '新番' },
        { value: '20', label: '完结' },
      ],
    },
    {
      key: 'class',
      label: '类型',
      options: [{ value: 'all', label: '全部' }, ...CLASSES.map((c) => ({ value: c, label: c }))],
    },
    {
      key: 'year',
      label: '年份',
      options: [{ value: 'all', label: '全部' }, ...YEARS.map((y) => ({ value: y, label: y }))],
    },
    {
      key: 'letter',
      label: '首字母',
      options: [{ value: 'all', label: '全部' }, ...LETTERS.map((l) => ({ value: l, label: l }))],
    },
  ];
}

/** 组装 maccms 筛选路由：/vod/show/[class/…][id/…][year/…][letter/…][page/N].html（实测多段组合有效）。 */
export function catalogUrl(
  base: string,
  query: Record<string, string>,
  page: number,
): string {
  const parts: string[] = [];
  const cls = query.class;
  if (cls && cls !== 'all') parts.push(`class/${encodeURIComponent(cls)}`);
  const type = query.type && query.type !== 'all' ? query.type : '1'; // 站点全站入口 = id/1
  parts.push(`id/${type}`);
  if (query.year && query.year !== 'all' && /^\d{4}$/.test(query.year)) parts.push(`year/${query.year}`);
  if (query.letter && query.letter !== 'all' && /^(?:[A-Z]|0-9)$/.test(query.letter)) parts.push(`letter/${encodeURIComponent(query.letter)}`);
  if (page > 1) parts.push(`page/${page}`);
  return `${base}index.php/vod/show/${parts.join('/')}.html`;
}
