-- Public Zach quote widget now also creates a lead in the leads table.
-- Track the link so the quote request and the lead can be paired.

ALTER TABLE lawn_quote_requests
  ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lawn_quote_requests_lead_idx ON lawn_quote_requests(lead_id);
