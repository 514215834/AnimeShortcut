# 探测报告 — 动漫MIKU（www.dmmiku.com）

| 项目 | 内容 |
| --- | --- |
| 站点 | https://www.dmmiku.com/（动漫MIKU / 动漫米库） |
| 架构 | **苹果CMS（maccms v10）+ conch（大海螺）模板改版（billhao）**，Cloudflare 防护 |
| 探测时间 | 2026-10-21 |
| 插件形态 | **纯 HTML 解析**（JSON API 已被站点关闭）；沙箱 `worker`（仅依赖 `ctx.dom` / `ctx.http` / `ctx.utils`） |
| 分发形态 | **官方插件包**（不内置）：源码在 `src/plugins/packages/dmmiku/`，`npm run pack:plugins` 产出 `public/plugins/dmmiku.asplugin.json` 随站点发布；用户在设置页「允许导入外部插件」导入该地址装载（Worker 沙箱）；回归：`npm run pack:plugins && node src/plugins/packages/dmmiku/self-check.mjs` |

## 1. 端点探测结论

### 1.1 JSON API（不开放）

| 端点 | 结果 |
| --- | --- |
| `GET /api.php/provide/vod/?ac=list` | HTTP 200，正文 6 字节 `"closed"` |
| `GET /api.php/provide/vod/at/json/?ac=detail` | 同上 `"closed"` |

maccms 的资源库输出模块被站方关闭 → **不得依赖，改走页面解析**（规范 §8.8 优先 JSON API 的顺序在「API 存在且开放」时才适用）。

### 1.2 能力端点矩阵（实测 200）

| 能力 | 端点 | 单页容量 | 上游请求 |
| --- | --- | --- | --- |
| `latest` | `/index.php/map/index.html`（最近更新） | 全量单页 120 条 | 1 |
| `search` | `/index.php/vod/search.html?wd={keyword}`（GET 可用） | 单页全量、无分页器 | 1 |
| `detail` | `/index.php/vod/detail/id/{id}.html` | — | 1 |
| `play` | `/index.php/vod/play/id/{id}/sid/{s}/nid/{n}.html` | — | 2（详情定位 + 播放页） |
| `catalog` | `/index.php/vod/show/[class/…][id/…][year/…][letter/…][page/N].html` | type 页 36/页；show 页 60/页 | 1 |
| `rank` | 详情页侧栏「新番周排行榜」（无独立榜单页，404 已测） | 10 条 | 1 |
| `weekly` | **无**：`/label/week.html` 404、首页无周更板块 → **不声明该能力** | — | — |

已实测的组合筛选 URL（均 200）：

- `/vod/show/class/奇幻.html`（全局类型）、`/vod/show/id/22/letter/A.html`
- `/vod/show/class/奇幻/id/22/year/2026/page/1.html`（多段组合 + 分页）
- `/vod/show/id/22/year/2026.html`、`/vod/show/id/1/page/2.html`（全站 = `id/1`）

### 1.3 播放链路（player_aaaa）

`/static/js/playerconfig.js` + `player.js`：`var player_aaaa={encrypt,url,from,server,…}`。

- `encrypt`：`0` 明文 / `1` unescape（%uXXXX、%XX）/ `2` base64→unescape；
- 当前站数据全部为占位 token（如 `url: "Tuzimi-1754759450"`，`from: dplayer, server: no`），直链 404、无站内二次解析 → 插件将
  1. 若解密后 `url` 为 `https?://….(m3u8|mp4|flv)` → **stream**（宿主播放器直连，Referer=站点）；
  2. 否则一律回落 **page**（打开源站播放页 `/vod/play/id/{id}/sid/{s}/nid/{n}.html`）——如实、可播放，不伪装封面成功。

## 2. 字段映射

### 2.1 列表条目（三形态，zip 归一）

| 来源 | 容器 | 链接/标题 | 封面 | 备注 |
| --- | --- | --- | --- | --- |
| type/show 页 | `ul.vodlist_wi > li.vodlist_item` | `a.vodlist_thumb[href][title]` | `a[data-original]` | `span.pic_text` |
| map 页 | `div.vodlist_smt > li.ranklist_item` | `a[href][title]` | `div.ranklist_thumb[data-original]` | `p>span.vodlist_sub`（状态…）；日期：`span.vod_tname em`（MM-DD） |
| search 页 | `div.search_box > li.searchlist_item` | `a.vodlist_thumb[href][title]` | `a[data-original]` | `span.pic_text` |

映射规则：

- `animeId`：`/vod/detail/id/(\d+)\.html` 的数字 id（maccms vod id，长期稳定）；
- `title`：thumb 的 `title` 属性（避开标题链接内部_FUNC span.info_right 污染）；
- `cover`：`data-original` → 根相对补全 + 仅 https；
- `latestEpisodeTitle`：备注具「集数语义」（`第…集/更新至/…`）才填，`已完结/连载中/未知` 不填；
- `updateTime`：MM-DD 补全（站方无年份/时区标注，按 UTC+8 取「不晚于今天+36h」最近候选年；无候选缺省，不虚构）；
- `playPageUrl`：`/vod/play/id/{id}/sid/1/nid/1.html`（与详情页「立即播放」按钮同构）；
- `weekday`：站点无档期数据 → 恒缺省（「无把握缺省不猜」，规范 §7.3）。

### 2.2 详情页（`div.detail_list_box` + `#bofy`）

| 目标 | 选择器 / 形态 |
| --- | --- |
| 标题 | `h2.title` |
| 封面 | `a.vodlist_thumb[data-original]` |
| 立即播放 | `a.btn_primary[href]`（缺省构造首集链接） |
| 年份/地区/类型 | `div.content_detail.content_min li.data a[href]`：按 `/year/` `/area/` `/class/` 语义分流（未知为纯文本、无链接） |
| 状态 | `li.data span.data_style`（「已完结」→ finished；「第N集」「更新至…」「连载」→ ongoing） |
| 更新日期 | `li.data em`（MM-DD） |
| 简介 | `div.content_desc.full_text[innerHTML]` 剥标签；「暂无/暂无简介」→ 缺省 |
| 剧集线路 | `.play_source_tab a[alt]`（线路名）× `div.play_list_box`（外块）按 DOM 序对齐 |
| 剧集 | 每块内 `div#playlistbox ul.content_playlist li>a[href/text]`（`.playlist_full` 为重复渲染副本，不取） |
| `episodeId` | `${lineIndex}:${episodeIndex}`（均 0-based，规范 §7.2 多线路格式）+ 填 `line/lineIndex/episodeIndex` |

> 实测采样（1295/1293/1617/1618/601/1118/3510…）当前全部为单线路「主播放线路」；多线路分组逻辑对站点未来加线保持兼容。

### 2.3 排行榜（详情页 `div.right_row`）

| 目标 | 选择器 / 形态 |
| --- | --- |
| 榜单名 | `h3.title`（「新番周排行榜」） |
| 第 1 名 | `li.ranklist_item > a[href][title]`；热度：`div.pannel_head > span.text_muted` 首串数字 |
| 第 2-10 名 | `li.part_eone a`：`href`、`span.part_nums`（名次）、`span.renqi`（热度）；标题 = innerHTML 剥 span |

站点无月榜/总榜 → `getRank()` 返回单组；榜单页锚点默认 `id=1293`（海贼王，收录早期、长期更新），可用 config `rankAnchorId` 覆盖。

### 2.4 分页（catalog：页码从 1 起）

- 分页器：`<li class="hidden_mb"><a href="…/page/{N}.html">尾页</a></li>`；
- `hasMore = page < 尾页页码`；末页无分页器 / 尾页无链接（`btns_disad`）→ `hasMore: false`（type22-p12 实测无分页器）；
- 搜索/最近更新为整页全量 → `hasMore` 恒 false，`page>1` 返回空（视为无更多页）。

## 3. 夹具与测试（§13）

夹具位于 `__fixtures__/`，命名 `<capability>-<case>-p<page>.html`（文本样本 `?raw` 导入回放）：

| 夹具 | 用例 | 断言 |
| --- | --- | --- |
| `latest-normal-p1.html` | latest 成功 | 10 条、`hasMore:false`、updateTime/cover https |
| `latest-parse-error-p1.html` | latest 异常 | Cloudflare 挑战页 → throw `{code:'PARSE'}` |
| `search-normal-p1.html` | search 成功 | 4 条（魔 都，异兽魔都/魔都精兵…） |
| `search-empty-p1.html` | search 空结果 | `{items:[], hasMore:false}` |
| `search-parse-error-p1.html` | search 异常 | PARSE |
| `catalog-normal-p1.html` | 分类成功 | 8 条、`hasMore:true`（尾页=7） |
| `catalog-normal-p2.html` | 分类第 2 页 | page=2 |
| `catalog-empty-p1.html` | 分类空结果（零筛选命中） | `{items:[], hasMore:false}` |
| `catalog-parse-error-p1.html` | catalog 异常 | PARSE |
| `detail-normal-p1.html` | detail 成功 | 标题/状态/13 集、`0:0`、episode.playPageUrl https |
| `detail-empty-episodes-p1.html` | detail 无剧集 | `episodes: []`（合法空） |
| `detail-parse-error-p1.html` | detail 异常 | PARSE |
| `play-normal-p1.html` | play 成功（token） | `{type:'page', url: https}` |
| `play-stream-normal-p1.html` | play 成功（m3u8 直链） | `{type:'stream', url:.m3u8, referer}` |
| `play-parse-error-p1.html` | play 异常（无 player_aaaa） | PARSE |
| `rank-normal-p1.html` | rank 成功 | 单组 10 条、rankNo 1-10、score |
| `rank-parse-error-p1.html` | rank 异常 | PARSE |

样本来源：2026-10-21 对 www.dmmiku.com 实抓页面，去脚本/广告/统计/评论节点后入库（脱敏不含用户数据）。`play-stream-normal-p1.html` 为合成样本（真实数据均为占位 token，构造与模板同构的 m3u8 直链形态覆盖 stream 分支）；`catalog-empty-p1.html` 为正常页去条目的同构空态。

## 4. 频率礼貌（§8.8）

- 每个能力调用上游请求 ≤ 3（play 为上限 2；其余 1）；
- 遵守宿主层限流（每插件并发 ≤2、QPS ≤1）与去重缓存；插件自身不建持久缓存；
- 不批量扫描多页；只请求必要页面。
