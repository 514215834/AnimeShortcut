import type { PluginManifest } from '../../host/types'

export const manifest: PluginManifest = {
  manifestVersion: '1.0',
  id: 'yinhuadm',
  name: '樱花动漫',
  version: '1.0.0',
  siteUrl: 'https://www.yinhuadm.cc',
  // 非内置：仅作为官方插件包分发；pack:plugins 产出时转为 remote 形态（Worker 沙箱）
  type: 'builtin',
  entry: 'plugins/packages/yinhuadm/index.ts',
  // 代码只用标准 dom.query 解析 HTML，Worker 沙箱亦可运行（打包后强制 worker）
  sandbox: 'main',
  capabilities: ['weekly', 'latest', 'search', 'detail', 'play'],
  permissions: { domains: ['yinhuadm.cc'], storage: false },
  cacheHints: { weekly: 600, latest: 600, search: 0, detail: 3600, play: 0 },
  description:
    '樱花动漫（www.yinhuadm.cc，苹果CMS 架构）数据源插件，接口依据《探测报告-yinhuadm》；详情接口直出 m3u8 支持站内播放',
  author: 'AnimeShortcut',
}
