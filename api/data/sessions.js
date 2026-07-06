import { db } from '../../lib/supabase.js'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const workerType = req.query.worker_type
    let query = db
      .from('upload_sessions')
      .select('*')
      .order('created_at', { ascending: false })

    if (workerType) {
      query = query.eq('worker_type', workerType)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json(data ?? [])
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
