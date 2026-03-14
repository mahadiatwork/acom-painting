-- Add name and phone columns to users table for foremen synced from Zoho CRM.
-- Run this in the Supabase SQL Editor if you have not run it before.

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
