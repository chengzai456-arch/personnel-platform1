import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')
const PORT = process.env.PORT || 3001

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

// Mock in-memory items (replace with Supabase in production)
let items = [
  { id: 1, name: '飞书文档', url: 'https://www.feishu.cn', sort_order: 0, created_at: new Date().toISOString() },
  { id: 2, name: '项目管理', url: 'https://project.example.com', sort_order: 1, created_at: new Date().toISOString() },
  { id: 3, name: '数据分析', url: 'https://data.example.com', sort_order: 2, created_at: new Date().toISOString() },
  { id: 4, name: '审批中心', url: 'https://approval.example.com', sort_order: 3, created_at: new Date().toISOString() },
  { id: 5, name: '日历', url: 'https://calendar.example.com', sort_order: 4, created_at: new Date().toISOString() },
]
let nextId = 6

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123'

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    return res.end()
  }

  // API routes
  if (pathname === '/api/items') {
    if (req.method === 'GET') {
      const data = items.sort((a, b) => a.sort_order - b.sort_order)
      return json(res, 200, data)
    }

    if (req.method === 'POST') {
      const auth = req.headers.authorization
      if (!auth || auth.replace('Bearer ', '') !== ADMIN_TOKEN) {
        return json(res, 401, { error: 'Unauthorized' })
      }

      const body = await parseBody(req)
      const { name, url: itemUrl, sort_order = 0 } = body

      if (!name || !itemUrl) {
        return json(res, 400, { error: 'Name and URL are required' })
      }

      const item = { id: nextId++, name, url: itemUrl, sort_order, created_at: new Date().toISOString() }
      items.push(item)
      return json(res, 201, item)
    }

    if (req.method === 'DELETE') {
      const auth = req.headers.authorization
      if (!auth || auth.replace('Bearer ', '') !== ADMIN_TOKEN) {
        return json(res, 401, { error: 'Unauthorized' })
      }

      const id = parseInt(url.searchParams.get('id'))
      if (!id) return json(res, 400, { error: 'Item ID is required' })

      const idx = items.findIndex(i => i.id === id)
      if (idx === -1) return json(res, 404, { error: 'Not found' })

      items.splice(idx, 1)
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
      return res.end()
    }

    return json(res, 405, { error: 'Method not allowed' })
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname)
  const ext = path.extname(filePath)

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      return res.end('Not found')
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Workbench dev server running at http://localhost:${PORT}`)
  console.log(`Admin token: ${ADMIN_TOKEN}`)
  console.log(`Items: ${items.length} defaults loaded`)
})
