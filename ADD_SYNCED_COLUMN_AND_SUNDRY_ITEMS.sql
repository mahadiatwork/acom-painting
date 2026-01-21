-- Migration: Add synced column and all sundry item columns to time_entries table
-- Run this in Supabase SQL Editor

-- First, check if synced column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_entries' AND column_name = 'synced'
    ) THEN
        ALTER TABLE time_entries ADD COLUMN synced BOOLEAN DEFAULT false NOT NULL;
        RAISE NOTICE 'Added synced column';
    ELSE
        RAISE NOTICE 'synced column already exists';
    END IF;
END $$;

-- Add all sundry item columns
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS masking_paper_roll TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS plastic_roll TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS putty_spackle_tub TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS caulk_tube TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS white_tape_roll TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS orange_tape_roll TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS floor_paper_roll TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS tip TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS sanding_sponge TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS inch_roller_cover_18 TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS inch_roller_cover_9 TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS mini_cover TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS masks TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS brick_tape_roll TEXT DEFAULT '0';
