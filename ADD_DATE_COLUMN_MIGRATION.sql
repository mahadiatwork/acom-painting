-- Migration: Add date column to projects table
-- Run this in Supabase SQL Editor if the date column doesn't exist

-- Add date column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects' 
    AND column_name = 'date'
  ) THEN
    ALTER TABLE "projects" ADD COLUMN "date" TEXT DEFAULT '';
    RAISE NOTICE 'Added date column to projects table';
  ELSE
    RAISE NOTICE 'Date column already exists in projects table';
  END IF;
END $$;
