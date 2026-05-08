-- estimate_messages: a unified thread per estimate for rep ↔ customer
-- communication. Replaces the "I have no idea what was actually sent or
-- whether the customer replied" black hole that Doug + Noah called out.
--
-- Roles:
--   'rep'      → message authored by an internal user (reply, note, etc.)
--   'customer' → message authored by the customer through the portal
--   'system'   → automatic log entry (e.g. "Estimate sent to email@x.com",
--                snapshot of the actual email body that left the building)
--
-- channel:
--   'email'    → was delivered as / originated from email
--   'portal'   → originated in the customer portal
--   'note'     → internal-only note, never shown to customer

CREATE TABLE IF NOT EXISTS public.estimate_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    bigint      NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id  bigint      NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  from_role   text        NOT NULL CHECK (from_role IN ('rep','customer','system')),
  from_name   text,
  from_email  text,
  to_email    text,

  channel     text        NOT NULL DEFAULT 'note' CHECK (channel IN ('email','portal','note')),
  subject     text,
  body        text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,

  is_internal boolean     NOT NULL DEFAULT false,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_messages_quote_created
  ON public.estimate_messages (quote_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estimate_messages_company_unread
  ON public.estimate_messages (company_id, read_at)
  WHERE read_at IS NULL AND from_role = 'customer';

ALTER TABLE public.estimate_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.estimate_messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_messages TO authenticated;

ALTER TABLE public.estimate_messages FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.estimate_messages
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Snapshot of the rendered proposal that the customer received on
-- the most recent send. Filled by sendEstimate(); used by the
-- "View what the customer received" button.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS sent_snapshot_pdf_path text,
  ADD COLUMN IF NOT EXISTS sent_snapshot_pdf_at  timestamptz;
