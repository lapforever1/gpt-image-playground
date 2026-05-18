// Vercel Serverless Function — 代理图片生成请求到 apimart.ai
// API Key 从环境变量 APIMART_API_KEY 读取，不会暴露给前端
// 支持自动上传 data URL 格式的参考图和遮罩图到 Vercel Blob

import { uploadDataUrls, uploadDataUrl } from '../../lib/blob-storage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not set' })
  }

  try {
    const body = req.body || {}

    // 处理参考图：将 data URL 上传到 Vercel Blob 获取公网 URL
    let imageUrls = body.image_urls
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      imageUrls = await uploadDataUrls(imageUrls)
    }

    // 处理遮罩图
    let maskUrl = body.mask_url
    if (maskUrl) {
      maskUrl = await uploadDataUrl(maskUrl)
    }

    // 构建转发 body
    const forwardBody = { ...body }
    if (imageUrls) forwardBody.image_urls = imageUrls
    if (maskUrl) forwardBody.mask_url = maskUrl

    const response = await fetch('https://api.apimart.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwardBody),
    })

    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: 'Proxy request failed', message })
  }
}
