# 动漫更新看板（AnimeShortcut）

纯前端实现的动漫更新聚合看板：从多个动漫站点数据源拉取更新信息，提供每周更新时间表、最新更新列表、追番订阅与更新提醒；播放以跳转源站为主。部署在 GitHub Pages，无任何后端。

## 当前状态：迭代 2 · 追番个人化 已完成

| 迭代 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 脚手架、GitHub Pages 流水线、agedm 连通性探测 | ✅ 完成 |
| 1 | MVP 看板（插件框架 + agedm 插件、周更表、搜索、详情、跳转播放、代理链） | ✅ 完成 |
| 2 | 追番个人化（订阅、历史、更新提醒） | ✅ 完成 |
| 3 | 多源与站内播放 | 未开始 |
| 4 | 平台化增强（PWA 等） | 未开始 |

详细路线见 [docs/功能迭代计划.md](docs/功能迭代计划.md)。

## 技术栈

Vue 3（`<script setup>`）+ Vite 8 + TypeScript + Pinia + vue-router（hash）+ Tailwind CSS 4。

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物
```

## 部署（GitHub Pages）

1. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
2. 推送到 `main` 分支即自动构建发布到 `https://<user>.github.io/AnimeShortcut/`（`vite.config.ts` 的 `base` 与仓库名对应；若用用户根仓库改为 `'/'`）。

## 文档

- [技术架构设计](docs/技术架构设计.md) — 分层架构、插件模式、跨域代理链、存储设计、部署
- [功能迭代计划](docs/功能迭代计划.md) — 迭代 0~4 的功能点、验收标准与风险
- [数据源插件接口规范](docs/数据源插件接口规范.md) — 站点解析插件的标准接口（normative）
- [探测报告-agedm](docs/探测报告-agedm.md) — agedm 数据源接口实测结论

## 合规声明

本项目仅做公开信息聚合与源站官方页面跳转，不存储、不分发任何视频内容；用户订阅等个人数据仅保存在浏览器本地，不上传不采集。
