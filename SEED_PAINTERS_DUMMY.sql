-- Dummy data for painters table (run in Supabase SQL Editor)
-- Uses ON CONFLICT DO NOTHING so you can run this multiple times safely.

INSERT INTO public.painters (id, name, email, phone, active, created_at, updated_at)
VALUES
  ('dummy-001', 'Alex Rivera', 'alex.rivera@example.com', '555-0101', true, now()::text, now()::text),
  ('dummy-002', 'Jordan Lee', 'jordan.lee@example.com', '555-0102', true, now()::text, now()::text),
  ('dummy-003', 'Sam Taylor', 'sam.taylor@example.com', NULL, true, now()::text, now()::text),
  ('dummy-004', 'Casey Brown', NULL, '555-0104', true, now()::text, now()::text),
  ('dummy-005', 'Riley Davis', 'riley.davis@example.com', '555-0105', false, now()::text, now()::text)
ON CONFLICT (id) DO NOTHING;
