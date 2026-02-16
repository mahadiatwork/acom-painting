-- Create painters table (required for /api/webhooks/painters)
-- Run this in Supabase SQL Editor if the painters webhook returns 500.
-- If the table already exists, these statements are safe (IF NOT EXISTS).

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
