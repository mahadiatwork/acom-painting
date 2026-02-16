-- Create painters table (required for /api/webhooks/painters)
-- ERROR "relation painters does not exist" = run this in Supabase.
--
-- CRITICAL: Use the SAME Supabase project that Vercel uses.
-- Vercel → Settings → Environment Variables → DATABASE_URL has a host like
--   ...supabase.com or pooler.supabase.com. Open THAT project in Supabase, then run this.

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

-- After running: Table Editor → painters should appear. Or run: SELECT * FROM painters LIMIT 1;
