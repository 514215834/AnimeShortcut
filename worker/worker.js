/**
 * 动漫更新看板 — 自部署 CORS 代理（Cloudflare Worker）
 * 部署方法见本目录 README.md。免费额度（10 万请求/天）对个人使用绰绰有余。
 *
 * 用法：{你的Worker地址}?url=<encodeURIComponent(目标API地址)>
 * 安全：只转发白名单域名的 GET 请求，防止被第三方滥用。
 *
 * m3u8 改写（站内播放回退路径，迭代 3-4）：目标为 m3u8 播放列表时，把其中相对/绝对
 * 子地址（子播放列表、分片、密钥）改写为经本 Worker 代理的绝对地址，hls.js 即可全程走代理。
 *
 * 可选：在 Worker 的 Settings → Variables 里添加 ALLOWED_DOMAINS（逗号分隔），
 * 不配置时默认放行下方 DEFAULT_DOMAINS。
 *
 * 注意：本文件必须是纯 JavaScript（在线编辑器不支持 TS 语法）。
 */

/**
 * 部署配置（非代码逻辑）：允许转发的目标域名白名单。
 * 优先读环境变量 ALLOWED_DOMAINS（Worker Settings → Variables，逗号分隔）；
 * 未配置时使用下面的默认值。接入新数据源插件时，把其 manifest.permissions.domains
 * （及站内播放所需的流 CDN 域名）追加进环境变量即可，无需改代码。
 */
const DEFAULT_DOMAINS =
  'agedm.io,wuzhoupai.com,yinhuadm.cc,ffzy-plays.com,fengbao13.com,fengbao14.com,ppqrrs.com,lzcdn31.com'

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 })
    }

    const target = new URL(request.url).searchParams.get('url')
    if (!target) return new Response('missing ?url=', { status: 400 })

    let host
    try {
      host = new URL(target).hostname
    } catch {
      return new Response('invalid url', { status: 400 })
    }

    const allowed = (env && env.ALLOWED_DOMAINS ? env.ALLOWED_DOMAINS : DEFAULT_DOMAINS)
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
    if (!allowed.some((d) => host === d || host.endsWith('.' + d))) {
      return new Response('host not allowed', { status: 403 })
    }

    const resp = await fetch(target, {
      method: request.method,
      headers: {
        'User-Agent': request.headers.get('user-agent') ?? '',
        Accept: request.headers.get('accept') ?? '*/*',
      },
      redirect: 'follow',
    })

    const headers = new Headers(resp.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    // 删除可能导致浏览器解析问题的头
    headers.delete('content-encoding')
    headers.delete('content-length')

    // m3u8 播放列表：改写内部地址为经本 Worker 代理的绝对地址（分段/密钥同样代理）
    const contentType = headers.get('content-type') || ''
    if (/mpegurl/i.test(contentType) || /\.m3u8(\?|$)/i.test(target)) {
      const text = await resp.text()
      const base = resp.url || target
      return new Response(rewriteM3u8(text, base, request.url), {
        status: resp.status,
        headers,
      })
    }

    return new Response(resp.body, { status: resp.status, headers })
  },
}

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
        // #EXT-X-KEY:URI="..." / #EXT-X-MAP:URI="..." 等带引号子地址
        return line.replace(/URI="([^"]+)"/g, (_m, u) => 'URI="' + proxify(u, base, workerUrl) + '"')
      }
      // 非注释行 = 子播放列表或分片地址
      return proxify(t, base, workerUrl)
    })
    .join('\n')
}
