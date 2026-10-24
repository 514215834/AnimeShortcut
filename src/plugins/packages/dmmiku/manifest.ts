import type { PluginManifest } from './types';

/**
 * 动漫MIKU（www.dmmiku.com / maccms v10 + conch 模板改版）数据源插件清单。
 *
 * 双形态打包（规范 §12）：
 *  - builtin：以本文件原样类型随宿主构建；
 *  - remote：pack:plugins 时覆盖 type/sandbox/entry/sha256 后生成 .asplugin.json。
 *
 * 探测结论（详见 PROBE.md）：
 *  - maccms JSON API（api.php/provide/vod）被站点关闭（返回正文 "closed"）；
 *  - 站点无周更档期数据（label/week.html 404，首页无周更板块）→ 不声明 weekly；
 *  - 全部能力走 HTML 解析，仅 dmmiku.com 一个域名白名单即可覆盖（后缀匹配含 www./img. 子域）。
 */
export const manifest: PluginManifest = {
  manifestVersion: '1.0',
  id: 'dmmiku',
  name: '动漫MIKU',
  version: '1.0.1',
  siteUrl: 'https://www.dmmiku.com/',
  icon: 'https://www.dmmiku.com/template/conch/asset/img/favicon.png',
  type: 'builtin',
  entry: 'plugins/sources/dmmiku/index.ts',
  sandbox: 'worker',
  capabilities: ['latest', 'search', 'detail', 'play', 'catalog', 'rank'],
  permissions: { domains: ['dmmiku.com'], storage: false },
  config: [
    {
      key: 'siteBaseUrl',
      label: '站点地址',
      type: 'string',
      placeholder: '留空使用默认 https://www.dmmiku.com/',
    },
    {
      key: 'rankAnchorId',
      label: '榜单锚点详情页ID',
      type: 'number',
      default: 1293,
      placeholder: '留空使用默认 1293（海贼王）',
    },
  ],
  cacheHints: { latest: 600, search: 0, detail: 3600, play: 0, catalog: 600, rank: 1800 },
  description: '动漫MIKU（dmmiku.com）：新番/完结动漫聚合，支持搜索、分类、榜单与详情剧集。',
  author: 'AnimeShortcut',
};
