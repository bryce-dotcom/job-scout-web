-- A job that has been paid for should say so on the board.
--
-- Tracy (2026-10-06, from /jobs/23441): "I was under the impression that once
-- I log a payment in the clients that have been invoiced the stage
-- automatically moves to paid. I have noticed several that I have had to
-- manually move. If I am wrong I will keep moving…"
--
-- She was not wrong, and she had been moving them by hand. What exists today:
--
--   * payments has NO triggers at all
--   * the app does update invoices.payment_status when a payment is logged —
--     372 of HHH's 373 fully-paid invoices say Paid, so that half works
--   * sync_job_invoice_status then syncs jobs.INVOICE_STATUS, the badge
--
-- and nothing ever touched jobs.STATUS, the column the board groups by. So 15
-- HHH jobs sit at Verified Complete, Post Inspection or Invoiced while being
-- fully paid.
--
-- WHAT THIS DELIBERATELY WILL NOT DO
--
-- It will not drag a job forward out of the work. A job still Scheduled or In
-- Progress that takes a deposit must not jump to Paid, so only a job already
-- in a DELIVERED status moves. job_invoice_status already ignores deposit
-- invoices, so a deposit cannot report a job as paid in the first place.
--
-- It will not move a job BACKWARDS. Closed, Archived and Cancelled are past
-- Paid, and pulling a closed job back onto the board would be a regression
-- wearing a feature's clothes.
--
-- It will not invent a status. A company that has no 'Paid' stage keeps
-- whatever it has; nothing is created and nothing moves.
--
-- WHY A TRIGGER AND NOT APP CODE: every route that settles an invoice has to
-- work — the invoice page, the Stripe webhook, the payout reconciler, a
-- backfill script. An app-side insert is how the setter fee went missing for
-- months. One writer, in the database, like the badge beside it.
--
-- Checked before writing: trg_spawn_next_recurring_job fires only on the
-- transition INTO 'Completed'. This moves jobs into 'Paid', so it cannot
-- spawn a duplicate recurring visit.

create or replace function public.job_paid_stage(p_job_id integer)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_job      record;
  v_statuses jsonb;
  v_paid_id  text;
  v_is_delivered boolean;
begin
  select id, company_id, status into v_job from public.jobs where id = p_job_id;
  if v_job is null then return null; end if;

  -- Only once every non-deposit invoice on the job is settled.
  if public.job_invoice_status(p_job_id) is distinct from 'Paid' then
    return null;
  end if;

  -- Past Paid already. Never walk a job backwards onto the board.
  if lower(coalesce(v_job.status, '')) in ('paid', 'closed', 'archived', 'cancelled') then
    return null;
  end if;

  begin
    select value::jsonb into v_statuses
      from public.settings
     where company_id = v_job.company_id and key = 'job_statuses';
  exception when others then
    return null;  -- unparseable settings are not this function's problem
  end;
  if v_statuses is null then return null; end if;

  -- The company's own Paid stage, by id. Not invented, not guessed from
  -- position: a tenant without one simply does not use this.
  select s->>'id' into v_paid_id
    from jsonb_array_elements(v_statuses) s
   where lower(s->>'id') = 'paid'
   limit 1;
  if v_paid_id is null then return null; end if;

  -- The job must already be delivered. settings.job_statuses carries the
  -- category; jobs.status holds the ID, never the display name.
  select exists (
    select 1 from jsonb_array_elements(v_statuses) s
     where s->>'id' = v_job.status and s->>'category' = 'delivered'
  ) into v_is_delivered;
  if not v_is_delivered then return null; end if;

  return v_paid_id;
end;
$$;

comment on function public.job_paid_stage(integer) is
  'The status id a fully-paid job should move to, or null. Delivered jobs only, never backwards, never invented. See the migration for why.';

create or replace function public.sync_job_paid_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ids  integer[];
  jid  integer;
  want text;
begin
  -- Both sides, because an UPDATE can move an invoice between jobs.
  ids := array_remove(array[
    case when tg_op <> 'INSERT' then old.job_id end,
    case when tg_op <> 'DELETE' then new.job_id end
  ], null);

  foreach jid in array ids loop
    begin
      want := public.job_paid_stage(jid);
      if want is not null then
        update public.jobs
           set status = want
         where id = jid
           and status is distinct from want;
      end if;
    exception when others then
      -- Moving a card must never be able to roll back a payment. Same rule as
      -- sync_job_invoice_status beside it: warn, leave the board stale, and
      -- let the backfill catch it.
      raise warning 'sync_job_paid_stage: job % not moved: %', jid, sqlerrm;
    end;
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_job_paid_stage on public.invoices;
create trigger sync_job_paid_stage
after insert or update or delete on public.invoices
for each row execute function public.sync_job_paid_stage();

-- The ones Tracy has been moving by hand.
update public.jobs j
   set status = public.job_paid_stage(j.id)
 where public.job_paid_stage(j.id) is not null;
