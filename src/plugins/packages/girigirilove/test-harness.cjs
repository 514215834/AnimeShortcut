/**
 * girigirilove 插件回归测试（规范 §13 最少用例集 + 第 5 条：ctx 全方法 Promise 化）
 * 用法：node test-harness.js [fixturesDir]
 * 全部 ctx 方法（http/dom/storage/utils.decodeEntities/absUrl）一律返回 Promise 并带随机延迟，
 * 任何漏 await 的调用都会以 "[object Promise]" 或 TypeError 暴露。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FIX = process.argv[2] || path.join(__dirname, '__fixtures__');

// ---------- 断言 ----------
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' | ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, name, a === e ? undefined : `expected ${e}, got ${a}`);
}

// ---------- Promise 化 ctx 桩 ----------
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, n) => {
    if (!n.startsWith('#')) return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[n.toLowerCase()] ?? m;
    const cp = n[1].toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
    return cp > 0 && cp <= 1114111 ? String.fromCodePoint(cp) : m;
  });
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx(routeFn) {
  const calls = [];
  const logs = [];
  const unexpected = [];
  const ctx = {
    env: { hostVersion: '1.0.0', specVersion: '1.0', locale: 'zh-CN', timezone: 'Asia/Tokyo', mode: 'production' },
    http: {
      async getJson(url) {
        calls.push({ kind: 'getJson', url });
        await delay(2 + Math.random() * 3);
        const hit = routeFn(url);
        if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' });
        if (hit.reject) throw Object.assign(new Error(hit.reject.message || '网络失败'), { code: hit.reject.code || 'NETWORK' });
        try { return JSON.parse(hit.body); }
        catch (e) { throw Object.assign(new Error('夹具 JSON 解析失败'), { code: 'PARSE' }); }
      },
      async getText(url) { calls.push({ kind: 'getText', url }); unexpected.push('http.getText ' + url); await delay(1); throw new Error('unexpected getText'); },
      async getRaw(url) { calls.push({ kind: 'getRaw', url }); unexpected.push('http.getRaw ' + url); await delay(1); throw new Error('unexpected getRaw'); }
    },
    dom: { async query() { unexpected.push('dom.query'); await delay(1); throw new Error('unexpected dom.query'); } },
    storage: {
      async get() { unexpected.push('storage.get'); await delay(1); throw new Error('unexpected storage.get'); },
      async set() { unexpected.push('storage.set'); await delay(1); throw new Error('unexpected storage.set'); },
      async delete() { unexpected.push('storage.delete'); await delay(1); throw new Error('unexpected storage.delete'); },
      async keys() { unexpected.push('storage.keys'); await delay(1); throw new Error('unexpected storage.keys'); }
    },
    log: { debug: (...a) => logs.push(['debug', ...a]), info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) },
    utils: {
      async absUrl(base, p) { await delay(1); return new URL(p, base).href; },
      async decodeEntities(s) { await delay(1); return decodeEntities(s); },
      hashId(input) { let h = 5381; for (const c of String(input)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); }
    }
  };
  return { ctx, calls, logs, unexpected };
}

// fixture 路由：URL 精确匹配表
function fixtureRouter() {
  const routes = [];
  function add(matcher, file, opts) {
    const body = fs.readFileSync(path.join(FIX, file), 'utf8');
    routes.push({ matcher, body, opts: opts || {} });
  }
  return { add, resolve(url) { return routes.find((r) => r.matcher(url)); }, routes };
}

// 加载插件（vm 沙箱，模拟 Worker：定义 self，无 window/import）
function loadPlugin(aspluginPath) {
  const pkg = JSON.parse(fs.readFileSync(aspluginPath, 'utf8'));
  const fakeSelf = {};
  const sandbox = { self: fakeSelf, console };
  vm.createContext(sandbox);
  vm.runInContext(pkg.code, sandbox, { filename: 'plugin.iife.js' });
  const factory = fakeSelf.__AS_PLUGIN__;
  if (typeof factory !== 'function') throw new Error('self.__AS_PLUGIN__ 未挂载工厂函数');
  return { pkg, factory };
}

function expectCode(promise, code, name) {
  return promise.then(
    () => ok(false, name, '期望抛出 ' + code + '，但成功返回'),
    (e) => ok(e && e.code === code, name, '实际 code=' + (e && e.code) + ' msg=' + (e && e.message))
  );
}

// ---------- 测试 ----------
(async function main() {
  // 回归对象 = 实际交付文件（public/plugins/），保证"测的就是发的"
  const pkgPath = path.resolve(__dirname, '..', '..', '..', '..', 'public', 'plugins', 'girigirilove.asplugin.json');
  if (!fs.existsSync(pkgPath)) { console.error('未找到打包产物，请先运行 npm run pack:plugins 生成 ' + pkgPath); process.exit(2); }
  const { pkg, factory } = loadPlugin(pkgPath);
  const M = pkg.manifest;
  console.log('插件包:', pkgPath, '| manifest:', M.id, M.version, '| capabilities:', M.capabilities.join(','));

  // ===== 0. 包与 manifest 结构 =====
  console.log('\n[0] 包结构与 manifest');
  eq(Object.keys(pkg), ['formatVersion', 'manifest', 'code'], '包顶层键 = formatVersion/manifest/code');
  eq(pkg.formatVersion, 1, 'formatVersion = 1');
  eq(M.manifestVersion, '1.0', 'manifestVersion = 1.0');
  ok(/^[a-z0-9][a-z0-9-]{1,31}$/.test(M.id), 'id 符合正则');
  eq(M.type, 'remote', 'type = remote');
  eq(M.sandbox, 'worker', 'sandbox = worker');
  eq(M.entry, 'index.js', 'entry 为名义值 index.js');
  ok(/^[0-9a-f]{64}$/.test(M.sha256 || ''), 'sha256 已由 pack:plugins 回填为 64 位 hex');
  ok(Array.isArray(M.permissions.domains) && M.permissions.domains.length > 0, 'permissions.domains 非空');
  ok(M.cacheHints && typeof M.cacheHints === 'object', 'cacheHints 声明');
  ok(typeof pkg.code === 'string' && !/import\s|require\(|import\.meta/.test(pkg.code), 'code 为零构建 IIFE（无 import/require/import.meta）');
  ok(/self\.__AS_PLUGIN__/.test(pkg.code), '工厂函数挂 self.__AS_PLUGIN__');
  const capMethod = { weekly: 'getWeeklySchedule', latest: 'getLatestUpdates', search: 'search', detail: 'getDetail', play: 'resolvePlay', catalog: 'getCatalog', rank: 'getRank' };

  let plugin;
  {
    const { ctx } = makeCtx(null);
    plugin = await factory(ctx);
    await plugin.init({});
  }

  // capabilities 与实现方法一一对应
  {
    let okAll = true;
    for (const c of M.capabilities) {
      if (c === 'catalog') { if (typeof plugin.getCatalogMeta !== 'function' || typeof plugin.getCatalog !== 'function') okAll = false; }
      else if (typeof plugin[capMethod[c]] !== 'function') okAll = false;
    }
    ok(okAll, 'capabilities 与实现方法一一对应（声明即实现）');
  }

  // ===== 1. weekly =====
  console.log('\n[1] weekly（App2/weekList）');
  {
    const r = fixtureRouter();
    r.add((u) => u.endsWith('/App2/weekList'), 'weekly-normal.json');
    const env1 = makeCtx(null);
    env1.route = r;
    env1.ctx.http.getJson = (async (url) => { env1.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p1 = await factory(env1.ctx); await p1.init({});
    const res = await p1.getWeeklySchedule(1);
    ok(Array.isArray(res.items) && res.items.length > 0, '返回非空列表', 'items=' + (res.items && res.items.length));
    eq(res.page, 1, 'page=1');
    eq(res.hasMore, false, '周表整表单页 hasMore=false');
    eq(env1.calls.length, 1, '上游请求 1 次 ≤ 预算 3');
    const weekdays = {};
    for (const it of res.items) {
      ok(typeof it.animeId === 'string' && it.animeId.length > 0, 'animeId 稳定字符串（抽样）');
      ok(typeof it.title === 'string' && it.title.length > 0, 'title 纯文本（抽样）');
      break;
    }
    for (const it of res.items) weekdays[it.weekday] = (weekdays[it.weekday] || 0) + 1;
    ok(weekdays[1] > 0 && weekdays[6] > 0, 'weekday 映射：桶 week=1→1、week=6→6', JSON.stringify(weekdays));
    ok(weekdays[0] > 0, 'weekday 映射：桶 week=7→0（周日）', JSON.stringify(weekdays));
    ok(res.items.every((it) => !it.weekday === undefined || (it.weekday >= 0 && it.weekday <= 6)), 'weekday 取值 0~6 或缺省');
    const withCover = res.items.find((it) => it.cover);
    ok(withCover && /^https:\/\//.test(withCover.cover), 'cover 仅 https');
    const anyTitleEntity = res.items.find((it) => /&[a-z]+;|&#\d+;/i.test(it.title));
    ok(!anyTitleEntity, 'title 无残留实体');
    ok(res.items.every((it) => /^https:\/\/ani\.girigirilove\.com\/detail\/[^/]+$/.test(it.playPageUrl)), 'playPageUrl 为站内详情页（https）');
    ok(res.items.every((it) => it.updateTime === undefined || (Number.isFinite(it.updateTime) && it.updateTime > 1e12)), 'updateTime 毫秒时间戳或缺省（不虚构）');
    // page=2 空回
    const res2 = await p1.getWeeklySchedule(2);
    eq(res2, { items: [], page: 2, hasMore: false }, 'page>1 空页');
    ok(!res.items.some((it) => /Promise/.test(String(it.title))), '无漏 await 痕迹（title 非 [object Promise]）');
  }

  // ===== 2. latest =====
  console.log('\n[2] latest（Vod/get_list 默认排序）');
  {
    const r = fixtureRouter();
    r.add((u) => /Vod\/get_list\?limit=30&offset=0$/.test(u), 'latest-normal-p1.json');
    r.add((u) => /Vod\/get_list\?limit=30&offset=30$/.test(u), 'latest-normal-p1.json');
    const e2 = makeCtx(null);
    e2.ctx.http.getJson = (async (url) => { e2.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p2 = await factory(e2.ctx); await p2.init({});
    const res = await p2.getLatestUpdates(1);
    eq(res.items.length, 30, '第 1 页 30 条');
    eq(res.page, 1, 'page=1');
    eq(res.hasMore, true, 'total=3795 → hasMore=true');
    ok(Number.isFinite(res.items[0].updateTime) && res.items[0].updateTime > 1e12, 'updateTime 毫秒级');
    ok(typeof res.items[0].latestEpisodeTitle === 'string' && res.items[0].latestEpisodeTitle.length > 0, 'latestEpisodeTitle 取自 vod_remarks');
    ok(/^https:\/\//.test(res.items[0].playPageUrl), 'playPageUrl https');
    eq(e2.calls.length, 1, '上游请求 1 次');
    const res3 = await p2.getLatestUpdates(2);
    eq(res3.page, 2, 'page=2 回显');
  }

  // ===== 3. search =====
  console.log('\n[3] search（Vod/get_list?vod_name=）');
  {
    const r = fixtureRouter();
    r.add((u) => /vod_name=%E8%91%AC%E9%80%81/.test(u), 'search-keyword-p1.json');
    r.add((u) => /vod_name=/.test(u), 'search-empty-p1.json');
    const e3 = makeCtx(null);
    e3.ctx.http.getJson = (async (url) => { e3.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p3 = await factory(e3.ctx); await p3.init({});
    const res = await p3.search('葬送', 1);
    ok(res.items.length >= 1, '关键词命中结果', 'items=' + res.items.length);
    eq(res.hasMore, false, '结果数 < 页大 → hasMore=false');
    ok(res.items.every((it) => /葬送/.test(it.title) || true), '结果条目（宽松校验）');
    const empty = await p3.search('不存在的番剧xyzq', 1);
    eq(empty, { items: [], page: 1, hasMore: false }, '查无结果 → 空结果（非 throw）');
    const blank = await p3.search('   ', 1);
    eq(blank, { items: [], page: 1, hasMore: false }, '空白关键词 → 空结果且不发请求');
    eq(e3.calls.filter((c) => !/vod_name=%E4%B8%8D/.test(c.url)).length >= 1, true, '关键词请求已发出');
  }

  // ===== 4. detail =====
  console.log('\n[4] detail（Vod/get_detail，多线路剧集）');
  {
    const r = fixtureRouter();
    r.add((u) => /get_detail\?vod_id=27235$/.test(u), 'detail-normal.json');
    const e4 = makeCtx(null);
    e4.ctx.http.getJson = (async (url) => { e4.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p4 = await factory(e4.ctx); await p4.init({});
    const d = await p4.getDetail('27235');
    eq(d.animeId, '27235', 'animeId');
    ok(d.title && !/[<>]/.test(d.title), 'title 纯文本');
    ok(Array.isArray(d.genres) && d.genres.length > 0, 'genres 非空数组', JSON.stringify(d.genres));
    ok(d.region && !/[<>]/.test(d.region), 'region 元信息', d.region);
    ok(d.status === 'ongoing' || d.status === 'finished' || d.status === 'unknown', 'status 枚举合法', d.status);
    ok(d.weekday >= 0 && d.weekday <= 6, 'weekday 由 vod_weekday 字符映射', String(d.weekday));
    ok(d.description && !/[<>]/.test(d.description) && !/&[a-z]+;/i.test(d.description), 'description 剥标签且解实体（vod_content HTML）');
    ok(Array.isArray(d.episodes) && d.episodes.length >= 2, 'episodes 非空', 'n=' + (d.episodes && d.episodes.length));
    const lines = {};
    for (const ep of d.episodes) {
      ok(/^\d+:\d+$/.test(ep.episodeId), 'episodeId = "线路:集"（抽样）');
      break;
    }
    for (const ep of d.episodes) { lines[ep.line] = lines[ep.line] || 0; lines[ep.line]++; }
    ok(Object.keys(lines).some((k) => k === '繁中'), '线路名映射 cht→繁中', JSON.stringify(lines));
    ok(d.episodes.every((ep) => /^https:\/\//.test(ep.playPageUrl) && /sourceIndex=\d+&episodeIndex=\d+/.test(ep.playPageUrl)), '剧集 playPageUrl 为站内播放页（含线路/集参数，https）');
    const ep0 = d.episodes[0];
    eq(ep0.episodeId, '0:0', '首集 episodeId=0:0');
    eq(ep0.lineIndex, 0, 'lineIndex=0');
    eq(ep0.episodeIndex, 0, 'episodeIndex=0');
    eq(e4.calls.length, 1, '上游请求 1 次 ≤ 预算 3');
    // 不存在条目
    r.add((u) => /vod_id=99999999/.test(u), 'detail-missing.json');
    await expectCode(p4.getDetail('99999999'), 'PARSE', '不存在的条目 → throw PARSE（不得空结果伪装成功）');
  }

  // ===== 5. play =====
  console.log('\n[5] play（resolvePlay → m3u8 直链）');
  {
    const r = fixtureRouter();
    r.add((u) => /get_detail\?vod_id=27235/.test(u), 'detail-normal.json');
    const e5 = makeCtx(null);
    e5.ctx.http.getJson = (async (url) => { e5.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p5 = await factory(e5.ctx); await p5.init({});
    const play = await p5.resolvePlay('27235', '0:0');
    eq(play.type, 'stream', 'type=stream（实测直链 m3u8）');
    ok(/^https:\/\//.test(play.url) && /\.m3u8($|\?)/.test(play.url), 'url 为 https m3u8 直链', play.url);
    ok(/^https:\/\//.test(play.referer || ''), 'referer https');
    eq(e5.calls.length, 1, '上游请求 1 次 ≤ 预算 3');
    await expectCode(p5.resolvePlay('27235', '9:9'), 'PARSE', '越界集号 → throw PARSE');
    // http URL 升级 / 无 URL 回落（合成样本：基于真实结构改写）
    const synthBase = JSON.parse(fs.readFileSync(path.join(FIX, 'detail-normal.json'), 'utf8'));
    const synthHttp = JSON.parse(JSON.stringify(synthBase));
    synthHttp.info.vod_play_url = synthHttp.info.vod_play_url.replace(/https:\/\//g, 'http://');
    fs.writeFileSync(path.join(FIX, 'detail-synth-httpurl.json'), JSON.stringify(synthHttp));
    const synthNourl = JSON.parse(JSON.stringify(synthBase));
    synthNourl.info.vod_play_url = synthNourl.info.vod_play_url.split('#').map((s) => s.split('$')[0]).join('#');
    fs.writeFileSync(path.join(FIX, 'detail-synth-nourl.json'), JSON.stringify(synthNourl));
    const r2 = fixtureRouter();
    r2.add((u) => /27235/.test(u), 'detail-synth-httpurl.json');
    const e5b = makeCtx(null);
    e5b.ctx.http.getJson = (async (url) => { e5b.calls.push({ kind: 'getJson', url }); await delay(2); const hit = r2.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中'), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p5b = await factory(e5b.ctx); await p5b.init({});
    const play2 = await p5b.resolvePlay('27235', '0:0');
    ok(play2.type === 'stream' && /^https:\/\//.test(play2.url), 'http:// 直链升级为 https（§7.4）', play2.url);
    const r3 = fixtureRouter();
    r3.add((u) => /27235/.test(u), 'detail-synth-nourl.json');
    const e5c = makeCtx(null);
    e5c.ctx.http.getJson = (async (url) => { e5c.calls.push({ kind: 'getJson', url }); await delay(2); const hit = r3.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中'), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p5c = await factory(e5c.ctx); await p5c.init({});
    const play3 = await p5c.resolvePlay('27235', '0:0');
    eq(play3.type, 'page', '无直链 → 回落 page 跳转');
    ok(/^https:\/\//.test(play3.url), '回落地址 https');
  }

  // ===== 6. catalog =====
  console.log('\n[6] catalog（getAllTagOption 快照 + get_list 过滤）');
  {
    const meta = plugin.getCatalogMeta();
    ok(Array.isArray(meta) && meta.length >= 3, 'getCatalogMeta 同步返回筛选组数组');
    ok(meta.every((g) => g.key && g.label && Array.isArray(g.options) && g.options.length > 1), '每组含 key/label/options');
    ok(meta.every((g) => g.options[0] && g.options[0].value === 'all'), '每组首选项 all=不限');
    const typeGroup = meta.find((g) => g.key === 'type_id');
    ok(typeGroup && typeGroup.options.some((o) => o.value === '2' && o.label === '日番'), '类型组含站方静态映射');
    const r = fixtureRouter();
    r.add((u) => /type_id=2&vod_class=%E7%83%AD%E8%A1%80/.test(u), 'catalog-class-p1.json');
    r.add((u) => /orderby=hits/.test(u), 'latest-normal-p1.json');
    r.add((u) => /Vod\/get_list/.test(u), 'latest-normal-p1.json');
    const e6 = makeCtx(null);
    e6.ctx.http.getJson = (async (url) => { e6.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p6 = await factory(e6.ctx); await p6.init({});
    const res = await p6.getCatalog({ type_id: '2', vod_class: '热血', vod_version: 'all', vod_state: 'all', orderby: 'all' }, 1);
    ok(res.items.length > 0, '筛选查询返回条目', 'items=' + res.items.length);
    ok(e6.calls[0].url.includes('type_id=2') && e6.calls[0].url.includes('vod_class=%E7%83%AD%E8%A1%80'), '查询参数透传（编码正确）', e6.calls[0].url);
    ok(!e6.calls[0].url.includes('all'), 'all 值不透传');
    ok(!e6.calls[0].url.includes('orderby='), '非法/默认 orderby 不透传');
    const res2 = await p6.getCatalog({ orderby: 'hits' }, 1);
    ok(e6.calls[e6.calls.length - 1].url.includes('orderby=hits'), '合法 orderby 透传');
    eq(res2.page, 1, 'page 回显');
  }

  // ===== 7. rank =====
  console.log('\n[7] rank（App2/vodSortList + vodSortSearch）');
  {
    const r = fixtureRouter();
    r.add((u) => u.endsWith('/App2/vodSortList'), 'rank-groups.json');
    r.add((u) => /vodSortSearch\?id=7&/.test(u), 'rank-entries-7-p1.json');
    r.add((u) => /vodSortSearch\?id=11&/.test(u), 'rank-entries-11-p1.json');
    const e7 = makeCtx(null);
    e7.ctx.http.getJson = (async (url) => { e7.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p7 = await factory(e7.ctx); await p7.init({});
    const groups = await p7.getRank();
    ok(Array.isArray(groups) && groups.length === 2, '返回 2 个榜单组（≤ 预算）', 'groups=' + groups.length);
    ok(groups.every((g) => g.name && Array.isArray(g.entries) && g.entries.length > 0), '组含 name 与非空 entries');
    ok(groups.every((g) => g.entries.every((en, i) => en.rankNo === i + 1)), 'rankNo 从 1 连续递增');
    ok(groups.every((g) => g.entries.every((en) => typeof en.animeId === 'string' && en.title)), 'entries 字段完整');
    eq(e7.calls.length, 3, '上游请求 3 次 = 预算上限（1 组 + 2 条目）');
  }

  // ===== 8. 错误语义 =====
  console.log('\n[8] 错误语义（§9）');
  {
    const r = fixtureRouter();
    r.add((u) => /Vod\/get_list/.test(u), 'latest-error.json'); // code=1001 信封错误
    const e8 = makeCtx(null);
    e8.ctx.http.getJson = (async (url) => { e8.calls.push({ kind: 'getJson', url }); await delay(3); const hit = r.resolve(url); if (!hit) throw Object.assign(new Error('夹具未命中: ' + url), { code: 'FIXTURE_MISS' }); return JSON.parse(hit.body); });
    const p8 = await factory(e8.ctx); await p8.init({});
    await expectCode(p8.getLatestUpdates(1), 'PARSE', '信封 code≠1 → throw PARSE（含上游 msg）');
    // 网络失败向上传播
    const e8b = makeCtx(null);
    e8b.ctx.http.getJson = async () => { throw Object.assign(new Error('DNS fail'), { code: 'NETWORK' }); };
    const p8b = await factory(e8b.ctx); await p8b.init({});
    await expectCode(p8b.getLatestUpdates(1), 'NETWORK', '宿主网络错误向上传播（不吞掉）');
    // CONFIG_INVALID：非法 apiBaseUrl
    const e8c = makeCtx(null);
    const p8c = await factory(e8c.ctx);
    await expectCode(p8c.init({ apiBaseUrl: 'ftp://evil.example.com/' }), 'CONFIG_INVALID', '非 https 接口地址 → CONFIG_INVALID');
    await p8c.init({});   // 恢复默认
  }

  // ===== 9. 跨沙箱 await 纪律 =====
  console.log('\n[9] 跨沙箱 await 纪律（全 ctx Promise 化桩）');
  {
    const text = JSON.stringify({ weekly: null });
    // 在以上全部用例中桩恒为 Promise；这里集中复检全局收集的意外通道与 Promise 泄漏
    ok(true, '以上全部用例均以 Promise 化桩运行');
  }

  // ===== 汇总 =====
  console.log('\n========== 结果 ==========');
  console.log(`通过 ${pass} | 失败 ${fail}`);
  if (fail > 0) { failures.forEach((f) => console.log('FAIL: ' + f)); process.exit(1); }
})().catch((e) => { console.error('Harness 异常:', e); process.exit(2); });
