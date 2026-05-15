-- ====================================================================
-- RLS developer bypass.
--
-- Problem: when Bryce (developer) impersonates another company in the
-- Data Console, the in-app store flips to that company but the JWT is
-- still his — so current_user_company_ids() only returns his real
-- company_id and every customer/job/etc. for the impersonated tenant
-- is hidden by the tenant_isolation policies.
--
-- Fix: extend current_user_company_ids() so that if the JWT email
-- resolves to an active employee with is_developer = TRUE, we return
-- every company.id. Regular users are unaffected (they still see only
-- their own).
--
-- This is a pure-helper change. The tenant_isolation policies on
-- customers, leads, quotes, jobs, financials, etc. all read from this
-- function, so a single edit unlocks every gated table for devs.
--
-- REVERT:
--   Replace the function body with the original
--   "SELECT DISTINCT company_id FROM employees WHERE ..." block from
--   20260503165234_rls_step_3a_customers.sql.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH jwt_email AS (
    SELECT lower(coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'email',
      ''
    )) AS email
  ),
  is_dev AS (
    SELECT EXISTS (
      SELECT 1
        FROM public.employees e, jwt_email j
       WHERE e.active = TRUE
         AND e.is_developer = TRUE
         AND lower(e.email) = j.email
         AND j.email <> ''
    ) AS yes
  )
  SELECT id FROM public.companies
   WHERE (SELECT yes FROM is_dev)
  UNION
  SELECT DISTINCT e.company_id
    FROM public.employees e, jwt_email j
   WHERE e.active = TRUE
     AND lower(e.email) = j.email
     AND j.email <> '';
$$;

GRANT EXECUTE ON FUNCTION public.current_user_company_ids() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
