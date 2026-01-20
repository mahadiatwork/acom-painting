-- ============================================
-- Create Minimal Projects Table
-- Only includes: name, date, and address
-- ============================================

-- Drop table if it exists (use with caution - this will delete all data)
-- DROP TABLE IF EXISTS "projects_minimal" CASCADE;

-- Create the minimal projects table
CREATE TABLE IF NOT EXISTS "projects_minimal" (
  "id" VARCHAR PRIMARY KEY,                    -- Zoho Deal ID (used as primary key for idempotent upserts)
  "name" TEXT NOT NULL,                        -- Deal_Name from Zoho
  "date" TEXT,                                 -- Closing_Date or Project_Start_Date from Zoho
  "address" TEXT,                              -- Shipping_Street or combined address from Zoho
  "status" TEXT NOT NULL DEFAULT 'Project Accepted',  -- Stage from Zoho (required for filtering)
  "created_at" TIMESTAMPTZ DEFAULT NOW(),     -- Timestamp when record was created
  "updated_at" TIMESTAMPTZ DEFAULT NOW()      -- Timestamp when record was last updated
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "projects_minimal_status_idx" ON "projects_minimal" ("status");
CREATE INDEX IF NOT EXISTS "projects_minimal_name_idx" ON "projects_minimal" ("name");

-- Add comment to table
COMMENT ON TABLE "projects_minimal" IS 'Minimal projects table storing only name, date, and address from Zoho CRM Deals';

-- Add comments to columns
COMMENT ON COLUMN "projects_minimal"."id" IS 'Zoho Deal ID - used as primary key for idempotent upserts';
COMMENT ON COLUMN "projects_minimal"."name" IS 'Deal name from Zoho CRM (Deal_Name field)';
COMMENT ON COLUMN "projects_minimal"."date" IS 'Project date from Zoho CRM (Closing_Date or Project_Start_Date)';
COMMENT ON COLUMN "projects_minimal"."address" IS 'Project address from Zoho CRM (Shipping_Street or combined address fields)';
COMMENT ON COLUMN "projects_minimal"."status" IS 'Project status from Zoho CRM (Stage field) - used to filter "Project Accepted" projects';

-- ============================================
-- Verification Query
-- ============================================
-- Uncomment to verify the table was created:
-- SELECT 
--   table_name, 
--   column_name, 
--   data_type, 
--   is_nullable
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'projects_minimal'
-- ORDER BY ordinal_position;
