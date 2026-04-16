-- Add manual_annual_savings column to quotes table
-- Allows users to enter estimated annual savings for non-lighting/non-audit estimates
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS manual_annual_savings numeric DEFAULT 0;

COMMENT ON COLUMN quotes.manual_annual_savings IS 'Manual annual savings override (dollars). Used when no linked audit provides calculated savings.';
