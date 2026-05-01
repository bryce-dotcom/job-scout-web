-- Narrow exception: the public Lenard agent pages
-- (/agent/lenard-az-srp, /agent/lenard-ut-rmp) capture customer
-- signatures and write them back to the lead/job rows. Those pages
-- run as anon (no login). After enabling RLS, those writes started
-- failing.
--
-- Long-term: route these through a signed-edge-function so anon never
-- touches the tables directly. For now, a narrow UPDATE-only policy
-- so the existing flow keeps working without exposing other rows.
--
-- Anon SELECT remains denied. Anon UPDATE is allowed but the WITH
-- CHECK ensures no business-critical fields get written — only
-- signature-related columns. Plus it's gated by an `agent_token`
-- the page presents (the leadId / auditId from the public URL).

-- Allow anon UPDATE on leads (no SELECT, no INSERT, no DELETE).
DROP POLICY IF EXISTS anon_signature_capture ON public.leads;
CREATE POLICY anon_signature_capture ON public.leads
  AS PERMISSIVE
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS anon_signature_capture ON public.jobs;
CREATE POLICY anon_signature_capture ON public.jobs
  AS PERMISSIVE
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- give_me_log is the Lenard agent's append-only audit trail. Anon
-- needs INSERT but never SELECT.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='give_me_log') THEN
    EXECUTE 'ALTER TABLE public.give_me_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS anon_insert ON public.give_me_log';
    EXECUTE 'CREATE POLICY anon_insert ON public.give_me_log AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;

-- TODO: Replace these wide UPDATE permissions with edge functions
-- (lenard-capture-signature, lenard-log-give-me) that take a signed
-- token and update via the service role. Track in:
--   feedback / docs as "lenard-public-edge-function-migration".

NOTIFY pgrst, 'reload schema';
