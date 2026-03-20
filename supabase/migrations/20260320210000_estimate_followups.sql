-- Add follow_up_3 and tracking columns for automated follow-ups
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_3 timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS followup_count integer DEFAULT 0;
