-- Add reply tracking columns to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reply_message TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reply_history JSONB DEFAULT '[]'::jsonb;
