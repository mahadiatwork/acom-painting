-- ============================================
-- Create Ultra-Minimal Projects Table
-- Only includes: id, name, date, and address
-- No status field - if you want to filter, do it in the application layer
-- ============================================

-- Drop table if it exists (use with caution - this will delete all data)
-- DROP TABLE IF EXISTS "projects_simple" CASCADE;

-- Create the ultra-minimal projects table
CREATE TABLE IF NOT EXISTS "projects_simple" (
  "id" VARCHAR PRIMARY KEY,                    -- Zoho Deal ID (used as primary key for idempotent upserts)
  "name" TEXT NOT NULL,                        -- Deal_Name from Zoho
  "date" TEXT,                                 -- Closing_Date or Project_Start_Date from Zoho
  "address" TEXT,                              -- Shipping_Street or combined address from Zoho
  "created_at" TIMESTAMPTZ DEFAULT NOW(),     -- Timestamp when record was created
  "updated_at" TIMESTAMPTZ DEFAULT NOW()      -- Timestamp when record was last updated
);

-- Create index on name for better query performance
CREATE INDEX IF NOT EXISTS "projects_simple_name_idx" ON "projects_simple" ("name");

-- Add comment to table
COMMENT ON TABLE "projects_simple" IS 'Ultra-minimal projects table storing only id, name, date, and address from Zoho CRM Deals';

-- Add comments to columns
COMMENT ON COLUMN "projects_simple"."id" IS 'Zoho Deal ID - used as primary key for idempotent upserts';
COMMENT ON COLUMN "projects_simple"."name" IS 'Deal name from Zoho CRM (Deal_Name field)';
COMMENT ON COLUMN "projects_simple"."date" IS 'Project date from Zoho CRM (Closing_Date or Project_Start_Date)';
COMMENT ON COLUMN "projects_simple"."address" IS 'Project address from Zoho CRM (Shipping_Street or combined address fields)';

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
--   AND table_name = 'projects_simple'
-- ORDER BY ordinal_position;
