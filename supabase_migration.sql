-- ============================================
-- Supabase Manual Migration SQL
-- Generated from src/lib/schema.ts
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- Table: users
-- ============================================
-- Create table if it doesn't exist (for new installations)
CREATE TABLE IF NOT EXISTS "users" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  CONSTRAINT "users_username_unique" UNIQUE ("username")
);

-- Add email and zoho_id columns if they don't exist (for existing installations)
DO $$ 
BEGIN
  -- Add email column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "email" TEXT;
  END IF;

  -- Add zoho_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'zoho_id'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "zoho_id" VARCHAR;
  END IF;

  -- Add unique constraint on email if column exists and constraint doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");
  END IF;
END $$;

-- Add indexes for users table
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_zoho_id_idx" ON "users" ("zoho_id");

-- ============================================
-- Table: time_entries
-- ============================================
CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "job_name" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "lunch_start" TEXT NOT NULL,
  "lunch_end" TEXT NOT NULL,
  "total_hours" TEXT NOT NULL,
  "notes" TEXT DEFAULT '',
  "change_order" TEXT DEFAULT '',
  "created_at" TEXT DEFAULT now()
);

-- ============================================
-- Indexes for time_entries table
-- ============================================
CREATE INDEX IF NOT EXISTS "user_id_idx" ON "time_entries" ("user_id");
CREATE INDEX IF NOT EXISTS "date_idx" ON "time_entries" ("date");
CREATE INDEX IF NOT EXISTS "job_id_idx" ON "time_entries" ("job_id");

-- ============================================
-- Table: projects
-- ============================================
CREATE TABLE IF NOT EXISTS "projects" (
  "id" VARCHAR PRIMARY KEY,
  "name" TEXT NOT NULL,
  "customer" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "address" TEXT DEFAULT '',
  "sales_rep" TEXT DEFAULT '',
  "supplier_color" TEXT DEFAULT '',
  "trim_color" TEXT DEFAULT '',
  "accessory_color" TEXT DEFAULT '',
  "gutter_type" TEXT DEFAULT '',
  "siding_style" TEXT DEFAULT '',
  "work_order_link" TEXT DEFAULT '',
  "created_at" TEXT DEFAULT now(),
  "updated_at" TEXT DEFAULT now()
);

-- ============================================
-- Indexes for projects table
-- ============================================
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status");
CREATE INDEX IF NOT EXISTS "projects_customer_idx" ON "projects" ("customer");

-- ============================================
-- Table: user_projects (Junction Table)
-- ============================================
CREATE TABLE IF NOT EXISTS "user_projects" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_email" TEXT NOT NULL,
  "project_id" VARCHAR NOT NULL,
  "created_at" TEXT DEFAULT now(),
  CONSTRAINT "user_projects_user_email_project_id_unique" UNIQUE ("user_email", "project_id")
);

-- ============================================
-- Indexes for user_projects table
-- ============================================
CREATE INDEX IF NOT EXISTS "user_projects_user_email_idx" ON "user_projects" ("user_email");
CREATE INDEX IF NOT EXISTS "user_projects_project_id_idx" ON "user_projects" ("project_id");

-- ============================================
-- Foreign Key Constraint (Optional but recommended)
-- ============================================
-- Uncomment if you want referential integrity:
-- ALTER TABLE "user_projects" 
--   ADD CONSTRAINT "user_projects_project_id_fkey" 
--   FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;

-- ============================================
-- Verification Queries (Optional)
-- ============================================
-- Uncomment these to verify the tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('time_entries', 'projects', 'user_projects', 'users');

