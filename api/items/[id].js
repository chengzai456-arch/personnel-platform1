import { db } from '../lib/supabase.js'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

async function isAdmin(req) {
  const auth = req.headers.authorization
  if (!auth) return false
  const token = auth.replace('Bearer ', '')

  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return true

  try {
    const { data, error } = await db
      .from('sessions')
      .select('feishu_open_id')
      .eq('id', token)
      .gte('expires_at', new Date().toISOString())
      .single()
    return !!data
  } catch {
    return false
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method === 'DELETE') {
    if (!(await isAdmin(req))) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const id = req.query.id

    if (!id) {
      return res.status(400).json({ error: 'Item ID is required' })
    }

    try {
      const { error } = await db
        .from('items')
        .delete()
        .eq('id', id)

      if (error) return res.status(500).json({ error: error.message })
      return res.status(204).end()
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
