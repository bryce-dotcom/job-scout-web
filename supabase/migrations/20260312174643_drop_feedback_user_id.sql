-- Drop user_id (UUID type doesn't match integer employee IDs)
ALTER TABLE feedback DROP COLUMN IF EXISTS user_id;
