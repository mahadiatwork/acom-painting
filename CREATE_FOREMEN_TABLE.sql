-- Create foremen table and add foreman_id to time_entries.
-- Run this in the Supabase SQL Editor.

-- 1. Create foremen table (synced from Zoho Portal_Users)
CREATE TABLE IF NOT EXISTS foremen (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id     VARCHAR NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  created_at  TEXT DEFAULT now(),
  updated_at  TEXT DEFAULT now()
);

CREATE INDEX IF NOT EXISTS foremen_zoho_id_idx ON foremen (zoho_id);
CREATE INDEX IF NOT EXISTS foremen_email_idx ON foremen (email);

-- 2. Add foreman_id to time_entries (prefer over user_id for new entries)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS foreman_id TEXT;
CREATE INDEX IF NOT EXISTS time_entries_foreman_id_idx ON time_entries (foreman_id);

-- 3. Make user_id nullable (kept for backward compatibility)
ALTER TABLE time_entries ALTER COLUMN user_id DROP NOT NULL;
