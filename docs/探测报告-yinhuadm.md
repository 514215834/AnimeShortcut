# 数据源探测报告 — yinhuadm（樱花动漫）

| 项目 | 内容 |
| --- | --- |
| 探测日期 | 2026-10-19 |
| 探测方式 | 真实网络 curl/node 实测（页面结构分析、maccms JSON API 直调、流 CDN CORS 实测） |
| 结论 | ✅ **站点为苹果CMS（maccms）架构，标准 JSON API 完全开放（列表/搜索/详情/直链 m3u8），配合周表 HTML 解析可实现全能力插件；HTML/JSON 均无 CORS 头 → 须经代理访问；播放为 m3u8 直链，可站内播放** |
| 分发形态 | **官方插件包**（不内置）：源码在 `src/plugins/packages/yinhuadm/`，`npm run pack:plugins` 产出 `public/plugins/yinhuadm.asplugin.json` 随站点发布；用户在设置页「允许导入外部插件」→ 导入该地址装载（Worker 沙箱） |
| 关联 | [数据源插件接口规范](./数据源插件接口规范.md)、[功能迭代计划](./功能迭代计划.md) 3-2、[探测报告-agedm](./探测报告-agedm.md) |

---

## 1. 结论摘要

| 探测项 | 结果 |
| --- | --- |
| 站点可达性 | ✅ `www.yinhuadm.cc` HTTP 200（裸域 yinhuadm.cc 不可达）；页面为服务端渲染 HTML + jQuery（maccms 模板 mxpro） |
| JSON API | ✅ **`https://www.yinhuadm.cc/api.php/provide/vod/`**（maccms 标准数据接口，无需鉴权；列表/详情/搜索均可用） |
| 周更表 | ✅ `/label/week.html`（7 个 tab 面板，DOM 顺序 = 周一~周日）；详情接口另有 `vod_weekday`（"一"~"日"）交叉验证 |
| 最新更新 | ✅ `ac=detail&pg=N` 按更新时间降序，20 条/页，total 13996 / pagecount 700 |
| 搜索 | ✅ `ac=detail&wd=关键词&pg=N`（标题模糊匹配；空结果 `code:1, list:[]` 不报错） |
| 剧集与流地址 | ✅ 详情 `vod_play_url` 直接给出**全部线路的 m3u8 直链**（无需 agedm 那样的解析器） |
| 站内播放 | ✅ `vod_play_url` 即 m3u8，播放器直连；流 CDN（fengbao13/lzcdn31 等）实测 `ACAO: *` |
| CORS 直连 | ❌ HTML 与 API 响应均无 `Access-Control-Allow-Origin` → 浏览器须走代理链（Worker 白名单加 `yinhuadm.cc`） |
| 编码 | ✅ 全站 UTF-8（content-type: text/html;charset=utf8） |
| HTTPS | ✅ 全链路 https |

## 2. 数据接口清单（实测）

### 2.1 JSON API（基址 `https://www.yinhuadm.cc/api.php/provide/vod/`）

| 端点 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- |
| `?ac=detail&pg=N` | `pg`（1 起） | `{code:1, page, limit:20, pagecount:700, total:13996, list: Vod[]}`（**含 vod_pic**，按 vod_time 降序） | 最新更新流 |
| `?ac=detail&wd=kw&pg=N` | `wd` 关键词、`pg` | 同上结构（list 为命中项，含全部字段） | 搜索 |
| `?ac=detail&ids=id[,id2]` | `ids` 番剧 id | 同上（通常 1 项） | 详情（含剧集与 m3u8） |
| `?ac=list&pg=N` | `pg` | 同上但**字段精简（无 vod_pic）** | 不采用 |

**空结果/无效 ids**：返回 `code:1, total:0, list:[]`（不报错，插件按空结果处理）。

`Vod` 关键字段（实测 29558）：

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| `vod_id` | `29558` | 番剧 id（`animeId`） |
| `vod_name` | `七龙珠超：比鲁斯` | 标题 |
| `vod_pic` | `upload/vod/20261012-1/xxx.webp` | **相对路径**，需拼 `https://www.yinhuadm.cc/` |
| `vod_remarks` | `更新至第02集` | 更新状态提示（→ `latestEpisodeTitle`） |
| `vod_time` | `2026-10-19 20:36:04` | 最后更新时间（站点本地 UTC+8，无时区标注） |
| `vod_class` | `日韩动漫,情,动作,动画` | 分类标签（→ `genres`） |
| `vod_area` / `vod_year` | `日本` / `2026` | 地区/年份（→ `region`） |
| `vod_content` | 纯文本（个别含 HTML） | 简介（→ `description`，须剥标签） |
| `vod_weekday` | `一`（周更番）或空 | 更新档期（周一~周日 → 1~6、日→0） |
| `vod_isend` / `vod_status` | `0/1` | 1=完结 / 1=连载（→ `status`） |
| `vod_play_from` | `bfzym3u8$$$lzm3u8$$$ffm3u8` | 线路代码，`$$$` 分隔，与 `vod_play_url` 顺序一致 |
| `vod_play_url` | `第1集$https://...index.m3u8#第2集$...$$$第01集$...` | **剧集直链**：线路以 `$$$` 分隔，集以 `#` 分隔，集名与 URL 以 `$` 分隔 |

### 2.2 HTML 页面（仅需周表）

| 页面 | 结构 | 用途 |
| --- | --- | --- |
| `/label/week.html` | 7 个 `div.module-main.tab-list` 面板，**DOM 顺序 = 周一~周日**（与 tab 标签一致）；面板内每番一个 `a.module-poster-item`（`href=/v/<id>.html`、`title`=番名、`.module-item-note`=更新至第N集、`img[data-original]`=封面） | 周更表（分日分组） |

### 2.3 播放页（备用，仅用于跳转）

- 详情页剧集链接形如 `/p/<vod_id>-<线路号>-<集号>.html`，**线路号/集号均为 1-based**。
- 播放页内 `player_aaaa` 配置的 `url` 为**自定义加密串**（`encrypt:0` 但非 base64，需站点 JS 私有算法解码）→ 不走解密路线；站内播放直接用 API 的 `vod_play_url` 明文 m3u8，跳转则用 `/p/...` 页面 URL。
- 实测线路映射（/v/29515 来自远方）：线路1=Bfeng（bfzym3u8/暴风）、线路2=Diff、线路3=Laoz —— **详情页 tab 的 DOM 顺序（线路名）与面板（剧集链接中的线路号）一致，可按序 zip**；API `vod_play_from` 与 `/p/` 线路号顺序一致。

## 3. 字段映射 → 插件统一模型

| 统一模型字段 | yinhuadm 来源 |
| --- | --- |
| `animeId` | `vod_id` |
| `title` | `vod_name` |
| `cover` | `vod_pic`（相对路径 → `utils.absUrl`；`http:` 需升级 https——实测均为相对路径或 https） |
| `latestEpisodeTitle` | `vod_remarks`（"更新至第02集"）/ 面板 `.module-item-note` |
| `updateTime` | `vod_time` 按站点本地 UTC+8 解析（`Date.parse(s + '+08:00')`） |
| `weekday` | 周表：面板序号 p（0 起，周一~周日）→ `(p+1) % 7`；`vod_weekday`："日"→0、"一"→1 … "六"→6 |
| `playPageUrl` | `https://www.yinhuadm.cc/v/<id>.html`；剧集级 `/p/<id>-<l+1>-<e+1>.html` |
| `description` | `vod_content` 剥 HTML 标签 + 实体解码 |
| `genres` | `vod_class.split(',')` |
| `region` | `vod_area` / `vod_year`（与 agedm 同格式 "日本 / 2026"） |
| `status` | `vod_isend==='1'` 或 remarks 含"完结"→ `finished`；`vod_status==='1'` → `ongoing`；否则 `unknown` |
| `episodes[].episodeId` | `<线路序号>:<集序号>`（均 0-based，与 agedm 同形态） |
| `episodes[].line` | `vod_play_from` 代码 → 常见源友好名（bfzym3u8→暴风、lzm3u8→量子、ffm3u8→非凡、wjm3u8→无尽、xlm3u8→星辰、zjm3u8→加强、kkm3u8→快看等，未知回退原码） |
| `resolvePlay` | `vod_play_url` 第 l 线路第 e 集 URL（m3u8 直链）→ `{type:'stream', url, referer: siteUrl}`；缺集/无直链 → `{type:'page', url: /p/页面}` |

## 4. CORS 与流媒体实测

```
# HTML/API（Origin: https://asus.github.io）
→ HTTP 200，无 Access-Control-Allow-Origin → 浏览器直连被拦，须经代理（与 agedm 同策略）

# 流 CDN（带 Origin 实测）
fengbao13.com   master 200 ACAO:*，子清单 200 ACAO:*，分片实测一次 400（疑似该路径防直链，浏览器 E2E 复验）
v.lzcdn31.com   master/子清单/分片 200 ACAO:*（分片 video/mp2t）
```

- 主路径 hls.js 直连（CORS 开放）；失败时走「经代理重试」（Worker m3u8 改写，见架构文档 §4.2.2 与 worker/worker.js）。
- Worker 白名单需追加：`yinhuadm.cc`（API/HTML）、`fengbao14.com`（v.fengbao14.com 已在 agedm 用例出现）。

## 5. 风险与备注

- **周表面板顺序依赖**：周一~周日的分组靠面板 DOM 顺序（无 id/标记），站点模板改版（面板顺序调整）会使周表错位——夹具测试可快速定位；详情接口 `vod_weekday` 可作交叉校验但不逐番取（请求预算）。
- **maccms 通用性**：本插件按 maccms 标准接口实现，同架构站点（苹果CMS）可低成本复用为更多内置插件。
- **线路名映射**：`vod_play_from` 代码 → 友好名为插件内置映射表，未知代码原样展示（不影响功能）。
- **礼貌抓取**：全部能力单次调用 1 个请求；缓存 TTL 沿用宿主缺省（weekly/latest 600s、detail 3600s、search/play 0s）。
- **夹具**：`__fixtures__/` 存真实响应样本（week 页裁剪 script/head 静态资源；API JSON 裁剪至代表性条目并保留真实信封数值）。
