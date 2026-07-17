-- Keep leads.quote_amount in sync with the lead's linked quote automatically,
-- so no application code has to remember to. Covers both orderings: the quote
-- amount changing, and a lead's quote_id being (re)assigned.

-- A) Quote amount changes -> push it onto any lead pointing at that quote.
CREATE OR REPLACE FUNCTION sync_lead_quote_amount_from_quote()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE leads
     SET quote_amount = NEW.quote_amount
   WHERE quote_id = NEW.id
     AND quote_amount IS DISTINCT FROM NEW.quote_amount;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_quote_amount_from_quote ON quotes;
CREATE TRIGGER trg_sync_lead_quote_amount_from_quote
  AFTER INSERT OR UPDATE OF quote_amount ON quotes
  FOR EACH ROW EXECUTE FUNCTION sync_lead_quote_amount_from_quote();

-- B) A lead's quote_id is set/changed -> pull the current quote amount onto it.
--    BEFORE so we set NEW.quote_amount directly. Only fires on quote_id change,
--    so a manual quote_amount edit is never clobbered.
CREATE OR REPLACE FUNCTION sync_lead_quote_amount_from_lead()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL THEN
    SELECT q.quote_amount INTO NEW.quote_amount FROM quotes q WHERE q.id = NEW.quote_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_quote_amount_from_lead ON leads;
CREATE TRIGGER trg_sync_lead_quote_amount_from_lead
  BEFORE INSERT OR UPDATE OF quote_id ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_quote_amount_from_lead();
