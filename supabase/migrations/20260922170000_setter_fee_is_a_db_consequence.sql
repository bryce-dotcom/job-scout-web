-- A setter's fee is a consequence of the appointment, not a side effect of
-- the page that booked it.
--
-- Tracy (0d53fc00): "Setter Commissions not tracking all Leads. 5 will payout
-- of 9 for Sep 1-15." The $75 row was written by app code
-- (lib/bookAppointment.js, formerly inline in LeadSetter) inside a
-- try/catch that only console.logs. Whenever that insert did not land — a
-- refused write, a dropped connection, a booking made by some other path —
-- the appointment was created, the lead said Tracy set it, and the pay row
-- simply never existed. Nobody could see the difference afterwards: there is
-- no record of a row that was never written. 31 appointments across three
-- setters are in that state, back to March.
--
-- So the row moves into the database, beside the appointment that earns it:
--   * one row per APPOINTMENT (today's behaviour — 3 leads legitimately
--     carry two fees from two bookings; keying on the lead would have
--     quietly changed pay)
--   * the setter's own configured rate, then the company default, then $25 —
--     the same ladder the app used
--   * idempotent, so re-running or a second write path cannot double-pay
--   * under the quote_created rule, a lead that ALREADY has a quote earns at
--     once. The promote trigger only fires when a quote is written, so an
--     appointment booked after the quote left the fee pending forever (2 of
--     Tracy's 6 stuck rows).
--
-- lib/bookAppointment.js drops its own insert in the same commit; this is now
-- the only writer of an appointment_set row.

create or replace function public.setter_fee_for_appointment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric;
  v_type text;
  v_rule text;
  v_has_quote boolean;
begin
  if new.setter_id is null or new.lead_id is null then return new; end if;

  -- Already recorded for this appointment (the trigger re-running, or an
  -- older row written by the app before this migration).
  if exists (
    select 1 from public.lead_commissions
    where appointment_id = new.id and commission_type = 'appointment_set'
  ) then
    return new;
  end if;

  select e.commission_setter_rate, e.commission_setter_type
    into v_rate, v_type
    from public.employees e where e.id = new.setter_id;
  if coalesce(v_rate, 0) <= 0 then
    select c.setter_pay_per_appointment into v_rate from public.companies c where c.id = new.company_id;
  end if;
  v_rate := coalesce(nullif(v_rate, 0), 25);
  if v_rate <= 0 then return new; end if;

  select c.setter_qualification_rule into v_rule from public.companies c where c.id = new.company_id;
  select exists (select 1 from public.quotes q where q.lead_id = new.lead_id and q.company_id = new.company_id)
    into v_has_quote;

  insert into public.lead_commissions (
    company_id, lead_id, appointment_id, commission_type, employee_id,
    amount, rate_type, payment_status
  ) values (
    new.company_id, new.lead_id, new.id, 'appointment_set', new.setter_id,
    v_rate, coalesce(v_type, 'flat'),
    case when v_rule is distinct from 'quote_created' then 'pending'
         when v_has_quote then 'earned'
         else 'pending' end
  );
  return new;
end $$;

drop trigger if exists appointments_setter_fee on public.appointments;
create trigger appointments_setter_fee
  after insert or update of setter_id on public.appointments
  for each row execute function public.setter_fee_for_appointment();

-- The rows the promote trigger could never reach: a quote exists on the
-- lead, the company pays on quote_created, and the fee is still pending.
-- This is that trigger's own rule, applied to what it missed.
update public.lead_commissions c
   set payment_status = 'earned'
 where c.commission_type = 'appointment_set'
   and c.payment_status = 'pending'
   and exists (select 1 from public.companies co where co.id = c.company_id and co.setter_qualification_rule = 'quote_created')
   and exists (select 1 from public.quotes q where q.lead_id = c.lead_id and q.company_id = c.company_id);
