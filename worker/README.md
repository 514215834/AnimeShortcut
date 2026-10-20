# 自部署 CORS 代理（Cloudflare Worker）

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2F514215834%2FAnimeShortcut%2Ftree%2Fmain%2Fworker)

agedm 等数据源接口只对源站自己的域名开放跨域（见 [探测报告](../docs/探测报告-agedm.md) §4），浏览器从 GitHub Pages 直连会被 CORS 拦截。目录下的 `worker.js` 是一个只做转发的 Cloudflare Worker：

- 只转发**白名单域名**的 GET 请求（数据源 API、流地址解析器、播放流 CDN），防止被滥用；
- 响应统一加 `Access-Control-Allow-Origin: *`；
- 目标是 **m3u8 播放列表**时，自动把其中子播放列表/分片/密钥地址改写为经本 Worker 代理的绝对地址（站内播放的「经代理重试」依赖此能力）；
- 免费额度 10 万请求/天，个人使用足够（视频流量也计入，看长番可留意用量）。

## 部署方法 A：Dashboard 粘贴（无需装任何工具）

1. 注册/登录 [Cloudflare](https://dash.cloudflare.com/)，进入 **Workers & Pages → Create → Worker**。
2. 任意命名（如 `anime-shortcut-proxy`），点 Deploy 进入编辑器。
3. 把本目录 `worker.js` 的内容整段粘贴覆盖默认代码（**纯 JS 语法**，可直接粘贴），**Deploy**。
4. 记下分配的地址：`https://anime-shortcut-proxy.<你的子域>.workers.dev`。
5. 打开看板的 **设置 → 代理（CORS）**，粘贴该地址，保存并点「测试连通」。

## 部署方法 B：Wrangler CLI

```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

## 常见问题

- **测试连通失败**：确认 Worker 已部署（直接在浏览器打开 `https://你的Worker地址/?url=https%3A%2F%2Fapi.agedm.io%2Fv2%2Fupdate%3Fpage%3D1%26size%3D1` 应返回 JSON）。
- **源站换域名**：更新环境变量 `ALLOWED_DOMAINS` 白名单后重新部署，同时在看板设置里更新插件的接口地址。
- **接入新数据源插件**：把该插件 `permissions.domains` 声明的域名（及站内播放的流 CDN 域名）追加进环境变量 `ALLOWED_DOMAINS`——这是**部署配置**，不需要改任何代码。
- **站内播放**：主流线路（非凡/暴风/无尽）的流 CDN 允许跨域，hls.js 直连即可；直连失败时播放页会出现「经代理重试」，该路径要求你部署的是**最新版** `worker.js`（含 m3u8 改写）。
