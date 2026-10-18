/**
 * 动漫更新看板 — 自部署 CORS 代理（Cloudflare Worker）
 * 部署方法见本目录 README.md。免费额度（10 万请求/天）对个人使用绰绰有余。
 *
 * 用法：{你的Worker地址}?url=<encodeURIComponent(目标API地址)>
 * 安全：只转发白名单域名的 GET 请求，防止被第三方滥用。
 */

const ALLOWED_DOMAINS = ['agedm.io']
// 新增数据源插件后，把其域名加入白名单（或改为从环境变量读取）：
// const ALLOWED_DOMAINS = (env.ALLOWED_DOMAINS ?? 'agedm.io').split(',')

export default {
  async fetch(request: Request): Promise<Response> {
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

    let host: string
    try {
      host = new URL(target).hostname
    } catch {
      return new Response('invalid url', { status: 400 })
    }
    if (!ALLOWED_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) {
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
    return new Response(resp.body, { status: resp.status, headers })
  },
}
