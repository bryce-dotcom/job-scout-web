-- Add calendar_display preference to customers
-- Controls whether calendar shows person name or business name
ALTER TABLE customers ADD COLUMN IF NOT EXISTS calendar_display text DEFAULT 'person';
