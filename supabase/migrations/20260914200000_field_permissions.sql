-- =====================================================================
-- Field permissions: who may send an invoice or take a payment from the phone.
--
-- Bryce, 2026-09-14: "this is a feature for all users so we should build in
-- on the employee card a toggle that would allow anyone to send an invoice
-- from the phone … send invoice or collect payment now, and the ability to
-- assign whoever you want those permissions in the employee card."
--
-- Two flags on the employee, not a role rule. Roles only seed them:
--   Owner / Admin / Manager / Project Manager  → both on
--   Field Tech / Installer / everyone else     → collect on, send off
-- "Collect" defaults on for the crew because Field Scout has offered
-- Collect Payment to everyone since it was built; taking it away silently
-- would break how techs already work. Anyone Admin and above can flip
-- either flag on the employee card.
--
-- Both flags are access-granting, so they join the columns that
-- employees_block_privilege_escalation refuses to let anyone below Admin
-- change — a tech must not be able to grant themselves the right to send
-- invoices. The function is re-created from its live definition plus the
-- two lines, so nothing else it guards moves.
-- =====================================================================

alter table public.employees
  add column if not exists field_send_invoice    boolean not null default false,
  add column if not exists field_collect_payment boolean not null default false;

comment on column public.employees.field_send_invoice    is 'May send an invoice to the customer from Field Scout after completing a job.';
comment on column public.employees.field_collect_payment is 'May record or take a payment from Field Scout (cash/check, or card via the portal).';

-- A job completed in the field WITHOUT a passing verification. Victor is a
-- flag, not a gate: a messy site must not strand a tech at "In Progress"
-- (Christopher, 1 Sep: photos taken, jobs still In Progress). The job
-- completes; the office can see it was flagged, and why.
alter table public.jobs
  add column if not exists completion_flagged_at   timestamptz,
  add column if not exists completion_flag_reason  text;

-- Seed from roles, once. Existing rows only; new employees start at false
-- and get their flags on the employee card.
update public.employees
   set field_send_invoice    = (role in ('Owner', 'Admin', 'Manager', 'Project Manager')),
       field_collect_payment = true
 where field_send_invoice = false and field_collect_payment = false;

CREATE OR REPLACE FUNCTION public.employees_block_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
begin
  -- No JWT email = service role (edge functions, migrations, admin scripts).
  -- Those authorise their own callers; see _shared/auth.ts#resolveCaller.
  if jwt_email is null then
    return new;
  end if;

  -- Admin and above manage people. That is the job.
  if public.current_user_access_level() >= 3 then
    return new;
  end if;

  -- Access-granting columns.
  if new.user_role     is distinct from old.user_role     then changed := array_append(changed, 'user_role'::text); end if;
  if new.is_admin      is distinct from old.is_admin      then changed := array_append(changed, 'is_admin'::text); end if;
  if new.is_developer  is distinct from old.is_developer  then changed := array_append(changed, 'is_developer'::text); end if;
  if new.has_hr_access is distinct from old.has_hr_access then changed := array_append(changed, 'has_hr_access'::text); end if;
  if new.field_send_invoice    is distinct from old.field_send_invoice    then changed := array_append(changed, 'field_send_invoice'::text); end if;
  if new.field_collect_payment is distinct from old.field_collect_payment then changed := array_append(changed, 'field_collect_payment'::text); end if;
  if new.active        is distinct from old.active        then changed := array_append(changed, 'active'::text); end if;

  -- Money.
  if new.hourly_rate   is distinct from old.hourly_rate   then changed := array_append(changed, 'hourly_rate'::text); end if;
  if new.salary        is distinct from old.salary        then changed := array_append(changed, 'salary'::text); end if;
  if new.annual_salary is distinct from old.annual_salary then changed := array_append(changed, 'annual_salary'::text); end if;
  if new.pay_type      is distinct from old.pay_type      then changed := array_append(changed, 'pay_type'::text); end if;
  if new.is_hourly     is distinct from old.is_hourly     then changed := array_append(changed, 'is_hourly'::text); end if;
  if new.is_salary     is distinct from old.is_salary     then changed := array_append(changed, 'is_salary'::text); end if;
  if new.is_commission is distinct from old.is_commission then changed := array_append(changed, 'is_commission'::text); end if;
  if new.commission_goods_rate     is distinct from old.commission_goods_rate     then changed := array_append(changed, 'commission_goods_rate'::text); end if;
  if new.commission_services_rate  is distinct from old.commission_services_rate  then changed := array_append(changed, 'commission_services_rate'::text); end if;
  if new.commission_software_rate  is distinct from old.commission_software_rate  then changed := array_append(changed, 'commission_software_rate'::text); end if;
  if new.commission_leads_rate     is distinct from old.commission_leads_rate     then changed := array_append(changed, 'commission_leads_rate'::text); end if;
  if new.commission_setter_rate    is distinct from old.commission_setter_rate    then changed := array_append(changed, 'commission_setter_rate'::text); end if;
  if new.commission_processor_rate is distinct from old.commission_processor_rate then changed := array_append(changed, 'commission_processor_rate'::text); end if;

  if cardinality(changed) > 0 then
    raise exception
      'Only an admin can change % on an employee record.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';
