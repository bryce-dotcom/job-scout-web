-- =====================================================================
-- arnie_brief_subscriptions: who wants the morning brief pushed, how, when.
--
-- The daily brief (query_daily_brief) is pull: you open the app and ask.
-- An owner who has to remember to ask is not getting the value. This is
-- the opt-in for having it sent — email or SMS — at an hour in THEIR
-- zone, one row per employee.
--
-- Sending is done by the arnie-brief-push edge function, called hourly
-- by a Vercel cron with the service role key (see api/cron/). Not pg_cron:
-- 20260821120000 records how a pg_cron job with no auth header failed
-- silently for two months once verify_jwt flipped, and 835 estimates went
-- unchased. The cron lives where a non-2xx is visible.
-- =====================================================================

create table if not exists public.arnie_brief_subscriptions (
  id            serial primary key,
  company_id    integer not null references public.companies(id) on delete cascade,
  employee_id   integer not null references public.employees(id) on delete cascade,
  enabled       boolean not null default true,
  channel       text not null default 'email' check (channel in ('email', 'sms')),
  hour_local    integer not null default 6 check (hour_local between 0 and 23),
  timezone      text not null default 'America/Denver',
  weekdays_only boolean not null default true,
  last_sent_on  date,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id)
);

create index if not exists arnie_brief_subscriptions_due_idx
  on public.arnie_brief_subscriptions (enabled, hour_local) where enabled;

alter table public.arnie_brief_subscriptions enable row level security;

do $$ begin
  create policy tenant_isolation on public.arnie_brief_subscriptions
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- The trial read-only gate, as every table born after 20260722 must ask for.
do $$ begin
  create policy require_writable_ins on public.arnie_brief_subscriptions
    as restrictive for insert to authenticated with check (public.company_can_write(company_id));
  create policy require_writable_upd on public.arnie_brief_subscriptions
    as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id));
  create policy require_writable_del on public.arnie_brief_subscriptions
    as restrictive for delete to authenticated using (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;

-- A person edits their OWN subscription. Anyone else's needs an admin —
-- signing a colleague up for 6am texts is not a thing a tech gets to do.
create or replace function public.guard_brief_subscription_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  me integer;
begin
  if jwt_email is null then return coalesce(new, old); end if;           -- service role / cron
  if public.current_user_access_level() >= 3 then return coalesce(new, old); end if;
  select id into me from public.employees where lower(email) = lower(jwt_email) and company_id = coalesce(new.company_id, old.company_id) limit 1;
  if me is null or me is distinct from coalesce(new.employee_id, old.employee_id) then
    raise exception 'You can change your own morning-brief settings; someone else''s needs an admin.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_brief_subscription_owner on public.arnie_brief_subscriptions;
create trigger guard_brief_subscription_owner
  before insert or update or delete on public.arnie_brief_subscriptions
  for each row execute function public.guard_brief_subscription_owner();

notify pgrst, 'reload schema';
