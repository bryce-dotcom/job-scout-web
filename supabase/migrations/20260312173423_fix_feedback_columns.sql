-- Add missing columns to feedback table
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS user_id UUID;
