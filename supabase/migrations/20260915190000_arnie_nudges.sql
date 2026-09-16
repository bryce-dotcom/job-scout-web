-- Arnie's nudges: the tap on the shoulder BETWEEN morning briefs.
--
-- The brief goes out once a day at the hour a person picks. Some things
-- should not wait for tomorrow morning: a quote that has now been quiet
-- ten days, an invoice that tipped overdue yesterday, a shift still open
-- at nine at night. arnie-nudge (Vercel cron, hourly, service role) finds
-- them and sends one message per person per hour — never the same item
-- twice, which is what this table is for.
--
-- Opt-out lives on the brief subscription (nudges), so one screen controls
-- both. A person with no subscription gets no nudges; the brief's channel
-- and timezone are the nudge's channel and timezone.

alter table public.arnie_brief_subscriptions
  add column if not exists nudges boolean not null default true;

create table if not exists public.arnie_nudges (
  id           serial primary key,
  company_id   integer not null references public.companies(id) on delete cascade,
  employee_id  integer not null references public.employees(id) on delete cascade,
  kind         text not null check (kind in ('quiet_quote', 'overdue_invoice', 'open_shift')),
  -- What was nudged about, so it is nudged about once: the quote id and its
  -- follow-up count (a quote that goes quiet AGAIN after a follow-up earns
  -- another nudge), the invoice id, the time_clock id.
  ref_key      text not null,
  channel      text not null check (channel in ('email', 'sms')),
  text         text,
  sent_at      timestamptz not null default now(),
  error        text,
  unique (employee_id, kind, ref_key)
);

create index if not exists arnie_nudges_company_sent on public.arnie_nudges (company_id, sent_at desc);

alter table public.arnie_nudges enable row level security;

-- Read your own tenant's; only the cron (service role) writes.
do $$ begin
  create policy tenant_read on public.arnie_nudges
    for select to authenticated
    using (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

comment on table public.arnie_nudges is
  'One row per nudge Arnie sent (or failed to send) between briefs. unique(employee_id, kind, ref_key) is the dedupe: the cron never nudges the same person about the same thing twice.';

notify pgrst, 'reload schema';
