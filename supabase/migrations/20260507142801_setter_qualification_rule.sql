-- When does a setter earn their per-meeting commission?
--
-- Two policies, configurable per-company in /setter (settings drawer):
--
--   'appointment_set' (legacy default) — commission earned the moment an
--     appointment row is created. Setter gets paid for setting the meeting
--     regardless of whether anything came of it. This was the only behavior
--     before today.
--
--   'quote_created' — commission stays in `payment_status='pending'` until
--     a quote is created on the same lead. At that moment the row flips to
--     'earned'. Pay only goes out for 'earned' rows. Stops setters getting
--     paid for tire-kicker meetings that go nowhere.
--
-- Tracy / Alayda flagged: HHH currently pays Tracy for every appointment
-- she sets (14 last 14d → \$1050) but only 1 of those leads got a quote.
-- HHH wants the 'quote_created' rule.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS setter_qualification_rule text NOT NULL DEFAULT 'appointment_set';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_setter_qualification_rule_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_setter_qualification_rule_check
  CHECK (setter_qualification_rule IN ('appointment_set', 'quote_created'));

-- Trigger: when a quote is INSERTed, promote any pending setter
-- commissions on the same lead to 'earned' — but only for companies
-- whose rule is 'quote_created'. Companies still on 'appointment_set'
-- ignore this entirely.
CREATE OR REPLACE FUNCTION public.promote_setter_commissions_on_quote()
RETURNS TRIGGER AS $$
DECLARE
  rule text;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  SELECT setter_qualification_rule INTO rule
    FROM public.companies WHERE id = NEW.company_id;
  IF rule IS DISTINCT FROM 'quote_created' THEN RETURN NEW; END IF;

  UPDATE public.lead_commissions
     SET payment_status = 'earned'
   WHERE company_id = NEW.company_id
     AND lead_id = NEW.lead_id
     AND commission_type = 'appointment_set'
     AND payment_status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quotes_promote_setter_commissions ON public.quotes;
CREATE TRIGGER quotes_promote_setter_commissions
AFTER INSERT ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.promote_setter_commissions_on_quote();
