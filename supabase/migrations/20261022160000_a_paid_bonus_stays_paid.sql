-- A bonus carrying a paid date cannot read as owed.
--
-- TWICE NOW. On 2026-10-20 eighty-two rows worth $18,577.03 carried a
-- paid_at and still read as owed; they were restored by hand. This morning
-- the morning sweep found eighty-eight worth $22,111.52 in exactly the same
-- state. Two days.
--
-- WHAT THE EVIDENCE SAYS. The survivors name the culprit's SHAPE precisely:
-- every one of the 88 still carries paid_by, 47 still carry the pay period,
-- and 20 still name payroll run #13 — the links written by hand on 10-20.
-- Only `status` moved. That is the upsert payload shared by
-- syncJobBonuses and api/cron/resync-bonuses: it writes status and never
-- touches paid_at, paid_by or paid_payroll_run_id.
--
-- Both of those freeze a paid row, and both freezes are on main and correct.
-- No duplicate (job_id, employee_id) keys exist to mask one. So the write
-- that un-paid them is one this repository can no longer point at — an older
-- deploy, a hand-run resync, a script. Which is the whole problem: the
-- ledger can be put into a state nothing admits to causing, it is silent,
-- and it is worth twenty thousand dollars of somebody's pay reading wrong.
--
-- So stop looking for the writer and make the state unreachable.
--
-- WHY A TRIGGER THAT CORRECTS, NOT A CHECK THAT REFUSES. A CHECK constraint
-- would be louder, and it would also kill the nightly resync for EVERY
-- tenant the first time it fired, mid-batch, at nine in the morning. The
-- money matters more than the diagnosis: this lets the write through with
-- the status held, so the ledger cannot drift and nothing breaks. The
-- warning goes to the Postgres log, and the morning sweep counts these —
-- if it ever reports one again, this trigger was bypassed.
--
-- Clearing paid_at IS still allowed, because that is a person deliberately
-- reopening a bonus (Payroll's "Reopen these paid bonuses" writes
-- status='accrued' AND paid_at=null together). Both move or neither does.

create or replace function public.keep_a_paid_bonus_paid()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'paid'
     and new.status is distinct from 'paid'
     and new.paid_at is not null then
    raise warning 'job_bonuses %: refused to move a bonus off paid while it still carries a paid date (%). Status held.', old.id, new.paid_at;
    new.status := 'paid';
  end if;
  return new;
end $$;

comment on function public.keep_a_paid_bonus_paid() is
  'A bonus with a paid_at cannot read as owed. Reopening is still allowed — clear paid_at in the same write. See 20261022160000.';

drop trigger if exists job_bonuses_keep_paid on public.job_bonuses;
create trigger job_bonuses_keep_paid
  before update on public.job_bonuses
  for each row execute function public.keep_a_paid_bonus_paid();

-- The 88 already in that state. Bryce's rule, twice stated: if the invoice
-- was paid the bonus was paid — and a paid_at is the record of it going out,
-- whether through a payroll run or by hand afterwards. Only status moves;
-- every other stamp on these rows is already right.
update public.job_bonuses
   set status = 'paid', updated_at = now()
 where paid_at is not null and status <> 'paid';
