-- Extra Work / T&M: track hours and description separately from base crew hours
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS extra_hours text NOT NULL DEFAULT '0';
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS extra_work_description text DEFAULT '';
