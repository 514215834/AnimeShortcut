/**
 * 本地开发用流媒体/接口代理（与 worker/worker.js 行为一致的白名单转发 + m3u8 改写）。
 * 用途：本地端到端验证站内播放的「经代理重试」路径，无需部署 Cloudflare Worker。
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/dev-proxy.mjs [port]   # 默认 8799
 *   （agedm 证书链 node 无法验证，与 vite.config.ts 的 dev 代理同一处理；仅限本地开发）
 *   看板设置 → 代理（CORS）填 http://localhost:8799
 */
import http from 'node:http'

const PORT = Number(process.argv[2] || 8799)

const ALLOWED = [
  'agedm.io',
  'wuzhoupai.com',
  'yinhuadm.cc',
  'ffzy-plays.com',
  'fengbao13.com',
  'fengbao14.com',
  'ppqrrs.com',
  'lzcdn31.com',
]

function proxify(url, base, workerUrl) {
  try {
    const abs = new URL(url, base).href
    return workerUrl + (workerUrl.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(abs)
  } catch {
    return url
  }
}

function rewriteM3u8(text, base, workerUrl) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, u) => 'URI="' + proxify(u, base, workerUrl) + '"')
      }
      return proxify(t, base, workerUrl)
    })
    .join('\n')
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const target = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('url')
  if (!target) {
    res.writeHead(400).end('missing ?url=')
    return
  }
  let host = ''
  try {
    host = new URL(target).hostname
  } catch {
    res.writeHead(400).end('invalid url')
    return
  }
  if (!ALLOWED.some((d) => host === d || host.endsWith('.' + d))) {
    res.writeHead(403).end('host not allowed')
    return
  }
  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': req.headers['user-agent'] ?? '', Accept: '*/*' },
      redirect: 'follow',
    })
    const headers = Object.fromEntries(upstream.headers)
    headers['access-control-allow-origin'] = '*'
    delete headers['content-encoding']
    delete headers['content-length']
    const ct = headers['content-type'] ?? ''
    if (/mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(target)) {
      const base = upstream.url || target
      const text = rewriteM3u8(await upstream.text(), base, `http://localhost:${PORT}`)
      res.writeHead(upstream.status, headers).end(text)
      return
    }
    res.writeHead(upstream.status, headers)
    const body = upstream.body
    if (body) for await (const chunk of body) res.write(chunk)
    res.end()
  } catch (e) {
    res.writeHead(502).end('proxy error: ' + String(e))
  }
})

server.listen(PORT, () => console.log(`dev-proxy listening on http://localhost:${PORT}`))
