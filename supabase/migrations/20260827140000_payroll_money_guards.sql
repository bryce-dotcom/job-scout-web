-- =====================================================================
-- Intra-tenant authorization — stage 2: payroll and money.
--
-- Stage 1 stopped self-promotion. This covers the two tiers the audit
-- ranked as critical, and it is shaped by which SCREENS actually write
-- each table rather than by what the tier is called. That distinction
-- matters more than it sounds:
--
--   invoices and payments are written from FieldScout.jsx and
--   JobDetail.jsx. Field techs raise invoices and take payments on jobs.
--
--   lead_commissions and setter_commissions are INSERTed from
--   LeadSetter.jsx, which is not gated at all.
--
-- A blanket "payroll and money are admin-only" would therefore have
-- broken a field tech taking a payment and a setter earning a
-- commission — and in this app a denied write is swallowed by
-- `const { data } = await ...` and renders as an empty result, so
-- nobody would have been told. That is how every Payroll commission
-- once became $0.
--
-- So: lock what only admins touch, and guard the money columns on
-- everything else.
--
-- Service-role callers (edge functions) are untouched throughout: they
-- are not the `authenticated` role, so RESTRICTIVE policies do not apply
-- to them, and the triggers return early when there is no JWT email.
-- =====================================================================


-- ---------------------------------------------------------------------
-- A. Tables only ever written by the Payroll screen, which is already
--    gated to Admin + has_hr_access. Nothing below Admin writes these
--    from any screen, so the whole write surface can close.
--
--    SELECT is deliberately left open: My Pay shows an employee their
--    own paystubs, and taking that away would break the page for the
--    people it exists for.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['paystubs', 'payroll_runs', 'payroll_tax_liabilities'] loop
    execute format('drop policy if exists admin_writes_only on public.%I', t);
    execute format($p$
      create policy admin_writes_only on public.%I
        as restrictive
        for insert to authenticated
        with check (public.current_user_access_level() >= 3)
    $p$, t);

    execute format('drop policy if exists admin_updates_only on public.%I', t);
    execute format($p$
      create policy admin_updates_only on public.%I
        as restrictive
        for update to authenticated
        using (public.current_user_access_level() >= 3)
        with check (public.current_user_access_level() >= 3)
    $p$, t);

    execute format('drop policy if exists admin_deletes_only on public.%I', t);
    execute format($p$
      create policy admin_deletes_only on public.%I
        as restrictive
        for delete to authenticated
        using (public.current_user_access_level() >= 3)
    $p$, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- B. Commission and bonus rows. A setter creating their own commission
--    row is normal work, and recalculation deletes and re-inserts these
--    when a job changes — so INSERT and DELETE stay open. What must not
--    move is what the row is WORTH and whether it has been paid.
--
--    Residual gap, stated rather than hidden: a determined insider could
--    still delete their row and insert a larger one through the API,
--    because blocking that would break recalculation. Closing it needs
--    the recalc paths exercised first.
-- ---------------------------------------------------------------------
create or replace function public.guard_commission_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
  col text;
  guarded text[];
begin
  if jwt_email is null then return new; end if;              -- edge functions
  if public.current_user_access_level() >= 3 then return new; end if;

  guarded := case tg_table_name
    when 'rep_commissions'    then array['amount','rate','basis_amount','payment_status','paid_at','paid_by','paid_pay_period_end','queued_for_payroll']
    when 'lead_commissions'   then array['amount','payment_status','queued_for_payroll']
    when 'setter_commissions' then array['setter_amount','marketer_amount','payment_status','approved_by','approved_at','paid_at']
    when 'job_bonuses'        then array['amount','status','paid_at','paid_by','paid_pay_period_start','paid_pay_period_end','queued_for_payroll']
    else array[]::text[]
  end;

  foreach col in array guarded loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      changed := array_append(changed, col);
    end if;
  end loop;

  if cardinality(changed) > 0 then
    raise exception 'Only an admin can change % on a %.', array_to_string(changed, ', '), tg_table_name
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rep_commissions', 'lead_commissions', 'setter_commissions', 'job_bonuses'] loop
    execute format('drop trigger if exists guard_commission_amounts on public.%I', t);
    execute format($p$
      create trigger guard_commission_amounts
        before update on public.%I
        for each row execute function public.guard_commission_amounts()
    $p$, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- C. Locked invoices. InvoiceDetail already treats is_locked as final —
--    it renders the amount fields `disabled` — but that lives entirely
--    in the browser, so the lock is advice rather than a rule. 16
--    invoices are currently locked.
--
--    Only the MONEY on a locked invoice is frozen. payment_status and
--    the email/sent columns must still move, because payments continue
--    to land against invoices that are otherwise final.
-- ---------------------------------------------------------------------
create or replace function public.guard_locked_invoice_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
  col text;
begin
  if jwt_email is null then return new; end if;
  if public.current_user_access_level() >= 3 then return new; end if;
  if coalesce(old.is_locked, false) = false then return new; end if;

  foreach col in array array['amount','discount_applied','credit_card_fee','project_discount',
                             'down_payment_applied','parts_total_override','labor_total_override'] loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      changed := array_append(changed, col);
    end if;
  end loop;

  -- Unlocking is itself an admin decision; otherwise the lock is a
  -- speed bump rather than a control.
  if new.is_locked is distinct from old.is_locked then
    changed := array_append(changed, 'is_locked'::text);
  end if;

  if cardinality(changed) > 0 then
    raise exception 'This invoice is locked. Only an admin can change %.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_locked_invoice_amounts on public.invoices;
create trigger guard_locked_invoice_amounts
  before update on public.invoices
  for each row execute function public.guard_locked_invoice_amounts();

notify pgrst, 'reload schema';
