-- Add setter_id to appointments table
-- Tracks who set (scheduled) the appointment

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS setter_id INTEGER REFERENCES employees(id);

-- Create index for filtering by setter
CREATE INDEX IF NOT EXISTS idx_appointments_setter_id ON appointments(setter_id);
