# 动漫更新看板（AnimeShortcut）

纯前端实现的动漫更新聚合看板：从多个动漫站点数据源拉取更新信息，提供每周更新时间表、最新更新列表、追番订阅与更新提醒；m3u8 直链站内播放（hls.js，倍速/续播/代理兜底），其余场景回落跳转源站。部署在 GitHub Pages，无任何后端。

## 当前状态：迭代 0~3 已完成，迭代 4 部分交付

| 迭代 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 脚手架、GitHub Pages 流水线、agedm 连通性探测 | ✅ 完成 |
| 1 | MVP 看板（插件框架 + agedm 插件、周更表、搜索、详情、跳转播放、代理链） | ✅ 完成 |
| 2 | 追番个人化（订阅、历史、更新提醒） | ✅ 完成 |
| 3 | 多源与站内播放（多源归并、hls.js 站内播放、播放健壮性、外置插件导入/热插拔管线） | ✅ 完成 |
| 4 | 平台化增强 | 部分交付：深色模式、官方插件包分发与数据源管理已上线；PWA/数据备份/图片代理未开始 |

详细路线见 [docs/功能迭代计划.md](docs/功能迭代计划.md)。

## 数据源与官方插件

数据源全部按《数据源插件接口规范》实现，宿主零适配：应用内置 `agedm`（Age动漫），其余源以**官方插件包**（单文件 `.asplugin.json`，Worker 沙箱运行）随本站点发布，在设置页「允许导入外部插件」中粘贴地址安装：

| 插件 | 站点 | 能力 | 安装地址 |
| --- | --- | --- | --- |
| Age动漫（内置） | m.agedm.io | 周更/最新/搜索/详情/播放/分类/排行 | —（随应用装载） |
| 樱花动漫 | www.yinhuadm.cc | 周更/最新/搜索/详情/播放 | `<站点地址>/plugins/yinhuadm.asplugin.json` |
| 动漫MIKU | www.dmmiku.com | 最新/搜索/详情/播放/分类/排行 | `<站点地址>/plugins/dmmiku.asplugin.json` |
| GiriGiri动漫 | ani.girigirilove.com | 周更/最新/搜索/详情/播放/分类/排行 | `<站点地址>/plugins/girigirilove.asplugin.json` |

`<站点地址>` 即部署地址（如 `https://<user>.github.io/AnimeShortcut`）。按规范开发的新插件零适配即插即用，设置页「开发者 · 插件开发」提供规范全文与 AI 生成提示词。

## 技术栈

Vue 3（`<script setup>`）+ Vite 8 + TypeScript + Pinia + vue-router（hash）+ Tailwind CSS 4。

## 本地开发

```bash
npm install
npm run dev            # 开发服务器
npm run build          # 类型检查 + 打包官方插件产物 + 生产构建
npm run preview        # 预览构建产物
npm run pack:plugins   # 仅重新打包官方插件（src/plugins/{sources,packages}/ → public/plugins/）
```

## 部署（GitHub Pages）

1. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
2. 推送到 `main` 分支即自动构建发布到 `https://<user>.github.io/AnimeShortcut/`（`vite.config.ts` 的 `base` 与仓库名对应；若用用户根仓库改为 `'/'`）。
3. 官方插件包由构建流程自动生成并随 dist 部署，安装地址 = `<站点地址>/plugins/<id>.asplugin.json`（地址在设置页导入区展示）。

## 文档

- [技术架构设计](docs/技术架构设计.md) — 分层架构、插件模式、跨域代理链、存储设计、部署
- [功能迭代计划](docs/功能迭代计划.md) — 迭代 0~4 的功能点、验收标准与风险
- [数据源插件接口规范](docs/数据源插件接口规范.md) — 站点解析插件的标准接口（normative）
- 探测报告：[agedm](docs/探测报告-agedm.md) / [yinhuadm](docs/探测报告-yinhuadm.md) / [dmmiku](docs/探测报告-dmmiku.md) / [girigirilove](docs/探测报告-girigirilove.md) — 各数据源接口实测结论

## 合规声明

本项目仅做公开信息聚合与源站官方页面跳转，不存储、不分发任何视频内容；用户订阅等个人数据仅保存在浏览器本地，不上传不采集。
