/** 真机冒烟：打包产物直连真实 API（限速 1.1s/请求，验证夹具外无漂移） */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'public', 'plugins', 'girigirilove.asplugin.json'), 'utf8'));
const fakeSelf = {};
const sandbox = { self: fakeSelf };
vm.createContext(sandbox);
vm.runInContext(pkg.code, sandbox, { filename: 'plugin.iife.js' });

const realHttp = {
  async getJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { code: 'NETWORK' });
    return res.json();
  },
  async getText(url) { throw new Error('unused'); },
  async getRaw(url) { throw new Error('unused'); }
};
const ctx = {
  env: { hostVersion: '1.0.0', specVersion: '1.0', locale: 'zh-CN', timezone: 'Asia/Tokyo', mode: 'production' },
  http: realHttp,
  dom: {}, storage: {},
  log: { debug() {}, info() {}, warn(...a) { console.log('  [warn]', ...a); }, error(...a) { console.log('  [error]', ...a); } },
  utils: {
    async absUrl(b, p) { return new URL(p, b).href; },
    async decodeEntities(s) {
      return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, n) => {
        if (!n.startsWith('#')) return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[n.toLowerCase()] ?? m;
        const cp = n[1].toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
        return cp > 0 && cp <= 1114111 ? String.fromCodePoint(cp) : m;
      });
    },
    hashId(s) { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); }
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const plugin = await fakeSelf.__AS_PLUGIN__(ctx);
  await plugin.init({});
  let bad = 0;
  const check = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? ' | ' + extra : '')); if (!cond) bad++; };

  const wk = await plugin.getWeeklySchedule(1);
  check('weekly', wk.items.length > 0 && wk.hasMore === false, 'items=' + wk.items.length + ' weekday 分布=' + JSON.stringify(wk.items.reduce((m, i) => (m[i.weekday] = (m[i.weekday] || 0) + 1, m), {})));
  await sleep(1100);

  const lt = await plugin.getLatestUpdates(1);
  check('latest', lt.items.length === 30 && lt.hasMore === true && Number.isFinite(lt.items[0].updateTime), '首条=' + lt.items[0].title + ' @' + new Date(lt.items[0].updateTime).toISOString());
  await sleep(1100);

  const se = await plugin.search('葬送', 1);
  check('search', se.items.length >= 1, 'items=' + se.items.length + ' 首条=' + (se.items[0] && se.items[0].title));
  await sleep(1100);

  const d = await plugin.getDetail('27235');
  check('detail', d.episodes.length >= 2 && d.episodes[0].episodeId === '0:0', 'episodes=' + d.episodes.length + ' lines=' + [...new Set(d.episodes.map((e) => e.line))].join('/'));
  await sleep(1100);

  const play = await plugin.resolvePlay('27235', '0:0');
  let streamOk = false;
  if (play.type === 'stream') {
    const r = await fetch(play.url, { headers: { Referer: play.referer } });
    const head = (await r.text()).slice(0, 7);
    streamOk = r.ok && head === '#EXTM3U';
  }
  check('play→stream 可拉流', play.type === 'stream' && streamOk, play.url);
  await sleep(1100);

  const cat = await plugin.getCatalog({ type_id: '21' }, 1);
  check('catalog', cat.items.length > 0, 'items=' + cat.items.length);
  await sleep(1100);

  const rk = await plugin.getRank();
  check('rank', rk.length === 2 && rk[0].entries.length > 0 && rk[0].entries[0].rankNo === 1, rk.map((g) => g.name + ':' + g.entries.length).join(', '));

  console.log(bad === 0 ? '\n真机冒烟全部通过' : `\n真机冒烟失败 ${bad} 项`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error('冒烟异常:', e); process.exit(2); });
