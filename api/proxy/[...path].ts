/**
 * Vercel Edge Function — API 代理
 *
 * 接收来自前端的 /api-proxy/* 请求，转发到真实的 API 服务商，
 * 并从服务端环境变量注入 API Key（前端永远不可见）。
 *
 * 需要的 Vercel 环境变量（非 VITE_ 前缀，仅服务端可读）：
 *   API_PROXY_TARGET  — 真实 API 地址，例如 https://api.apimart.ai
 *   API_PROXY_KEY     — API Key（Bearer Token）
 *
 * 路由规则：
 *   /api-proxy/v1/*          → API_PROXY_TARGET/v1/*
 *   /api-proxy/img/<host>/<path> → https://<host>/<path>  （图片 CORS 代理）
 */

const IMAGE_PROXY_PREFIX = '/img/'

function getEnv(key: string): string {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key]
      if (val) return val
    }
  } catch { /* process.env 不可用时忽略 */ }

  try {
    const val = (globalThis as Record<string, unknown>)[key]
    if (typeof val === 'string' && val) return val
  } catch { /* 忽略 */ }

  return ''
}

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const url = new URL(request.url)
  const fullPath = url.pathname.replace(/^\/api\/proxy/, '') || '/'

  const target = getEnv('API_PROXY_TARGET')
  const apiKey = getEnv('API_PROXY_KEY')

  if (!target || !apiKey) {
    return new Response(
      JSON.stringify({
        error: 'API proxy is not configured on the server.',
        detail: !target ? 'Missing API_PROXY_TARGET' : 'Missing API_PROXY_KEY',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }

  // 图片代理：/api-proxy/img/<host>/<path> → https://<host>/<path>
  if (fullPath.startsWith(IMAGE_PROXY_PREFIX)) {
    const rest = fullPath.slice(IMAGE_PROXY_PREFIX.length)
    const firstSlash = rest.indexOf('/')
    if (firstSlash <= 0) {
      return new Response('Invalid image proxy path', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
    const host = rest.slice(0, firstSlash)
    const path = rest.slice(firstSlash)
    const imageUrl = `https://${host}${path}${url.search}`

    try {
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        return new Response('Image fetch failed', { status: imageResponse.status })
      }
      const headers = new Headers()
      const contentType = imageResponse.headers.get('content-type') ?? 'image/png'
      headers.set('content-type', contentType)
      headers.set('cache-control', 'public, max-age=86400')
      headers.set('access-control-allow-origin', '*')
      return new Response(imageResponse.body, { headers })
    } catch {
      return new Response('Image proxy error', {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
  }

  // API 代理：/api-proxy/v1/... → API_PROXY_TARGET/v1/...
  const upstreamUrl = `${target.replace(/\/+$/, '')}${fullPath}${url.search}`

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('authorization', `Bearer ${apiKey}`)

  // 确保有 Content-Type（非 GET/HEAD 请求）
  if (!headers.has('content-type') && request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('content-type', 'application/json')
  }

  try {
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    })

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('set-cookie')
    responseHeaders.set('access-control-allow-origin', '*')

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Upstream API unreachable.',
        detail: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
}
