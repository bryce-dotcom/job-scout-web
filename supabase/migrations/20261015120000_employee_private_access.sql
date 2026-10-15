-- ONE RULE FOR WHO MAY SEE AN EMPLOYEE'S PRIVATE PAPERWORK (2026-10-15)
--
-- Every tenant table carries `tenant_isolation`: anyone signed in to the
-- company reads every row. For most tables that is the product. For the
-- onboarding paperwork it was a disaster, found while moving SSN/bank fields
-- off `employees`:
--
--   employee_onboarding_packets.draft_data   the new hire's FULL SSN (or EIN)
--                                            and FULL bank account number, in
--                                            plain text, kept after finalize;
--                                            plus the packet's portal `token`
--   signed_documents.values_snapshot         the signed direct-deposit
--                                            authorization: FULL routing and
--                                            account number; the W-4 / I-9 / W-9
--                                            as the person typed them
--
-- On 2026-10-15 that was 19 packets with a full SSN, 19 with a full account
-- number, and 20 signed authorizations with full routing + account, all readable
-- by any field tech in the company through the REST API.
--
-- The rule, in one place so the tables below cannot drift apart:
--   the employee themself (JWT email = the row's employee email), or
--   a payroll admin of THAT company: has_hr_access, is_admin, or user_role
--   Admin / Owner / Super Admin / Developer, or
--   a platform developer (is_developer, any company: the same reach
--   current_user_company_ids() already gives them).
--
-- "Payroll admin" is deliberately the rule decrypt_ssn_for_payroll_admin and
-- OnboardingPanel.jsx already use, so nobody who sends onboarding links or reads
-- a full SSN today loses it. It is wider than canViewHR() (has_hr_access only):
-- an Admin without the HR flag can already decrypt a full SSN through the RPC,
-- so this grants nothing new. To narrow it, change this one function, and
-- decrypt_*_for_payroll_admin with it.
--
-- RESTRICTIVE policies, ANDed onto tenant_isolation: company scoping stays
-- exactly as it was, and this only takes rows away. Service-role edge functions
-- (employee-onboarding, send-onboarding-link, render-onboarding-pdfs,
-- employee-direct-deposit, payroll-dd-export) bypass RLS and are unaffected.

create or replace function public.can_see_employee_private(p_employee_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '')) as email
  ),
  t as (
    select id, company_id, lower(coalesce(email, '')) as email
      from public.employees
     where id = p_employee_id
  )
  select coalesce((
    select (t.email <> '' and t.email = me.email)
        or exists (
             select 1
               from public.employees c
              where c.active = true
                and lower(c.email) = me.email
                and (   c.is_developer = true
                     or (c.company_id = t.company_id
                         and (   c.has_hr_access = true
                              or c.is_admin = true
                              or coalesce(c.user_role, '') in ('Admin', 'Owner', 'Super Admin', 'Developer'))))
           )
      from t, me
     where me.email is not null
  ), false);
$$;

revoke all on function public.can_see_employee_private(integer) from public, anon;
grant execute on function public.can_see_employee_private(integer) to authenticated, service_role;

comment on function public.can_see_employee_private(integer) is
  'Self, a payroll admin of the employee''s company, or a platform developer. The one rule for employee_identity, employee_onboarding_packets and signed_documents.';

drop policy if exists employee_private_only on public.employee_onboarding_packets;
create policy employee_private_only on public.employee_onboarding_packets
  as restrictive for all to authenticated
  using (employee_id is null or public.can_see_employee_private(employee_id))
  with check (employee_id is null or public.can_see_employee_private(employee_id));

drop policy if exists employee_private_only on public.signed_documents;
create policy employee_private_only on public.signed_documents
  as restrictive for all to authenticated
  using (employee_id is null or public.can_see_employee_private(employee_id))
  with check (employee_id is null or public.can_see_employee_private(employee_id));

-- audit_log is readable by the whole tenant too, and log_audit_event wrote the
-- full employees row (SSN ciphertext, SSN/bank last four, DOB, home address)
-- into it on every save: 773 of 1,226 employee audit rows on 2026-10-15. Stop
-- writing them. The history is scrubbed by the follow-up data migration.
-- Everything else in this function is unchanged.
create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
  private_keys text[] := array['ssn_last4', 'ssn_encrypted', 'date_of_birth', 'home_address', 'home_city',
    'home_state', 'home_zip', 'dd_account_encrypted', 'dd_routing_encrypted', 'dd_account_last4',
    'dd_account_type', 'w9_ein_encrypted', 'w9_ein_last4'];
  old_j jsonb;
  new_j jsonb;
BEGIN
  -- Wrap in exception handler so audit failures don't block main operations
  BEGIN
    old_j := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
    new_j := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
    IF TG_TABLE_NAME = 'employees' THEN
      old_j := old_j - private_keys;
      new_j := new_j - private_keys;
    END IF;

    INSERT INTO audit_log (
      table_name,
      record_id,
      action,
      old_values,
      new_values,
      user_email,
      company_id
    ) VALUES (
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id)::TEXT,
      TG_OP,
      old_j,
      new_j,
      COALESCE(auth.jwt()->>'email', 'system'),
      COALESCE(NEW.company_id, OLD.company_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the main operation
    RAISE WARNING 'Audit log failed: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
