import type { PluginManifest } from '../../host/types'

export const manifest: PluginManifest = {
  manifestVersion: '1.0',
  id: 'agedm',
  name: 'Age动漫',
  version: '1.3.0',
  siteUrl: 'https://m.agedm.io',
  type: 'builtin',
  entry: 'plugins/sources/agedm/index.ts',
  // builtin 插件可按规范 §3 选择 main 沙箱；Worker 沙箱桥随迭代 3 的 remote 插件一起交付
  sandbox: 'main',
  capabilities: ['weekly', 'latest', 'search', 'detail', 'play', 'catalog', 'rank'],
  // wuzhoupai.com：站方流地址解析器（探测报告 §5），resolvePlay 用；流 CDN 由宿主播放器直连/Worker 白名单管理
  permissions: { domains: ['agedm.io', 'wuzhoupai.com'], storage: false },
  config: [
    {
      key: 'apiBaseUrl',
      label: '接口地址',
      type: 'string',
      placeholder: 'https://api.agedm.io/v2/（留空使用默认）',
    },
  ],
  cacheHints: { weekly: 600, latest: 600, search: 0, detail: 3600, play: 0, catalog: 600, rank: 1800 },
  description: 'Age动漫（m.agedm.io）数据源插件，接口依据《探测报告-agedm》；支持解析直连 m3u8 站内播放',
  author: 'AnimeShortcut',
}
