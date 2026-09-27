-- =====================================================================
-- Benny builds in stages, and the work in progress lives here.
--
-- Bryce, 2026-09-26, with a real 8-sheet house plan: "bid the electrical".
-- A plan set has no bid form, so Benny takes the drawings off himself —
-- and read + takeoff + match + web pricing is four model calls of about a
-- minute each, past the 150-second wall an Edge Function worker gets. One
-- invocation cannot do it. So a build is a benny_jobs row: each stage is
-- its own request that saves what it produced and kicks the next, and
-- the person (or Sal) is answered at once and told where to look.
-- =====================================================================

create table if not exists public.benny_jobs (
  id              bigserial primary key,
  company_id      integer not null references public.companies(id) on delete cascade,
  opportunity_id  bigint references public.bid_opportunities(id) on delete set null,
  requested_by    text,
  employee_id     integer,
  mode            text not null default 'create',        -- create | fill
  quote_id        integer,                                -- fill target, then the result
  lead_id         integer,
  customer_id     integer,
  salesperson_id  integer,
  business_unit   text,
  service_type    text,
  storage_bucket  text not null default 'project-documents',
  storage_path    text not null,
  file_name       text,
  media_type      text not null default 'application/pdf',
  file_size       bigint,
  scope_hint      text,
  stage           text not null default 'read',           -- read | takeoff | match | price | write | done | failed
  state           jsonb not null default '{}'::jsonb,     -- pkg, takeoff, items, candidates, matches, found, web_searches
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);
do $$ begin
  alter table public.benny_jobs add constraint benny_jobs_stage_check
    check (stage in ('read', 'takeoff', 'match', 'price', 'write', 'done', 'failed'));
exception when duplicate_object then null; end $$;
create index if not exists benny_jobs_company_idx on public.benny_jobs (company_id, created_at desc);
create index if not exists benny_jobs_open_idx on public.benny_jobs (stage) where stage not in ('done', 'failed');
comment on table public.benny_jobs is
  'One row per bid Benny is building. stage advances read → (takeoff) → match → (price) → write → done, each stage its own Edge Function request; state carries what each stage produced. A stalled row (stage not done/failed, updated_at old) is a build that died mid-way.';

alter table public.benny_jobs enable row level security;
do $$ begin
  create policy tenant_isolation on public.benny_jobs
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy require_writable_ins on public.benny_jobs
    as restrictive for insert to authenticated with check (public.company_can_write(company_id));
  create policy require_writable_upd on public.benny_jobs
    as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id));
  create policy require_writable_del on public.benny_jobs
    as restrictive for delete to authenticated using (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;
