-- Foreman-Based Migration - Phase 1: Database schema
-- Run this in Supabase SQL Editor after creating Painters and Time_Entries_X_Painters in Zoho CRM.
-- Steps 1.1–1.2 (Zoho) are manual; then run this script.

-- Step 1.3: Create painters table (synced from Zoho Painters module)
CREATE TABLE IF NOT EXISTS painters (
  id          VARCHAR PRIMARY KEY,
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TEXT    DEFAULT now(),
  updated_at  TEXT    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS painters_name_idx   ON painters (name);
CREATE INDEX IF NOT EXISTS painters_active_idx ON painters (active);

-- Step 1.4: Create timesheet_painters junction table
CREATE TABLE IF NOT EXISTS timesheet_painters (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id     VARCHAR NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  painter_id       VARCHAR NOT NULL,
  painter_name     TEXT    NOT NULL,
  start_time       TEXT    NOT NULL,
  end_time         TEXT    NOT NULL,
  lunch_start      TEXT    NOT NULL DEFAULT '',
  lunch_end        TEXT    NOT NULL DEFAULT '',
  total_hours      TEXT    NOT NULL,
  zoho_junction_id VARCHAR,
  created_at       TEXT    DEFAULT now(),
  UNIQUE (timesheet_id, painter_id)
);

CREATE INDEX IF NOT EXISTS tp_timesheet_id_idx ON timesheet_painters (timesheet_id);
CREATE INDEX IF NOT EXISTS tp_painter_id_idx   ON timesheet_painters (painter_id);

-- Step 1.5: Add new columns to time_entries (parent timesheet)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS zoho_time_entry_id VARCHAR;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS total_crew_hours TEXT DEFAULT '0';

-- DEFERRED: Drop per-painter columns from time_entries after new flow is verified.
-- ALTER TABLE time_entries DROP COLUMN IF EXISTS start_time;
-- ALTER TABLE time_entries DROP COLUMN IF EXISTS end_time;
-- ALTER TABLE time_entries DROP COLUMN IF EXISTS lunch_start;
-- ALTER TABLE time_entries DROP COLUMN IF EXISTS lunch_end;
-- ALTER TABLE time_entries DROP COLUMN IF EXISTS total_hours;
