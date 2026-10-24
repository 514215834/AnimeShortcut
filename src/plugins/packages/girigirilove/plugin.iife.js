/**
 * GiriGiri动漫 数据源插件（ani.girigirilove.com）
 *
 * 站点架构（2026-10-24 实测）：React SPA，数据层为 maccms 风格定制 REST API。
 *   Base: https://m3u8.girigirilove.com/api.php/
 *   weekly  → GET App2/weekList           （站方人工编排的更新档期表，week 1=周一 … 7=周日）
 *   latest  → GET Vod/get_list            （默认排序即 vod_time 降序）
 *   search  → GET Vod/get_list?vod_name=  （total 分页）
 *   detail  → GET Vod/get_detail?vod_id=  （info 即 vod 行；不存在时 info 仅 {collect_status:0}）
 *   play    → vod_play_url 内直接给出分线路 m3u8 直链（实测无需 Referer 即可播放）
 *   catalog → GET Vod/getAllTagOption + Vod/get_list（type_id/vod_class/vod_version/vod_state/orderby）
 *   rank    → GET App2/vodSortList + App2/vodSortSearch（站方编排榜：愛動画（周）/愛劇場（周））
 *
 * 纯 JavaScript IIFE，零构建：工厂函数挂 self.__AS_PLUGIN__（Worker 沙箱没有 window）。
 * 遵守《数据源插件接口规范》v1.7：ctx 全部方法一律 await（跨沙箱纪律 §6）、
 * 失败 throw { code, message }（§9）、分页 page 从 1 起、单次调用上游请求 ≤ 3（§8.4）、
 * 所有 URL 仅 https、文本字段纯文本（§7.4）。
 */
(function () {
  'use strict';

  var MANIFEST = {
    manifestVersion: '1.0',
    id: 'girigirilove',
    name: 'GiriGiri动漫',
    version: '1.0.0',
    siteUrl: 'https://ani.girigirilove.com',
    icon: 'https://ani.girigirilove.com/brand/icon.png',
    type: 'remote',
    entry: 'index.js',
    sandbox: 'worker',
    capabilities: ['weekly', 'latest', 'search', 'detail', 'play', 'catalog', 'rank'],
    permissions: { domains: ['girigirilove.com'], storage: false },
    config: [
      { key: 'apiBaseUrl', label: '接口地址', type: 'string', placeholder: '留空使用默认 https://m3u8.girigirilove.com/api.php（须在插件域名白名单内）' },
      { key: 'siteOrigin', label: '站点页面地址', type: 'string', placeholder: '留空使用默认 https://ani.girigirilove.com' }
    ],
    cacheHints: { weekly: 600, latest: 600, search: 0, detail: 3600, play: 0, catalog: 600, rank: 1800 },
    description: 'GiriGiri（girigirilove.com）：新番时间表、最新更新、搜索、分类、榜单与站内 m3u8 播放。',
    author: 'AnimeShortcut'
  };

  var DEFAULT_API_BASE = 'https://m3u8.girigirilove.com/api.php/';
  var DEFAULT_SITE_ORIGIN = 'https://ani.girigirilove.com';
  var COVER_BASE = 'https://jpg.girigirilove.com/';   // 相对封面 upload/... 的宿主（站方前端映射至 .net，实测 .net 不可达而 .com 可达且路径一致）
  var PAGE_SIZE = 30;
  var RANK_GROUPS_MAX = 2;   // getRank 上游预算 3：1 次榜单组 + 2 次条目拉取（当前站方恰好 2 组）

  // 站方 BrowsePage 静态类型表与 getAllTagOption 快照（getCatalogMeta 为同步签名，元数据内置）
  var TYPE_OPTIONS = [
    { value: '2', label: '日番' },
    { value: '3', label: '美番' },
    { value: '20', label: '真人番剧' },
    { value: '21', label: '剧场版' },
    { value: '24', label: 'BD副音轨' },
    { value: '26', label: '演唱会&周边活动&其他' }
  ];
  var CLASS_OPTIONS = ['喜剧', '爱情', '恐怖', '动作', '科幻', '剧情', '战争', '奇幻', '冒险', '悬疑', '校园', '后宫', '热血', '运动', '职场', '百合', '乙女', '机甲', '日常', '魔法少女', '异世界', '爱抖露', '音乐', '萌'];
  var VERSION_OPTIONS = ['TV番', '泡面番', 'OVA'];
  var STATE_OPTIONS = ['小说改', '漫画改', '游戏改', '原创'];
  var ORDER_OPTIONS = [{ value: 'hits', label: '最热' }, { value: 'score', label: '评分' }];
  var ORDER_KEYS = ['hits', 'score'];

  // 站方详情页线路名映射（index chunk：cht|繁體|繁体|繁中→繁中；chs|简体|簡體|简中→简中；其余未标注）
  var WEEKDAY_CHAR = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

  function PluginError(code, message, cause) {
    var err = new Error(message);
    err.code = code;
    if (cause !== undefined) err.cause = cause;
    return err;
  }

  function trimSlash(s) {
    return String(s).replace(/\/+$/, '');
  }

  function normalizePage(page) {
    var p = Math.floor(Number(page));
    if (!Number.isFinite(p) || p < 1) p = 1;
    return p;
  }

  /** https 化：http 升级、协议相对补全、其余协议/形态丢弃（§7.4） */
  function httpsUrl(raw) {
    if (raw == null) return undefined;
    var u = String(raw).trim();
    if (!u) return undefined;
    if (u.indexOf('//') === 0) u = 'https:' + u;
    else if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
    if (!/^https:\/\//i.test(u)) return undefined;
    return u;
  }

  /** 封面映射：绝对地址 https 化；upload/ 相对路径映射到封面宿主；其余丢弃 */
  function coverUrl(raw) {
    if (raw == null) return undefined;
    var u = String(raw).trim();
    if (!u) return undefined;
    if (u.indexOf('upload/') === 0) return COVER_BASE + u;
    return httpsUrl(u);
  }

  /** 上游信封解包：code !== 1 视为源站接口异常（PARSE） */
  function unwrap(res, what) {
    if (!res || typeof res !== 'object') throw PluginError('PARSE', what + ' 响应结构异常');
    if (Number(res.code) !== 1) throw PluginError('PARSE', what + ' 接口返回错误: ' + (res.msg || ('code=' + res.code)));
    if (!('info' in res)) throw PluginError('PARSE', what + ' 响应缺少 info');
    return res.info;
  }

  /** 列表 info → { rows, total }（兼容裸数组形态） */
  function rowsOf(info, what) {
    if (Array.isArray(info)) return { rows: info, total: info.length };
    if (!info || typeof info !== 'object') throw PluginError('PARSE', what + ' 列表结构异常');
    var rows = Array.isArray(info.rows) ? info.rows : [];
    var total = info.total == null ? NaN : Number(info.total);
    return { rows: rows, total: Number.isFinite(total) ? total : rows.length };
  }

  /** 纯文本化：剥 HTML 标签；含实体时经宿主 decodeEntities 解除（worker 沙箱为 RPC，必须 await） */
  async function cleanText(ctx, raw) {
    if (raw == null) return '';
    var s = String(raw).replace(/<[^>]*>/g, '');
    s = s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
    if (s.indexOf('&') !== -1) s = await ctx.utils.decodeEntities(s);
    s = s.trim();
    return s;
  }

  function lineLabel(rawName) {
    var n = String(rawName || '');
    if (/cht|繁體|繁体|繁中|traditional/i.test(n)) return '繁中';
    if (/chs|简体|簡體|简中|simplified/i.test(n)) return '简中';
    return n.trim() || '未标注';
  }

  /**
   * maccms 播放串 → 线路数组：vod_play_url 以 $$$ 分线路、# 分集、$ 分「名$URL」。
   * 返回 [{ name, label, episodes: [{ title, url }] }]，索引即 lineIndex/episodeIndex（0-based）。
   */
  function parsePlaySources(vod) {
    var urlRaw = String(vod.vod_play_url || '');
    if (!urlRaw.trim()) return [];
    var names = String(vod.vod_play_from || '').split('$$$').map(function (s) { return s.trim(); });
    var blocks = urlRaw.split('$$$');
    var sources = [];
    for (var li = 0; li < blocks.length; li++) {
      var block = blocks[li].trim();
      if (!block) continue;
      var segs = block.split('#');
      var episodes = [];
      for (var ei = 0; ei < segs.length; ei++) {
        var seg = segs[ei].trim();
        if (!seg) continue;
        var d = seg.indexOf('$');
        var title = d >= 0 ? seg.slice(0, d).trim() : '';
        var url = d >= 0 ? seg.slice(d + 1).trim() : seg;
        episodes.push({ title: title || '第' + (ei + 1) + '集', url: url });
      }
      if (episodes.length === 0) continue;
      var rawName = names[li] || '';
      sources.push({ name: rawName, label: lineLabel(rawName), episodes: episodes });
    }
    return sources;
  }

  /** 档期星期：周更表桶 week 1..7（1=周一 … 7=周日）；详情行 vod_weekday 中文字符 */
  function weekdayFromBucket(week) {
    var w = Number(week);
    if (!(w >= 1 && w <= 7)) return undefined;
    return w === 7 ? 0 : w;
  }

  function weekdayFromChar(ch) {
    var key = String(ch == null ? '' : ch).trim();
    return Object.prototype.hasOwnProperty.call(WEEKDAY_CHAR, key) ? WEEKDAY_CHAR[key] : undefined;
  }

  function createFactory() {
    return async function (ctx) {
      var state = { apiBase: DEFAULT_API_BASE, siteOrigin: DEFAULT_SITE_ORIGIN };

      function applyConfig(config) {
        var c = config || {};
        var b = c.apiBaseUrl;
        if (typeof b === 'string' && b.trim()) {
          var nb = trimSlash(b.trim());
          nb = httpsUrl(nb + '/');
          if (!nb) throw PluginError('CONFIG_INVALID', '接口地址必须为 https URL: ' + b);
          state.apiBase = nb;
        } else {
          state.apiBase = DEFAULT_API_BASE;
        }
        var s = c.siteOrigin;
        if (typeof s === 'string' && s.trim()) {
          var ns = httpsUrl(trimSlash(s.trim()));
          if (!ns) throw PluginError('CONFIG_INVALID', '站点页面地址必须为 https URL: ' + s);
          state.siteOrigin = ns;
        } else {
          state.siteOrigin = DEFAULT_SITE_ORIGIN;
        }
      }

      /** 站内详情页地址（列表项跳源站用） */
      function detailPageUrl(animeId) {
        return state.siteOrigin + '/detail/' + encodeURIComponent(String(animeId));
      }

      /** 站内播放页地址（含线路/集序参数，与站方 PlayerPage 路由一致） */
      function playPageUrl(animeId, lineIndex, episodeIndex) {
        return state.siteOrigin + '/play/' + encodeURIComponent(String(animeId)) +
          '?sourceIndex=' + lineIndex + '&episodeIndex=' + episodeIndex;
      }

      /** 列表行 → AnimeSummary（列表/周表两形态统一：vod_time 数字为更新时间、文本为更新备注） */
      async function buildSummary(row) {
        var animeId = String(row.vod_id);
        var title = await cleanText(ctx, row.vod_name);
        var summary = { animeId: animeId, title: title };
        var cover = coverUrl(row.vod_pic);
        if (cover) summary.cover = cover;
        var remarks = row.vod_remarks;
        if (remarks == null || remarks === '') remarks = row.vod_time;
        var remarksText = typeof remarks === 'string' ? await cleanText(ctx, remarks) : '';
        if (remarksText) summary.latestEpisodeTitle = remarksText;
        if (typeof row.vod_time === 'number' || (typeof row.vod_time === 'string' && /^\d+$/.test(row.vod_time.trim()))) {
          var t = Number(row.vod_time);
          if (Number.isFinite(t) && t >= 1e9) summary.updateTime = t >= 1e13 ? t : t * 1000;
        }
        summary.playPageUrl = detailPageUrl(animeId);
        return summary;
      }

      /** Vod/get_list 分页查询（limit=30，offset=(page-1)*30） */
      async function fetchList(params, page) {
        var qs = 'limit=' + PAGE_SIZE + '&offset=' + (page - 1) * PAGE_SIZE;
        var keys = Object.keys(params);
        for (var i = 0; i < keys.length; i++) {
          var v = params[keys[i]];
          if (v) qs += '&' + keys[i] + '=' + encodeURIComponent(String(v));
        }
        var info = unwrap(await ctx.http.getJson(state.apiBase + 'Vod/get_list?' + qs), 'get_list');
        var r = rowsOf(info, 'get_list');
        var items = [];
        for (var j = 0; j < r.rows.length; j++) {
          var row = r.rows[j];
          if (row == null || row.vod_id == null || !row.vod_name) continue;
          items.push(await buildSummary(row));
        }
        return { items: items, page: page, hasMore: r.rows.length > 0 && page * PAGE_SIZE < r.total };
      }

      /** 详情行 → AnimeDetail（含线路分组的 episodes） */
      async function buildDetail(vod) {
        var summary = await buildSummary(vod);
        var detail = {
          animeId: summary.animeId,
          title: summary.title,
          cover: summary.cover,
          latestEpisodeTitle: summary.latestEpisodeTitle,
          updateTime: summary.updateTime,
          playPageUrl: summary.playPageUrl,
          genres: []
        };
        var weekday = weekdayFromChar(vod.vod_weekday);
        if (weekday !== undefined) detail.weekday = weekday;
        var regionParts = [];
        var year = await cleanText(ctx, vod.vod_year);
        if (year) regionParts.push(year);
        var area = await cleanText(ctx, vod.vod_area);
        if (area) regionParts.push(area);
        if (regionParts.length > 0) detail.region = regionParts.join(' · ');
        var classes = String(vod.vod_class || '').split(/[,，、/]+/);
        for (var i = 0; i < classes.length; i++) {
          var g = await cleanText(ctx, classes[i]);
          if (g && detail.genres.indexOf(g) === -1) detail.genres.push(g);
        }
        var status = Number(vod.vod_isend) === 1 ? 'finished' : 'ongoing';
        detail.status = status;
        var desc = await cleanText(ctx, vod.vod_content);
        if (!desc) desc = await cleanText(ctx, vod.vod_blurb);
        if (desc) detail.description = desc;
        var episodes = [];
        var sources = parsePlaySources(vod);
        for (var li = 0; li < sources.length; li++) {
          var src = sources[li];
          for (var ei = 0; ei < src.episodes.length; ei++) {
            var ep = src.episodes[ei];
            var item = {
              episodeId: li + ':' + ei,
              title: ep.title,
              line: src.label,
              lineIndex: li,
              episodeIndex: ei,
              playPageUrl: playPageUrl(summary.animeId, li, ei)
            };
            episodes.push(item);
          }
        }
        detail.episodes = episodes;
        return detail;
      }

      async function loadDetail(animeId, opts) {
        var id = String(animeId == null ? '' : animeId).trim();
        if (!id) throw PluginError('PARSE', 'animeId 为空');
        var info = unwrap(await ctx.http.getJson(state.apiBase + 'Vod/get_detail?vod_id=' + encodeURIComponent(id), opts), 'detail');
        // 上游对不存在的条目仍返回 code=1，但 info 仅剩 collect_status
        if (!info || typeof info !== 'object' || Array.isArray(info) || info.vod_id == null || !info.vod_name) {
          throw PluginError('PARSE', '条目不存在或详情结构异常: ' + id);
        }
        return info;
      }

      return {
        manifest: MANIFEST,

        /** 幂等：仅解析配置，不做网络请求（§5.2） */
        async init(config) {
          applyConfig(config);
        },

        /** 周更表：App2/weekList 整表单页返回（hasMore:false） */
        async getWeeklySchedule(page) {
          var p = normalizePage(page);
          if (p !== 1) return { items: [], page: p, hasMore: false };
          var info = unwrap(await ctx.http.getJson(state.apiBase + 'App2/weekList'), 'weekList');
          if (!Array.isArray(info)) throw PluginError('PARSE', '周表结构异常');
          var days = info.slice().sort(function (a, b) { return Number(a && a.week) - Number(b && b.week); });
          var items = [];
          for (var i = 0; i < days.length; i++) {
            var day = days[i] || {};
            var weekday = weekdayFromBucket(day.week);
            var videos = Array.isArray(day.video) ? day.video : [];
            for (var j = 0; j < videos.length; j++) {
              var v = videos[j];
              if (v == null || v.vod_id == null || !v.vod_name) continue;
              var summary = await buildSummary(v);
              if (weekday !== undefined) summary.weekday = weekday;
              items.push(summary);
            }
          }
          return { items: items, page: 1, hasMore: false };
        },

        /** 最新更新：get_list 默认排序即 vod_time 降序 */
        async getLatestUpdates(page) {
          return fetchList({}, normalizePage(page));
        },

        /** 搜索：vod_name 参数；空关键词返回空结果（不伪装成功也不炸） */
        async search(keyword, page) {
          var p = normalizePage(page);
          var kw = String(keyword == null ? '' : keyword).trim();
          if (!kw) return { items: [], page: p, hasMore: false };
          return fetchList({ vod_name: kw }, p);
        },

        /** 详情：get_detail 单请求；episodes 按线路分组，episodeId = "线路:集"（均 0-based） */
        async getDetail(animeId) {
          var vod = await loadDetail(animeId);
          return buildDetail(vod);
        },

        /** 播放：详情缓存去重后取该集 m3u8 直链 → stream；无直链回落 page 跳转（上游请求 1 次 ≤ 预算 3） */
        async resolvePlay(animeId, episodeId) {
          var eid = String(episodeId == null ? '' : episodeId).trim();
          if (!eid) throw PluginError('PARSE', 'episodeId 为空');
          var vod = await loadDetail(animeId, { ttlMs: 300000 });
          var sources = parsePlaySources(vod);
          var parts = eid.split(':');
          var li = Number(parts[0]);
          var ei = Number(parts[1]);
          if (!Number.isInteger(li) || !Number.isInteger(ei) || li < 0 || ei < 0 ||
              li >= sources.length || ei >= sources[li].episodes.length) {
            throw PluginError('PARSE', '剧集不存在: ' + String(animeId) + ':' + eid);
          }
          var ep = sources[li].episodes[ei];
          var url = httpsUrl(ep.url);
          if (url) return { type: 'stream', url: url, referer: state.siteOrigin + '/' };
          return { type: 'page', url: playPageUrl(String(animeId), li, ei) };
        },

        /** 分类元数据（同步签名，元数据内置自站方快照） */
        getCatalogMeta() {
          function opts(list) {
            return [{ value: 'all', label: '不限' }].concat(list.map(function (v) {
              return typeof v === 'string' ? { value: v, label: v } : v;
            }));
          }
          return [
            { key: 'type_id', label: '类型', options: opts(TYPE_OPTIONS) },
            { key: 'vod_class', label: '分类', options: opts(CLASS_OPTIONS) },
            { key: 'vod_version', label: '版本', options: opts(VERSION_OPTIONS) },
            { key: 'vod_state', label: '性质', options: opts(STATE_OPTIONS) },
            { key: 'orderby', label: '排序', options: [{ value: 'all', label: '默认（最新）' }].concat(ORDER_OPTIONS) }
          ];
        },

        /** 分类浏览：type_id / vod_class / vod_version / vod_state / orderby 透传 get_list */
        async getCatalog(query, page) {
          var p = normalizePage(page);
          var q = query || {};
          var params = {};
          var passKeys = ['type_id', 'vod_class', 'vod_version', 'vod_state'];
          for (var i = 0; i < passKeys.length; i++) {
            var v = q[passKeys[i]];
            if (typeof v === 'string' && v.trim() && v !== 'all') params[passKeys[i]] = v.trim();
          }
          if (typeof q.orderby === 'string' && ORDER_KEYS.indexOf(q.orderby) !== -1) params.orderby = q.orderby;
          return fetchList(params, p);
        },

        /** 榜单：App2/vodSortList 榜单组 + 每组一次 vodSortSearch（组数上限 2，上游共 ≤ 3 次） */
        async getRank() {
          var groups = unwrap(await ctx.http.getJson(state.apiBase + 'App2/vodSortList'), 'vodSortList');
          if (!Array.isArray(groups)) throw PluginError('PARSE', '榜单组结构异常');
          if (groups.length > RANK_GROUPS_MAX) {
            ctx.log.warn('榜单组数量 ' + groups.length + ' 超出单次调用预算，仅取前 ' + RANK_GROUPS_MAX + ' 组');
          }
          var picked = groups.slice(0, RANK_GROUPS_MAX);
          var out = [];
          for (var i = 0; i < picked.length; i++) {
            var g = picked[i] || {};
            var gid = g.id == null ? '' : String(g.id).trim();
            if (!gid) continue;
            var name = await cleanText(ctx, g.title);
            if (!name) name = '榜单' + gid;
            var size = Math.min(Math.max(Math.floor(Number(g.num)) || 20, 1), 30);
            var res = unwrap(await ctx.http.getJson(
              state.apiBase + 'App2/vodSortSearch?id=' + encodeURIComponent(gid) + '&page=1&pageSize=' + size
            ), 'vodSortSearch');
            var r = rowsOf(res, 'vodSortSearch');
            var entries = [];
            var rankNo = 0;
            for (var j = 0; j < r.rows.length; j++) {
              var row = r.rows[j];
              if (row == null || row.vod_id == null || !row.vod_name) continue;
              rankNo += 1;
              var entry = { rankNo: rankNo, animeId: String(row.vod_id), title: await cleanText(ctx, row.vod_name) };
              var hits = Number(row.vod_hits);
              if (Number.isFinite(hits) && hits > 0) entry.score = String(hits);
              entries.push(entry);
            }
            out.push({ name: name, entries: entries });
          }
          return out;
        }
      };
    };
  }

  var factory = createFactory();
  if (typeof self !== 'undefined') self.__AS_PLUGIN__ = factory;
  if (typeof globalThis !== 'undefined' && !globalThis.__AS_PLUGIN__) globalThis.__AS_PLUGIN__ = factory;
})();
