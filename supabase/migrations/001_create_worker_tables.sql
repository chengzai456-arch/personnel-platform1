-- ===================================================
-- Migration: Create worker data tables for dashboard
-- ===================================================

-- 1. Upload sessions tracking
CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT NOT NULL,
  uploaded_by TEXT,
  record_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Worker data records (matches final_data.xlsx columns from Python scripts)
CREATE TABLE IF NOT EXISTS worker_records (
  id BIGSERIAL PRIMARY KEY,
  upload_session_id UUID REFERENCES upload_sessions(id) ON DELETE CASCADE,
  worker_type TEXT NOT NULL,

  -- Core columns from clean_data + add_metrics output
  "工号" TEXT,
  "部门" TEXT,
  "五级部门" TEXT,
  "班次名称" TEXT,
  "休息开始" TEXT,
  "休息结束" TEXT,
  "首打卡时间" TEXT,
  "末打卡时间" TEXT,
  "班次内打卡次数" TEXT,
  "HUB标记" TEXT,
  "是否排班正确" TEXT,
  "每日总工时" NUMERIC(8,2),
  "是否日超8H" TEXT,
  "是否排班" TEXT,
  "标准打卡数" TEXT,
  "缺卡数" TEXT,
  "补签数" INTEGER DEFAULT 0,
  "本周加班工时" NUMERIC(8,2),
  "上周加班工时" NUMERIC(8,2),
  "双周加班工时" NUMERIC(8,2),
  "居家办公合计（审批中）" TEXT,
  "备注" TEXT,

  -- Catch-all for any extra columns
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_worker_records_worker_type ON worker_records(worker_type);
CREATE INDEX IF NOT EXISTS idx_worker_records_dept ON worker_records("部门");
CREATE INDEX IF NOT EXISTS idx_worker_records_工号 ON worker_records("工号");
CREATE INDEX IF NOT EXISTS idx_worker_records_session ON worker_records(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_worker_records_created ON worker_records(created_at DESC);
