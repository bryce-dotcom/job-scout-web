-- Credentials in `settings` were readable by every employee.
--
-- WHAT WAS TRUE BEFORE THIS (confirmed 2026-10-16 by querying as a real
-- field tech, not by reading policy text). `settings` had exactly one
-- permissive policy, tenant_isolation, which asks only "is this your
-- company". So acting as Cameron (company 3, job title Field Tech,
-- user_role 'User') a single REST call —
--
--     GET /rest/v1/settings?key=eq.payment_config
--
-- returned payment_config.stripe_secret_key (107 chars), twilio_config
-- .auth_token (32 chars), and plaid_config.access_token. A live Stripe
-- secret key can charge and refund; a Plaid access token reads the whole
-- bank history. Every installer on the roster could take all three.
--
-- A field NAME survey across every settings row (names only, never values)
-- found credentials in exactly three keys. quickbooks_config has no row yet
-- but Settings.jsx writes client_secret into it, so it is listed too.
--
-- WHY A RESTRICTIVE POLICY AND NOT A NARROWER tenant_isolation. Restrictive
-- policies AND with whatever else exists, so this cannot be widened later by
-- someone adding another permissive policy. The service role bypasses RLS
-- entirely, so all fifteen edge functions that read payment_config keep
-- working untouched — only the browser is constrained.
--
-- WHO COUNTS AS AN ADMIN. Exactly what src/lib/accessControl.js isAdmin()
-- says: user_role of Admin / Owner / Super Admin / Developer, the legacy
-- is_admin boolean, or is_developer. Deliberately NOT has_hr_access —
-- is_payroll_admin_of() includes it because payroll is HR's job, but seeing
-- someone's SSN is not a reason to hold the company's Stripe key.

-- ── who is an admin of this company ──────────────────────────────────────
create or replace function public.is_company_admin_of(p_company_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select exists (
      select 1
        from public.employees c
       where c.active = true
         and lower(c.email) = me.email
         and (   c.is_developer = true
              or (c.company_id = p_company_id
                  and (   c.is_admin = true
                       or coalesce(c.user_role, '') in ('Admin', 'Owner', 'Super Admin', 'Developer'))))
    )
    from (select lower(nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', '')) as email) me
    where me.email is not null
  ), false);
$$;

comment on function public.is_company_admin_of(integer) is
  'True when the JWT belongs to an active admin of this company — the DB twin of accessControl.js isAdmin(). Unlike is_payroll_admin_of(), has_hr_access does NOT count: HR access is not finance access. The two must stay in step with their JS counterparts.';

grant execute on function public.is_company_admin_of(integer) to authenticated;

-- ── the keys that hold a credential ──────────────────────────────────────
-- A function rather than an inline list so the next integration is added in
-- one place, and so a reader can see the list without digging into pg_policies.
create or replace function public.settings_key_holds_secret(p_key text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_key, '') in (
    'payment_config',     -- stripe_secret_key, paypal_secret, *_api_key, bank_routing/account
    'twilio_config',      -- auth_token
    'plaid_config',       -- items[].access_token
    'quickbooks_config'   -- client_secret (written by Settings.jsx; no row yet)
  );
$$;

comment on function public.settings_key_holds_secret(text) is
  'The settings keys whose value carries a credential. Add a key here the moment an integration stores a secret in settings.';

-- ── the gate ─────────────────────────────────────────────────────────────
drop policy if exists secret_settings_admin_only on public.settings;
create policy secret_settings_admin_only on public.settings
  as restrictive
  for all
  to authenticated
  using      (not settings_key_holds_secret(key) or is_company_admin_of(company_id))
  with check (not settings_key_holds_secret(key) or is_company_admin_of(company_id));
