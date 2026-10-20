# 数据源探测报告 — agedm（Age动漫）

| 项目 | 内容 |
| --- | --- |
| 探测日期 | 2026-10-18 |
| 探测方式 | 真实网络 curl 实测（移动站页面、JS bundle 逆向、API 直调） |
| 结论 | ✅ **API 完全可用；但 CORS 仅对源站白名单 Origin 开放 → 前端必须经代理访问（与已确认的 Worker 代理方案一致）；MVP「跳转源站播放」的 URL 可直接构造** |
| 关联 | [技术架构设计](./技术架构设计.md) §4.1、[数据源插件接口规范](./数据源插件接口规范.md)、[功能迭代计划](./功能迭代计划.md) 迭代 1 |

---

## 1. 结论摘要

| 探测项 | 结果 |
| --- | --- |
| 站点可达性 | ✅ `m.agedm.io` HTTP 200（Vue2 SPA，vue-router 3 + vuex + vant + axios） |
| API 基址 | ✅ `https://api.agedm.io/v2/`（自 JS bundle 逆向获得；**旧线索 api.agedm.io:2849 已废弃**） |
| 核心端点 | ✅ `update` / `home-list` / `search` / `detail/<AID>` 全部实测 200 |
| CORS 直连 | ❌ 服务端按 **Origin 白名单**回 `Access-Control-Allow-Origin`（实测 `https://m.agedm.io` 通过、任意 origin 不回 ACAO）→ 浏览器从 GitHub Pages 直连**不可用** |
| 播放跳转 | ✅ 站内路由为 **hash 模式**，`/#/play/:id/:l/:e` 可直接构造 |
| 封面图 | ✅ 经 `gimg*.baidu.com` 中转，实测带/不带 Referer 均可加载；站点自身用 `referrerpolicy="no-referrer"`（沿用即可） |
| HTTPS | ✅ 全链路 https（HSTS preload） |

## 2. API 端点清单（实测）

基址：`https://api.agedm.io/v2/`。请求仅需 UA；GET 即可。响应分**两种包裹形态**，适配器须兼容：

- 裸结构：`update`、`home-list` 直接返回数据对象；
- 信封结构：`search`、`detail` 返回 `{ code: 200, message: "", data: {...} }`（失败如 `{ code: 40050, message: "参数错误！" }`）。

| 端点 | 方法/参数 | 返回结构（实测字段） | 用途 |
| --- | --- | --- | --- |
| `/v2/home-list` | GET 无参数 | `{ latest: Item[], recommend: Item[], week_list: { "0"~"6": WItem[] } }` | 首页：最新 + 推荐 + **周更表** |
| `/v2/update` | GET `page`、`size`（站点默认 size=30） | `{ total: "5666", videos: Item[] }`（total 为字符串） | 最新更新流（分页） |
| `/v2/search` | GET `query`、`page`（**参数名是 query，不是 keyword**；传 keyword 返回 `{code:40050}`） | `{ code, message, data: { videos: SearchItem[] } }` | 搜索 |
| `/v2/detail/<AID>` | GET | `{ video: Detail, series, similar, player_label_arr, player_vip, player_jx }` | 详情 + 剧集 + 线路 |
| `/v2/catalog` | GET `region`/`genre`/`letter`/`year`（"all"=不限）+`page`/`size` | `{ total, videos: SearchItem 形态[] }`（含 cover） | 分类浏览（筛选组：地区/版本/首字母/年份 2026~2009） |
| `/v2/rank` | GET `year`（"all"=不限） | `{ total, rank: [周榜50条, 月榜50条, 总榜50条] }`，条目 `{ NO, AID, CCnt, Title }`（组名按序固定，无封面） | 排行榜 |
| `/v2/slipic` | GET | — | 轮播图（未深入） |

`week_list` 键 `"0"`~`"6"`（0=周日），周更表直接可用；`WItem` 字段：`{ isnew, id, wd, name, mtime: "2026-10-18 01:02:53", namefornew: "00:30 第4集" }`。

## 3. 字段映射 → 插件统一模型

`Item`（update/home-list）：`{ AID, Href, NewTitle, PicSmall, Title }`
`SearchItem`：`{ id, name, uptodate, time(unix 秒), status, play_time, type, name_original, name_other, premiere, writer, tags, tagsArr, company, intro, cover }`
`Detail.video`：含 `id, name, name_original, name_other, area, status("连载"/"完结"), uptodate, time, tags_arr, intro, cover, playlists, ...`
`playlists`：`{ 线路代码: [[集名, 加密token], ...] }`；`player_label_arr`：`{ 线路代码: 显示名 }`（西瓜/非凡/无尽/暴风…31 条线路）；`player_jx`：`{ vip: "https://jx.wuzhoupai.com:8443/vip/?url=", zj: "https://jx.wuzhoupai.com:8443/m3u8/?url=" }`（解析器前缀）；`player_vip`：VIP 线路代码逗号串。

| 统一模型字段 | agedm 来源 |
| --- | --- |
| `animeId` | `AID` / `id` |
| `title` | `Title` / `name` |
| `cover` | `PicSmall` / `cover` |
| `weekday` | 仅 `week_list` 有：`wd`（0~6，0=周日，语义即源站档期，直接采用） |
| `latestEpisodeTitle` | `NewTitle`（如 "第3集"、"第20集(完结)"）/ `uptodate` |
| `updateTime` | `week_list` 的 `mtime` 按源站本地时间解析（时区未标注，暂按 UTC+8 处理；**weekday 不依赖它**，不影响周更表正确性）；`search` 的 `time` 为 unix 秒 ×1000 |
| `playPageUrl` | `https://m.agedm.io/#/detail/<AID>`；剧集级：`https://m.agedm.io/#/play/<AID>/<l>/<e>` |
| `description` | `intro` |
| `genres` | `tags_arr` |
| `status` | `"连载"`→`ongoing`，`"完结"`→`finished` |
| `episodes[].episodeId` | `<线路序号>:<集序号>`（复合： playlists 遍历序号） |
| `episodes[].title` | `[0]`（"第01集"） |

## 4. CORS 实测（关键）

```
# Origin: https://asus.github.io（我们的部署域）
→ 无 Access-Control-Allow-Origin（其余 ACA-methods/headers/credentials 有）→ 浏览器直连被拦截

# Origin: https://m.agedm.io（源站白名单）
→ Access-Control-Allow-Origin: https://m.agedm.io （按 Origin 回显，非 *；且 Allow-Credentials: true）

# OPTIONS 预检
→ 200，允许 GET/POST/OPTIONS，但同样只对白名单 Origin 回 ACAO
```

**推论**：官方 API 面向自家域名（含 App），未对第三方开放。站点 axios `withCredentials: true` 与 fikker CDN Cookie 配合（CDN 层可能用 Cookie 做缓存/风控），公共代理转发 GET 一般不受影响（cookie 非必需，实测无 Cookie 也能拿到数据）。

## 5. 播放链路（迭代 3 参考）

1. 详情接口给出全部线路与剧集：`playlists[线路][集] = [集名, 加密token]`。
2. 播放页（`/#/play/:id/:l/:e`）重新拉 detail，取第 `l` 条线路第 `e` 集的 token，拼出 iframe 地址：`player_jx.zj + token`（VIP 线路用 `vip` 前缀）→ 即 `https://jx.wuzhoupai.com:8443/m3u8/?url=<token>` 的第三方解析器。
3. **站内播放可行性（迭代 3 探明项）**：请求解析器 URL 看响应是否直接是 m3u8，或返回含流地址的页面/302。~~l/e 的 0/1-based 语义需浏览器实测确认~~ **已确认（2026-10-18 浏览器实测）**：`/#/play/<AID>/<l>/<e>` 中 l/e 均为 **1-based**（l = 非空线路序号，e = 集序号）；源站代码三处自洽（初始化 `params.l-1`、取集 `n[e-1]`、历史写 `l+1`），并实测 `/play/20260293/1/1` 正确加载第 1 线路第 1 集的解析器 iframe。VIP 线路走 `player_jx.vip` 前缀。
4. **解析器流地址直取（2026-10-19 实测补充，站内播放已落地）**：GET `https://jx.wuzhoupai.com:8443/m3u8/?url=<token>`（响应 `ACAO: *`，浏览器可直连）返回 HTML 页，其中 `var Vurl = '...'` 即直连流地址：
   - 普通线路为完整 **https m3u8 URL**：实测 `ffm3u8 → vip.ffzy-plays.com/…/index.m3u8`、`bfzym3u8 → fengbao13.com/…`、`wjm3u8 → v3.ppqrrs.com/…`、`lzm3u8 → v.lzcdn31.com/…`；
   - VIP 线路（`player_vip` 列表，如 xigua）解析出非 URL 的加密串（`zkzk_…`），无法直取 → 回落跳转源站播放页；
   - **流 CDN CORS**：非凡/暴风/无尽三线路的 master/子清单/分片实测均回 `Access-Control-Allow-Origin: *`（hls.js 可直连）；分片为同域相对路径。CDN 无 Referer 校验（curl 无 Referer 实测 200）。
   - 插件实现：agedm v1.3.0 `resolvePlay` = detail（ttl 5min）→ 解析器（ttl 10min）→ `type:'stream'`；任一环节失败回落 `type:'page'`（解析器域名 `wuzhoupai.com` 已加入插件白名单与 Worker 白名单）。
5. MVP 不依赖此链路：跳转 `/#/play/<AID>/<l>/<e>` 即可，由源站自己处理。

## 6. 其他实测要点

- **限流/风控**：未触发实测限流；服务端有 fikker CDN（Set-Cookie 会话缓存），`Cache-Control: no-cache`。插件端按规范限流（QPS≤1）保守使用。
- **分页**：`/update` size 上限未测（站点用 30）；`total` 是字符串需 parseInt。
- **错误形态**：参数错返回 `{code:40050, message:"参数错误！"}`（信封结构），插件应把 `code!==200` 映射为 `PARSE`/`CONFIG_INVALID` 类错误。
- **接口演进风险**：bundle 中 baseURL 为硬编码常量（本次从 `app.9c5d5617.js` 逆向）；站点曾用 :2849 端口，域名/版本路径可能再变 → 插件 config 暴露 `apiBaseUrl` 可覆盖（已列入 manifest 示例）。
- **封面**：`PicSmall` 实为 Baidu 图片代理套壳（内嵌 aqdstatic.com 原图地址）；直接 `<img>` + `referrerpolicy="no-referrer"` 可用，无需图片代理（迭代 4 优化项）。
- **封面直连规律（2026-10-18 实测补充）**：原始封面遵循 `https://cdn.aqdstatic.com:966/age/covers/<AID>.jpg`，无 Referer 校验，实测多样本 200（image/jpeg）；`week_list` 项无封面字段，插件据此**按 ID 构造封面**（缺失封面的番需前端 `onerror` 回退占位图）。

## 7. 对迭代 1 插件实现的落地建议

1. `manifest.capabilities: ["weekly","latest","search","detail","play"]`，`permissions.domains: ["agedm.io"]`，`config: [{ key: "apiBaseUrl", default: "https://api.agedm.io/v2/" }]`。
2. 响应包裹统一入口：`unwrap(json)` —— 有 `code` 字段则取 `data`，否则原样返回。
3. `getWeeklySchedule` ← `home-list.week_list`；`getLatestUpdates` ← `update?page&size`；`search` ← `search?query&page`；`getDetail` ← `detail/<AID>`；`resolvePlay` ← 返回 `{type:'page', url: https://m.agedm.io/#/play/<AID>/<l>/<e>}`。
4. 夹具：将本次实测响应（脱敏后）存入 `__fixtures__/`。
