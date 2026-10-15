-- Nobody edits somebody else's hours, and nobody edits a finished shift.
--
-- Bryce, 2026-10-15, about London Miller's time on Intercon Furniture Final:
-- "we are wondering how this happened and if there is a loophole where he can
-- change his hours."
--
-- On that job he had not: nine entries, 74.70 hours, and the only two
-- adjustments were Alayda's, both with a reason, net 13.86 hours REMOVED.
--
-- But the loophole is real and wider than the question. Tested as London
-- himself (a Manager, not an admin) against live permissions, all three were
-- ALLOWED:
--
--   * editing his own hours        (a row went from 9.1 to 14.1)
--   * editing ANOTHER employee's hours
--   * inserting a backdated shift for himself
--
-- time_clock carried only tenant_isolation (same company) and the trial
-- read-only gate. Nothing said "your own row", nothing said "not after it is
-- closed", and nothing forced adjusted_by — so a direct REST write left no
-- trace at all, reachable from a browser console by anyone with a login. The
-- 25 intra-tenant guard triggers cover privilege and pay columns; this table
-- was missed.
--
-- THE RULE
--
--   you                 may insert your own shift, and may change or delete it
--                       while it is still OPEN (that is the clock-out, and the
--                       missed-clock-out sheet closing yesterday's shift)
--   a payroll admin     may change anything in their company, which is how a
--                       forgotten clock-out gets fixed the day after
--   everyone else       nothing
--
-- and every change to the times is stamped, whoever makes it.
--
-- SAFE FOR THE CREW: the clock-in button writes to this table as the signed-in
-- user, so a wrong rule here stops the field clocking in. Checked first — 22 of
-- HHH's 25 active employees match a login by email, and the other 3 have no
-- auth user at all, so they cannot write either way; their time is entered by
-- an admin, who stays allowed. Edge functions and scripts use the service
-- role, which bypasses RLS entirely and is untouched.

-- Who the caller is, as an employee row. Null for the service role, which
-- never reaches a restrictive policy anyway.
create or replace function public.current_employee_id()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select e.id
    from public.employees e
   where e.active = true
     and lower(coalesce(e.email, '')) <> ''
     and lower(e.email) = lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''))
   limit 1;
$$;

-- A payroll admin of this company, or a platform developer.
--
-- This is the same predicate can_see_employee_private uses for the identity
-- table. It is written twice on purpose for now: that function is an hour old,
-- guards SSNs and bank numbers, and another session is working in it. The two
-- must move together — if the definition of a payroll admin changes, change it
-- in both.
create or replace function public.is_payroll_admin_of(p_company_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.employees c
     where c.active = true
       and lower(c.email) = lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''))
       and ( c.is_developer = true
             or ( c.company_id = p_company_id
                  and ( c.has_hr_access = true
                        or c.is_admin = true
                        or coalesce(c.user_role, '') in ('Admin', 'Owner', 'Super Admin', 'Developer') ) ) )
  );
$$;

comment on function public.is_payroll_admin_of(integer) is
  'Payroll admin of that company, or a platform developer. Mirrors the admin half of can_see_employee_private — change both together.';

-- RESTRICTIVE, so it ANDs with the policies already there rather than adding
-- another way in. The existing tenant_isolation and trial read-only gate still
-- have to pass as well.
drop policy if exists time_clock_own_rows_ins on public.time_clock;
create policy time_clock_own_rows_ins on public.time_clock
as restrictive for insert to authenticated
with check (
  public.is_payroll_admin_of(company_id)
  or employee_id = public.current_employee_id()
);

drop policy if exists time_clock_own_rows_upd on public.time_clock;
create policy time_clock_own_rows_upd on public.time_clock
as restrictive for update to authenticated
-- USING reads the row as it stands: your own, and still open.
using (
  public.is_payroll_admin_of(company_id)
  or (employee_id = public.current_employee_id() and clock_out is null)
)
-- WITH CHECK reads the row you are writing: you cannot hand your shift to
-- somebody else, or move it into another company.
with check (
  public.is_payroll_admin_of(company_id)
  or employee_id = public.current_employee_id()
);

drop policy if exists time_clock_own_rows_del on public.time_clock;
create policy time_clock_own_rows_del on public.time_clock
as restrictive for delete to authenticated
using (
  public.is_payroll_admin_of(company_id)
  or (employee_id = public.current_employee_id() and clock_out is null)
);

-- Every change to the times leaves a trail, by whatever route.
--
-- adjusted_by was only ever filled because the admin screen filled it. A write
-- straight to the API left the audit columns null and the row looking
-- untouched, which is the part that made "how did this happen" unanswerable.
create or replace function public.stamp_time_clock_adjustment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_changed boolean;
begin
  v_changed := (new.clock_in is distinct from old.clock_in)
            or (new.clock_out is distinct from old.clock_out)
            or (new.total_hours is distinct from old.total_hours)
            or (new.lunch_start is distinct from old.lunch_start)
            or (new.lunch_end is distinct from old.lunch_end);

  if not v_changed then
    return new;
  end if;

  -- Closing an open shift is the clock-out, not an adjustment. Stamping it
  -- would mark every normal day as edited and make the real edits invisible.
  if old.clock_out is null and new.clock_out is not null
     and new.clock_in is not distinct from old.clock_in then
    return new;
  end if;

  -- The FIRST original is the one worth keeping; a second edit must not
  -- overwrite what the row said before anybody touched it.
  if new.original_clock_in is null and old.original_clock_in is null then
    new.original_clock_in := old.clock_in;
    new.original_clock_out := old.clock_out;
    new.original_total_hours := old.total_hours;
  end if;

  -- Only fill the actor when the caller did not. An admin screen that records
  -- who it was, and why, keeps its own answer.
  if new.adjusted_by is not distinct from old.adjusted_by then
    new.adjusted_by := coalesce(public.current_employee_id(), new.adjusted_by);
  end if;
  if new.adjusted_at is not distinct from old.adjusted_at then
    new.adjusted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_time_clock_adjustment on public.time_clock;
create trigger stamp_time_clock_adjustment
before update on public.time_clock
for each row execute function public.stamp_time_clock_adjustment();
-- An employee may only START a shift, not file a finished one.
--
-- The first version only checked "is it your row", so a backdated INSERT
-- carrying clock_out and total_hours walked straight through: a whole invented
-- day in one statement. Closing it is the clock-out, which is a separate,
-- stamped UPDATE.
--
-- The 12-hour floor is for a phone that clocked in offline and synced later —
-- field crews lose signal, and a rule that rejects their morning because the
-- van had no bars is a rule that gets switched off. Anything older, or any
-- shift that arrives already finished, is a payroll admin's to enter.
drop policy if exists time_clock_own_rows_ins on public.time_clock;
create policy time_clock_own_rows_ins on public.time_clock
as restrictive for insert to authenticated
with check (
  public.is_payroll_admin_of(company_id)
  or (
    employee_id = public.current_employee_id()
    and clock_out is null
    and coalesce(total_hours, 0) = 0
    and clock_in >= now() - interval '12 hours'
    and clock_in <= now() + interval '15 minutes'
  )
);
