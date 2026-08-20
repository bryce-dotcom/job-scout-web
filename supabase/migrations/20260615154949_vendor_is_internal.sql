ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;
