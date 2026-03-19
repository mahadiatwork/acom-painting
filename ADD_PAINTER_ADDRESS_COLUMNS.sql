-- Capture painter mailing addresses for T&M jobs so we can push them to Zoho Time_Entries.Address_Information
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS painter_address text NOT NULL DEFAULT '';
ALTER TABLE work_entries ADD COLUMN IF NOT EXISTS painter_address text NOT NULL DEFAULT '';
