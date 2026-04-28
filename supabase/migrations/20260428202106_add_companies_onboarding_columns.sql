-- Onboarding wizard writes industry, timezone, primary_color on the
-- companies row when the user clicks "Complete Setup". Those columns
-- never existed, so the update call returned a PostgREST schema-cache
-- error and the user was stuck on the final step.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS industry      TEXT,
  ADD COLUMN IF NOT EXISTS timezone      TEXT DEFAULT 'America/Denver',
  ADD COLUMN IF NOT EXISTS primary_color TEXT;
