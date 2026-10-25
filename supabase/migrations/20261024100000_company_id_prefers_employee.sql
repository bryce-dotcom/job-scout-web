-- Which company am I in? Ask the membership, not the ownership.
--
-- Bryce, 2026-10-24: "tried to create a fireside and it said i didn't have
-- access to that." Not a CampFire bug — a tenant-resolution bug that has been
-- firing at random across the whole product for him.
--
-- get_user_company_id() asked companies.owner_email FIRST:
--
--   SELECT id FROM companies WHERE owner_email = <me> LIMIT 1
--
-- He is owner_email on TWO companies: 3 (HHH, 33 employees, 7,183 jobs) and
-- 5 (a shell, 0 employees, 3 jobs). LIMIT 1 with no ORDER BY lets Postgres
-- return either. When it returned 5, every policy of the form
-- `company_id = get_user_company_id()` refused his company-3 writes with
-- 42501, which the app correctly renders as "You don't have access to change
-- this" — a true statement about a false premise.
--
-- Intermittent, unexplainable, and it would have hit any customer who owns a
-- second company.
--
-- THE FIX is to agree with the app. App.jsx:300 does setCompany(employee.company)
-- — the application has always resolved the current company from the ACTIVE
-- EMPLOYEE ROW. The database was answering a different question with a
-- weaker signal. Employment is explicit membership in exactly one company;
-- owner_email is a text column that can match several.
--
-- The owner_email branch stays as the FALLBACK, because a brand-new owner has
-- no employee row yet and onboarding depends on it.
--
-- BLAST RADIUS, measured rather than assumed: this function guards ~123
-- tables, so before changing it every email in the database was checked for
-- an owner row and an active employee row disagreeing. Exactly one account
-- differs — Bryce's — and for him it moves from 5 (wrong) to 3 (right).
-- Nobody else's answer changes at all.

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT company_id FROM employees
      WHERE email = auth.jwt() ->> 'email' AND active = true
      ORDER BY company_id
      LIMIT 1),
    -- Fallback: an owner who has not been given an employee row yet, which
    -- is every company during onboarding. ORDER BY id so that even here the
    -- answer is stable rather than whatever the planner feels like.
    (SELECT id FROM companies
      WHERE owner_email = auth.jwt() ->> 'email'
      ORDER BY id
      LIMIT 1)
  );
$function$;

COMMENT ON FUNCTION public.get_user_company_id() IS
  'The caller''s company: their ACTIVE EMPLOYEE ROW first (explicit membership, and what the app uses), falling back to companies.owner_email for an owner who has no employee row yet. Both ordered, so the answer is never arbitrary.';
