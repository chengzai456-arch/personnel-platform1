import { db } from '../../lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { worker_type, session_id } = req.query
    if (!worker_type) return res.status(400).json({ error: 'worker_type is required' })

    let query = db.from('worker_records').select('*').eq('worker_type', worker_type)
    if (session_id) {
      query = query.eq('upload_session_id', session_id)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const records = data ?? []

    // --- Compliance by department ---
    const deptMap = {}
    for (const r of records) {
      const dept = r['部门'] || '未知'
      if (!deptMap[dept]) deptMap[dept] = { total: 0, correct: 0, scheduled: 0 }
      deptMap[dept].total++
      if (r['是否排班正确'] === '正确') deptMap[dept].correct++
      if (r['是否排班'] === '是') deptMap[dept].scheduled++
    }

    const byDepartment = Object.entries(deptMap)
      .map(([name, d]) => ({
        name,
        total: d.total,
        correct: d.correct,
        complianceRate: Math.round((d.correct / d.total) * 100),
        scheduledRate: Math.round((d.scheduled / d.total) * 100),
        scheduledCount: d.scheduled,
      }))
      .sort((a, b) => b.total - a.total)

    // --- Compliance by shift ---
    const shiftMap = {}
    for (const r of records) {
      const shift = r['班次名称'] || '(空)'
      if (!shiftMap[shift]) shiftMap[shift] = { total: 0, correct: 0 }
      shiftMap[shift].total++
      if (r['是否排班正确'] === '正确') shiftMap[shift].correct++
    }

    const byShift = Object.entries(shiftMap)
      .map(([name, d]) => ({
        name,
        total: d.total,
        correct: d.correct,
        complianceRate: Math.round((d.correct / d.total) * 100),
      }))
      .sort((a, b) => b.total - a.total)

    return res.status(200).json({ byDepartment, byShift })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
