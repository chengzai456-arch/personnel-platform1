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

    // --- OT distribution buckets (本周加班工时) ---
    const buckets = { '0h': 0, '0-2h': 0, '2-4h': 0, '4-6h': 0, '6-8h': 0, '8h+': 0 }
    for (const r of records) {
      const ot = parseFloat(r['本周加班工时']) || 0
      if (ot === 0) buckets['0h']++
      else if (ot <= 2) buckets['0-2h']++
      else if (ot <= 4) buckets['2-4h']++
      else if (ot <= 6) buckets['4-6h']++
      else if (ot <= 8) buckets['6-8h']++
      else buckets['8h+']++
    }

    const otDistribution = Object.entries(buckets).map(([bucket, count]) => ({
      bucket,
      count,
      rate: records.length > 0 ? Math.round((count / records.length) * 100) : 0,
    }))

    // --- Workers over 8h ---
    const over8hRecords = records.filter(r => r['是否日超8H'] === '是')
    const over8hTotalOT = over8hRecords.reduce((s, r) => s + (parseFloat(r['本周加班工时']) || 0), 0)
    const over8hAvgOT = over8hRecords.length > 0
      ? Math.round((over8hTotalOT / over8hRecords.length) * 100) / 100
      : 0

    // --- OT by department ---
    const deptOTMap = {}
    for (const r of records) {
      const dept = r['部门'] || '未知'
      if (!deptOTMap[dept]) deptOTMap[dept] = { total: 0, totalOT: 0, over8hCount: 0 }
      deptOTMap[dept].total++
      deptOTMap[dept].totalOT += parseFloat(r['本周加班工时']) || 0
      if (r['是否日超8H'] === '是') deptOTMap[dept].over8hCount++
    }

    const byDepartment = Object.entries(deptOTMap)
      .map(([name, d]) => ({
        name,
        totalOT: Math.round(d.totalOT * 100) / 100,
        avgOT: Math.round((d.totalOT / d.total) * 100) / 100,
        over8hCount: d.over8hCount,
        over8hRate: Math.round((d.over8hCount / d.total) * 100),
      }))
      .sort((a, b) => b.totalOT - a.totalOT)

    // --- Weekly OT summary ---
    const totalThisWeek = records.reduce((s, r) => s + (parseFloat(r['本周加班工时']) || 0), 0)
    const totalLastWeek = records.reduce((s, r) => s + (parseFloat(r['上周加班工时']) || 0), 0)
    const totalBiWeek = records.reduce((s, r) => s + (parseFloat(r['双周加班工时']) || 0), 0)

    return res.status(200).json({
      otDistribution,
      totalWorkers: records.length,
      over8hCount: over8hRecords.length,
      over8hRate: records.length > 0 ? Math.round((over8hRecords.length / records.length) * 100) : 0,
      over8hAvgOT,
      totalThisWeek: Math.round(totalThisWeek * 100) / 100,
      totalLastWeek: Math.round(totalLastWeek * 100) / 100,
      totalBiWeek: Math.round(totalBiWeek * 100) / 100,
      weeklyBreakdown: [
        { week: '上周', hours: Math.round(totalLastWeek * 100) / 100 },
        { week: '本周', hours: Math.round(totalThisWeek * 100) / 100 },
        { week: '双周', hours: Math.round(totalBiWeek * 100) / 100 },
      ],
      byDepartment,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
