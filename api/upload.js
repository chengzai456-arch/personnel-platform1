import { db } from '../../lib/supabase.js'
import XLSX from 'xlsx'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

async function isAdmin(req) {
  const auth = req.headers.authorization
  if (!auth) return false
  const token = auth.replace('Bearer ', '')
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return true
  try {
    const { data } = await db
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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth check
  if (!(await isAdmin(req))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { file_base64, worker_type } = req.body

    if (!file_base64 || !worker_type) {
      return res.status(400).json({ error: 'Missing file_base64 or worker_type' })
    }

    if (!['劳务工', '正式工'].includes(worker_type)) {
      return res.status(400).json({ error: 'worker_type must be 劳务工 or 正式工' })
    }

    // Decode base64
    const buf = Buffer.from(file_base64, 'base64')

    // Parse Excel
    const workbook = XLSX.read(buf, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return res.status(400).json({ error: 'Excel file has no sheets' })
    }

    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' })
    }

    // Get uploaded_by from session or token
    const auth = req.headers.authorization?.replace('Bearer ', '')
    let uploadedBy = '管理员'
    try {
      const { data: session } = await db
        .from('sessions')
        .select('name')
        .eq('id', auth)
        .single()
      if (session?.name) uploadedBy = session.name
    } catch { /* use default */ }

    // Create upload session
    const { data: sessionRec, error: sessionErr } = await db
      .from('upload_sessions')
      .insert({
        worker_type,
        uploaded_by: uploadedBy,
        record_count: rows.length,
      })
      .select()
      .single()

    if (sessionErr) {
      return res.status(500).json({ error: 'Failed to create upload session: ' + sessionErr.message })
    }

    const sessionId = sessionRec.id

    // Known column mapping (Chinese -> Chinese, as-is)
    const knownColumns = [
      '工号', '部门', '五级部门', '班次名称', '休息开始', '休息结束',
      '首打卡时间', '末打卡时间', '班次内打卡次数', 'HUB标记',
      '是否排班正确', '每日总工时', '是否日超8H', '是否排班',
      '标准打卡数', '缺卡数', '补签数', '本周加班工时', '上周加班工时',
      '双周加班工时', '居家办公合计（审批中）', '备注',
    ]

    // Prepare records for batch insert
    const records = rows.map(row => {
      const rec = {
        upload_session_id: sessionId,
        worker_type,
      }

      const extraFields = {}

      for (const key of Object.keys(row)) {
        if (knownColumns.includes(key)) {
          const val = row[key]
          if (['每日总工时', '本周加班工时', '上周加班工时', '双周加班工时'].includes(key)) {
            rec[key] = parseFloat(val) || 0
          } else if (key === '补签数') {
            rec[key] = parseInt(val, 10) || 0
          } else {
            rec[key] = String(val)
          }
        } else {
          extraFields[key] = row[key]
        }
      }

      if (Object.keys(extraFields).length > 0) {
        rec.raw_data = extraFields
      }

      return rec
    })

    // Batch insert (chunked to avoid Vercel timeout)
    const CHUNK_SIZE = 500
    let inserted = 0
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE)
      const { error: insertErr } = await db.from('worker_records').insert(chunk)
      if (insertErr) {
        // Cleanup on failure
        await db.from('upload_sessions').delete().eq('id', sessionId)
        return res.status(500).json({ error: 'Insert failed at row ' + i + ': ' + insertErr.message })
      }
      inserted += chunk.length
    }

    return res.status(200).json({
      success: true,
      session_id: sessionId,
      record_count: inserted,
      columns: Object.keys(rows[0]),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
