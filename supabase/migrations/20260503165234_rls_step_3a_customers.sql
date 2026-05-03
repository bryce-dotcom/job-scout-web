-- ====================================================================
-- Step 3a — RLS on `customers` ONLY.
--
-- This migration:
--   1. Creates the helper current_user_company_ids() (same JWT logic
--      that whoami() proved works on 03 May)
--   2. Drops any existing policies on `customers` so we start clean
--   3. Enables + FORCES RLS on `customers`
--   4. Creates one tenant_isolation policy
--
-- After deploy:
--   - HHH user (any role) sees only HHH's customers
--   - A new beta tenant sees only their own customers
--   - Anon sees nothing on this table
--   - Service role bypasses RLS as always (admin scripts unaffected)
--
-- IF SOMETHING BREAKS, paste this into Supabase SQL Editor to revert
-- JUST this table:
--
--   DROP POLICY IF EXISTS tenant_isolation ON public.customers;
--   ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.customers NO FORCE ROW LEVEL SECURITY;
--   NOTIFY pgrst, 'reload schema';
--
-- (The helper function stays — it's harmless and used elsewhere later.)
-- ====================================================================

-- 1. Helper: resolve the calling user's company_ids from JWT email.
-- SECURITY DEFINER so it sees the employees table regardless of RLS.
-- STABLE so PostgREST caches the result within a single statement.
CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT company_id
    FROM public.employees
   WHERE active = TRUE
     AND lower(email) = lower(coalesce(
           current_setting('request.jwt.claims', true)::jsonb ->> 'email',
           ''
         ));
$$;

GRANT EXECUTE ON FUNCTION public.current_user_company_ids() TO authenticated, anon;

-- 2. Clean slate on customers' policies (drops any leftovers from
-- previous attempts so the new policy is the only one in effect).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.customers'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customers', r.polname);
  END LOOP;
END $$;

-- 3. Enable + FORCE RLS.
ALTER TABLE public.customers ENABLE  ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE   ROW LEVEL SECURITY;

-- 4. Single tenant-isolation policy. Uses USING for read/update/delete
-- and WITH CHECK for insert/update so that:
--   - reads return only rows whose company_id is in the caller's set
--   - writes can only target rows whose company_id is in the caller's set
CREATE POLICY tenant_isolation
  ON public.customers
  AS PERMISSIVE
  FOR ALL
  TO public
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

-- 5. Make PostgREST notice the policy change immediately.
NOTIFY pgrst, 'reload schema';
