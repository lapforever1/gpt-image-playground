// 将 data URL 上传到 Vercel Blob，返回可公开访问的 URL
// 需要设置环境变量 BLOB_READ_WRITE_TOKEN

import { put } from '@vercel/blob'

/**
 * 将 data URL 数组上传到 Vercel Blob，返回公网 URL 数组
 * 如果发现非 data URL，直接原样返回
 */
export async function uploadDataUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return urls

  const results = await Promise.all(
    urls.map(async (url) => {
      if (typeof url !== 'string' || !url.startsWith('data:')) return url

      const matches = url.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) return url

      const mimeType = matches[1]
      const base64Data = matches[2]
      const buffer = Buffer.from(base64Data, 'base64')
      const ext = mimeType.split('/')[1] || 'png'
      const filename = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

      try {
        const blob = await put(filename, buffer, {
          access: 'public',
          addRandomSuffix: true,
        })
        return blob.url
      } catch (err) {
        console.error('Blob upload failed:', err)
        throw new Error('图片上传失败，请稍后重试')
      }
    }),
  )

  return results
}

/**
 * 将单张 data URL 上传到 Vercel Blob，返回公网 URL
 */
export async function uploadDataUrl(url) {
  if (!url || !url.startsWith('data:')) return url
  const urls = await uploadDataUrls([url])
  return urls[0] || url
}
