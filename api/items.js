import { db } from '../lib/supabase.js'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

async function isAdmin(req) {
  const auth = req.headers.authorization
  if (!auth) return false
  const token = auth.replace('Bearer ', '')

  // Support both: legacy ADMIN_TOKEN and Feishu session token
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return true

  // Check session in DB
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

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await db
        .from('items')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data ?? [])
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  if (req.method === 'POST') {
    if (!(await isAdmin(req))) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const { name, url, sort_order = 0 } = req.body

      if (!name || !url) {
        return res.status(400).json({ error: 'Name and URL are required' })
      }

      const { data, error } = await db
        .from('items')
        .insert({ name, url, sort_order })
        .select()
        .single()

      if (error) return res.status(500).json({ error: error.message })
      return res.status(201).json(data)
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
