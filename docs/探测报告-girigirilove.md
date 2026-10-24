# 探测报告 — GiriGiri（ani.girigirilove.com）

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-10-24（插件 v1.0.0 实装依据） |
| 结论 | React SPA + maccms 风格定制 REST API，**全 JSON，无需 HTML 解析** |
| 分发形态 | **官方插件包**（不内置）：源码在 `src/plugins/packages/girigirilove/`（预构建纯 JS IIFE 形态，规范 §12），`npm run pack:plugins` 产出 `public/plugins/girigirilove.asplugin.json` 随站点发布；用户在设置页「允许导入外部插件」导入该地址装载（Worker 沙箱） |

## 端点（base `https://m3u8.girigirilove.com/api.php/`）

| 能力 | 端点 | 说明 |
| --- | --- | --- |
| weekly | `GET App2/weekList` | 站方**人工编排**档期表：`info:[{week, video:[{vod_id,vod_name,vod_pic,vod_time(备注文本)}]}]`；`week` 1=周一…7=周日（站方前端 tab 静态映射实锤）。注意桶内条目 `vod_weekday` 字段与编排桶可能不一致（如杀手旅店桶=7 但字段="一"），**以桶序为准** |
| latest | `GET Vod/get_list?limit=30&offset=(p-1)*30` | 默认排序即 `vod_time` 降序；`total` 判 hasMore |
| search | `GET Vod/get_list?vod_name=<kw>&limit&offset` | 空结果 `{code:1, info:{total:0, rows:[]}}` |
| detail | `GET Vod/get_detail?vod_id=` | `info` 即完整 maccms vod 行。**坑**：不存在的 id 仍返回 `code:1` 但 `info` 仅 `{collect_status:0}` → 必须按 `vod_id/vod_name` 缺失判定 PARSE |
| play | 详情 `vod_play_url` 直链 | 格式 `线路1$集名$url#...$$$线路2#...`；m3u8 直链（akua 子域），实测**无需 Referer** 即可拉流；resolvePlay 单请求（detail ttlMs 300s 去重） |
| catalog | `GET Vod/getAllTagOption` + `get_list` 过滤 | 过滤参数：`type_id`(2日番/3美番/20真人/21剧场版/24BD副音轨/26其他，站方前端静态表)、`vod_class`、`vod_version`(TV番/泡面番/OVA)、`vod_state`(小说改/漫画改/游戏改/原创)、`orderby`(hits/score，空=最新)。**坑**：`Vod/get_year`、`Vod/get_area` 对所有 `type_id_1` 均返回空（area 已被站方改造成月份档期"十月"），不可用作筛选组 |
| rank | `GET App2/vodSortList` + `GET App2/vodSortSearch?id=&page=&pageSize=` | 站方编排榜（愛動画（周）id=7 / 愛劇場（周）id=11，num=20）；**坑**：榜单条目 `vod_pic` 为相对路径 `upload/...` |

## 字段映射要点

- 封面：绝对 URL 直接 https 化；相对 `upload/` 前缀 → `https://jpg.girigirilove.com/`。**坑**：站方前端映射到 `jpg.girigirilove.net`，实测该域连接重置不可达，`.com` 同路径 200 可用。
- 线路名（站方 index chunk 映射）：`/cht|繁體|繁体|繁中/`→繁中，`/chs|简体|簡體|简中/`→简中，其余未标注。
- `vod_weekday` 为中文字符（一/二/…/日）→ detail 的 weekday；周更表用编排桶 `week`（7→0）。
- `vod_time` 数字（秒）→ updateTime ×1000；周表条目的 `vod_time` 是**文本备注**（"更新至01集 / 23點30分"）→ latestEpisodeTitle，updateTime 缺省不虚构。
- `vod_content` 含 HTML（`<p>`）→ 剥标签 + decodeEntities；`vod_class` 逗号分隔 → genres；`vod_isend` 1→finished。
- 站内页面：详情 `https://ani.girigirilove.com/detail/<vodId>`；播放 `/play/<vodId>?sourceIndex=<l>&episodeIndex=<e>`。

## 复验 / 维护

```
npm run pack:plugins                                  # 重新打包（预构建 IIFE 直通）→ public/plugins/girigirilove.asplugin.json
node src/plugins/packages/girigirilove/test-harness.cjs  # §13 全量回归（Promise 化 ctx 桩，85 断言，对交付文件）
node src/plugins/packages/girigirilove/live-smoke.cjs    # 真机冒烟（限速 1.1s/请求）
```

夹具在 `__fixtures__/`（`weekly-normal`、`latest-normal-p1`、`latest-error`、`search-{keyword,empty}-p1`、`catalog-class-p1`、`detail-normal`、`detail-missing`、`rank-groups`、`rank-entries-{7,11}-p1`；`detail-synth-*` 为测试运行时生成的合成边界样本）。
