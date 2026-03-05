-- Add last_login tracking to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
