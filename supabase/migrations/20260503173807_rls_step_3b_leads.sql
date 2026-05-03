-- ====================================================================
-- Step 3b — RLS on `leads` ONLY.
--
-- Special concern: HHH's public Lenard agent URLs
-- (/agent/lenard-az-srp, /agent/lenard-ut-rmp) write a customer signature
-- back to leads.update() as ANON (no JWT). Locking leads strictly would
-- break that intake flow.
--
-- Compromise (until we move signature capture into an edge function):
--   - Anon can UPDATE leads BUT only the three signature columns.
--   - Anon CANNOT SELECT, INSERT, or DELETE.
--   - Authenticated users get strict tenant_isolation (read/write only
--     their own company's leads).
--
-- IF SOMETHING BREAKS, paste this into Supabase SQL Editor:
--
--   DROP POLICY IF EXISTS tenant_isolation ON public.leads;
--   DROP POLICY IF EXISTS anon_signature_update ON public.leads;
--   ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.leads NO FORCE ROW LEVEL SECURITY;
--   GRANT ALL ON public.leads TO anon;
--   NOTIFY pgrst, 'reload schema';
-- ====================================================================

-- 1. Clean any prior policies.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy WHERE polrelid = 'public.leads'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', r.polname);
  END LOOP;
END $$;

-- 2. Enable + force RLS.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE  ROW LEVEL SECURITY;

-- 3. Tenant isolation for authenticated users.
CREATE POLICY tenant_isolation
  ON public.leads
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

-- 4. Narrow anon UPDATE policy. The USING (true) lets anon find a row
-- by id; the column-level GRANT below restricts WHAT they can change.
-- WITH CHECK (true) on the post-update row is fine because the only
-- columns they can write are the signature ones — no way for them to
-- shift a lead's company_id or other sensitive field.
CREATE POLICY anon_signature_update
  ON public.leads
  AS PERMISSIVE
  FOR UPDATE
  TO anon
  USING      (true)
  WITH CHECK (true);

-- 5. Lock down anon's column-level grants. Strip everything, then add
-- back ONLY the signature columns + id (needed for WHERE).
REVOKE ALL ON public.leads FROM anon;
GRANT  UPDATE (
  customer_signature_path,
  customer_signature_method,
  customer_signature_typed,
  customer_signature_captured_at
) ON public.leads TO anon;

-- 6. Authenticated role keeps full grants (RLS handles isolation).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

-- 7. Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
