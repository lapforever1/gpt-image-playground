// Vercel Serverless Function — 代理任务查询请求到 apimart.ai
// API Key 从环境变量 APIMART_API_KEY 读取，不会暴露给前端

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key not set' })
  }

  const { taskId } = req.query
  if (!taskId) {
    return res.status(400).json({ error: 'Missing taskId' })
  }

  try {
    const response = await fetch(`https://api.apimart.ai/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ error: 'Proxy request failed', message })
  }
}
