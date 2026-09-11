-- =====================================================================
-- Setter commissions: survive the pay guard, and follow a relinked quote.
--
-- Two faults, found together on Tracy's Sept 9 ticket, both in the
-- trigger that turns a setter's PENDING appointment fee into EARNED once
-- a quote exists on her lead (companies on the 'quote_created' rule).
--
-- 1. THE GUARD WAS BLOCKING QUOTE CREATION. 20260827140000 stopped anyone
--    below Admin from changing lead_commissions.payment_status. Correct
--    for a person editing pay by hand — but the promote trigger runs as
--    whoever inserted the quote, so a Manager or rep creating a quote on
--    a lead with a pending setter fee got "Only an admin can change
--    payment_status" and NO QUOTE. Since Aug 27. Reproduced as Noah
--    (Manager) on lead 4178 before writing this.
--
--    The guard now recognises the trigger's own write through a
--    transaction-local flag that only the trigger sets, and clears again
--    before it returns. A person cannot set it from a PostgREST request.
--
-- 2. RELINKING DID NOT COUNT. The trigger fired AFTER INSERT only. When a
--    rep quotes from a duplicate lead and someone repairs it by pointing
--    the quote at the real lead, that is an UPDATE, and the setter's fee
--    stayed pending forever. "It has to come from admin backfilling" —
--    which Arnie told Tracy, and which was exactly true.
--
--    It now fires on UPDATE OF lead_id too. The lead the quote arrives at
--    is promoted; the lead it left is demoted back to pending if no other
--    quote remains there — earned rows only, never paid ones. Relinking
--    becomes the self-healing path, no admin required.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. The guard learns to let the promote trigger through.
--    Identical to 20260827140000 apart from the one early return.
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

  -- A trigger promoting a setter fee is the system applying the company's
  -- own rule, not a person editing pay. Only promote_setter_commissions_on_quote
  -- sets this, transaction-locally, and clears it before returning.
  if current_setting('jobscout.trusted_write', true) = 'setter_promote' then return new; end if;

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


-- ---------------------------------------------------------------------
-- 2. The promote trigger: on insert AND on relink, marking its own writes.
-- ---------------------------------------------------------------------
create or replace function public.promote_setter_commissions_on_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule text;
begin
  select setter_qualification_rule into rule
    from public.companies where id = new.company_id;
  if rule is distinct from 'quote_created' then return new; end if;

  perform set_config('jobscout.trusted_write', 'setter_promote', true);

  -- The lead this quote now sits on qualifies.
  if new.lead_id is not null then
    update public.lead_commissions
       set payment_status = 'earned'
     where company_id = new.company_id
       and lead_id = new.lead_id
       and commission_type = 'appointment_set'
       and payment_status = 'pending';
  end if;

  -- The lead it LEFT may no longer qualify. Earned -> pending only; a paid
  -- row is history and stays exactly as it is.
  if tg_op = 'UPDATE' and old.lead_id is not null and old.lead_id is distinct from new.lead_id then
    if not exists (select 1 from public.quotes where lead_id = old.lead_id and id <> new.id) then
      update public.lead_commissions
         set payment_status = 'pending'
       where company_id = new.company_id
         and lead_id = old.lead_id
         and commission_type = 'appointment_set'
         and payment_status = 'earned';
    end if;
  end if;

  perform set_config('jobscout.trusted_write', '', true);
  return new;
end;
$$;

drop trigger if exists quotes_promote_setter_commissions on public.quotes;
create trigger quotes_promote_setter_commissions
  after insert or update of lead_id on public.quotes
  for each row execute function public.promote_setter_commissions_on_quote();
