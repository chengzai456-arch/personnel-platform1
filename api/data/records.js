import { db } from '../../lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { worker_type, session_id, page = '1', page_size = '50', search } = req.query
    if (!worker_type) return res.status(400).json({ error: 'worker_type is required' })

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(page_size, 10) || 50))
    const offset = (pageNum - 1) * pageSize

    // Build query
    let countQuery = db
      .from('worker_records')
      .select('id', { count: 'exact', head: true })
      .eq('worker_type', worker_type)

    let dataQuery = db
      .from('worker_records')
      .select('*')
      .eq('worker_type', worker_type)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (session_id) {
      countQuery = countQuery.eq('upload_session_id', session_id)
      dataQuery = dataQuery.eq('upload_session_id', session_id)
    }

    if (search && search.trim()) {
      const term = search.trim()
      countQuery = countQuery.or(`工号.ilike.%${term}%,部门.ilike.%${term}%,班次名称.ilike.%${term}%`)
      dataQuery = dataQuery.or(`工号.ilike.%${term}%,部门.ilike.%${term}%,班次名称.ilike.%${term}%`)
    }

    const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery])
    if (error) return res.status(500).json({ error: error.message })

    const total = count ?? 0

    return res.status(200).json({
      records: data ?? [],
      pagination: {
        page: pageNum,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
