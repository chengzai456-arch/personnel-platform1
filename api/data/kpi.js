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

    // Compute KPIs
    const total = records.length

    // Attendance rate: 缺卡数 == '0' or 0
    const attended = records.filter(r => {
      const v = r['缺卡数']
      return v === '0' || v === 0 || v === '' || v === null || v === undefined
    }).length

    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0

    // Average daily hours
    const totalHours = records.reduce((sum, r) => {
      const h = parseFloat(r['每日总工时']) || 0
      return sum + h
    }, 0)
    const avgHours = total > 0 ? Math.round((totalHours / total) * 100) / 100 : 0

    // OT rate (% over 8h)
    const over8h = records.filter(r => r['是否日超8H'] === '是').length
    const over8hRate = total > 0 ? Math.round((over8h / total) * 100) : 0

    // Average OT hours
    const totalOT = records.reduce((sum, r) => {
      const ot = parseFloat(r['本周加班工时']) || 0
      return sum + ot
    }, 0)
    const avgOT = total > 0 ? Math.round((totalOT / total) * 100) / 100 : 0

    // Department breakdown
    const deptMap = {}
    for (const r of records) {
      const dept = r['部门'] || '未知'
      if (!deptMap[dept]) {
        deptMap[dept] = { total: 0, attended: 0, over8h: 0, totalHours: 0, totalOT: 0, correctCount: 0 }
      }
      deptMap[dept].total++
      const miss = r['缺卡数']
      if (miss === '0' || miss === 0 || miss === '' || miss === null || miss === undefined) {
        deptMap[dept].attended++
      }
      if (r['是否日超8H'] === '是') deptMap[dept].over8h++
      deptMap[dept].totalHours += parseFloat(r['每日总工时']) || 0
      deptMap[dept].totalOT += parseFloat(r['本周加班工时']) || 0
      if (r['是否排班正确'] === '正确') deptMap[dept].correctCount++
    }

    const departments = Object.entries(deptMap).map(([name, d]) => ({
      name,
      total: d.total,
      attendanceRate: Math.round((d.attended / d.total) * 100),
      over8hRate: Math.round((d.over8h / d.total) * 100),
      avgHours: Math.round((d.totalHours / d.total) * 100) / 100,
      avgOT: Math.round((d.totalOT / d.total) * 100) / 100,
      complianceRate: Math.round((d.correctCount / d.total) * 100),
      correctCount: d.correctCount,
    }))

    return res.status(200).json({
      total,
      attended,
      attendanceRate,
      avgHours,
      avgOT,
      over8h,
      over8hRate,
      totalOvertimeHours: Math.round(totalOT * 100) / 100,
      departments,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
