-- =====================================================================
-- Sal The Solicitation Scout — Phase 1: the finder.
--
-- Phase 0 gave every tenant an address the portals can email and an inbox
-- that keeps what arrives. This turns what arrives into opportunities:
--   bid_profiles       what "a fit" means for this company (SAL_SCOUT_PLAN.md §4.1)
--   bid_sources        the feeds a company switched on and their health (§4.2)
--   bid_opportunities  one row per solicitation, scored, chosen, tracked (§4.3)
-- and a lead source / appointment type the rest of the app can recognise.
--
-- Rules carried from the plan: company_id + RLS + the writable gate on every
-- table from this migration; the LLM never sets a price (nothing here holds
-- one); set-aside and license eligibility are hard blocks; deadlines carry
-- the buyer's time zone. Upsert targets are PLAIN unique indexes — a partial
-- one cannot be named by ON CONFLICT (42P10), which is how Sal's first alert
-- vanished.
-- =====================================================================

-- ---- bid_profiles: one per company
create table if not exists public.bid_profiles (
  id                    bigserial primary key,
  company_id            integer not null references public.companies(id) on delete cascade,
  service_lines         jsonb not null default '[]'::jsonb,   -- [{ label, naics:[], commodity_codes:[], keywords:[], exclusions:[] }]
  service_area          jsonb not null default '{}'::jsonb,   -- { states:['UT','AZ'], home:{lat,lng}, radius_km }
  value_min             numeric,
  value_max             numeric,
  set_asides            text[] not null default '{}',          -- certifications actually held: sb, wosb, edwosb, sdvosb, vosb, 8a, hubzone, dbe
  licenses              jsonb not null default '[]'::jsonb,   -- [{ state, type, number, limit, expires }]
  bonding               jsonb not null default '{}'::jsonb,   -- { single_limit, aggregate_limit, surety_agent:{name,email,phone} }
  federal               jsonb not null default '{}'::jsonb,   -- { uei, cage, sam_expires }
  capability_statement  text,
  past_performance      jsonb not null default '[]'::jsonb,
  key_personnel         jsonb not null default '[]'::jsonb,
  signer_employee_id    integer references public.employees(id) on delete set null,
  thresholds            jsonb not null default '{"auto_dismiss_below": 30, "notify_at": 70, "due_margin_hours": 24}'::jsonb,
  learned               jsonb not null default '{}'::jsonb,
  updated_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists bid_profiles_company_idx on public.bid_profiles (company_id);
comment on table public.bid_profiles is
  'What a fit means for this company: service lines, area, size band, certifications held, licenses, bonding, federal ids, capability statement, thresholds. Read by Sal''s prefilter and fit scorer; never holds a price.';

-- ---- bid_sources: the feeds a company switched on
create table if not exists public.bid_sources (
  id              bigserial primary key,
  company_id      integer not null references public.companies(id) on delete cascade,
  kind            text not null,
  label           text not null,
  config          jsonb not null default '{}'::jsonb,   -- sam: { states:[], naics:[] } · rss: { url } · email: {} · manual: {}
  enabled         boolean not null default true,
  last_polled_at  timestamptz,
  last_item_at    timestamptz,
  health          text not null default 'ok',
  error_text      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
do $$ begin
  alter table public.bid_sources add constraint bid_sources_kind_check
    check (kind in ('sam', 'email', 'rss', 'manual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.bid_sources add constraint bid_sources_health_check
    check (health in ('ok', 'stale', 'error'));
exception when duplicate_object then null; end $$;
create index if not exists bid_sources_company_idx on public.bid_sources (company_id, kind);
comment on table public.bid_sources is
  'The feeds a company switched on: SAM.gov (official API, polled), RSS (Utah Public Notice Website bodies, Google Alerts, agency feeds), the email address (Phase 0), manual. health/error_text tell a tenant a feed went quiet.';

-- ---- bid_opportunities: one row per solicitation
create table if not exists public.bid_opportunities (
  id                    bigserial primary key,
  company_id            integer not null references public.companies(id) on delete cascade,
  source_id             bigint references public.bid_sources(id) on delete set null,
  source_kind           text not null default 'email',
  source_ref            text,                                   -- noticeId, bid_inbox id, RSS guid
  inbox_id              bigint references public.bid_inbox(id) on delete set null,
  dedupe_hash           text not null,
  url                   text,
  -- what
  title                 text not null,
  buyer                 text,
  buyer_level           text,
  solicitation_number   text,
  notice_type           text,
  summary               text,
  naics                 text[] not null default '{}',
  commodity_codes       text[] not null default '{}',
  set_aside             text,
  estimated_value_low   numeric,
  estimated_value_high  numeric,
  -- where
  place                 jsonb,
  latitude              double precision,
  longitude             double precision,
  distance_km           double precision,
  -- when
  posted_at             timestamptz,
  due_at                timestamptz,
  due_tz                text,
  questions_due_at      timestamptz,
  prebid_at             timestamptz,
  prebid_mandatory      boolean,
  amended_at            timestamptz,
  -- requirements + submission
  requirements          jsonb not null default '{}'::jsonb,
  submit_method         text,
  submit_to             jsonb,
  documents             jsonb not null default '[]'::jsonb,   -- [{ name, url, bucket, storage_path, bytes, fetched_at }]
  -- fit
  fit_score             numeric,
  fit_reasons           jsonb not null default '[]'::jsonb,
  blockers              jsonb not null default '[]'::jsonb,
  effort_estimate       text,
  scored_at             timestamptz,
  score_model           text,
  -- lifecycle
  status                text not null default 'new',
  dismissed_reason      text,
  dismissed_by          text,
  dismissed_at          timestamptz,
  chosen_by             text,
  chosen_at             timestamptz,
  lead_id               integer references public.leads(id) on delete set null,
  quote_id              integer references public.quotes(id) on delete set null,
  submission_id         bigint,
  build_error           text,
  raw                   jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
do $$ begin
  alter table public.bid_opportunities add constraint bid_opportunities_status_check
    check (status in ('new', 'shortlisted', 'dismissed', 'chosen', 'building', 'ready', 'submitted', 'won', 'lost', 'no_award', 'expired'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.bid_opportunities add constraint bid_opportunities_source_kind_check
    check (source_kind in ('sam', 'email', 'rss', 'manual'));
exception when duplicate_object then null; end $$;
-- The dedupe target. Plain, not partial (see the header).
create unique index if not exists bid_opportunities_dedupe_idx on public.bid_opportunities (company_id, dedupe_hash);
create index if not exists bid_opportunities_board_idx on public.bid_opportunities (company_id, status, due_at);
create index if not exists bid_opportunities_lead_idx on public.bid_opportunities (lead_id) where lead_id is not null;
comment on table public.bid_opportunities is
  'One row per solicitation Sal found (SAM.gov, a portal alert, an RSS notice, a pasted link). Scored against bid_profiles; a person Shortlists / Dismisses / Chooses. Choose makes the lead, the Bid Deadline appointments, and drops the package on Benny (quote_id).';
comment on column public.bid_opportunities.due_at is
  'The buyer''s deadline as an instant. due_tz keeps the zone it was written in (a 2:00 PM MST due time read as UTC is a missed bid).';

-- ---- RLS + the writable gate, all three tables
do $$ declare t text; begin
  foreach t in array array['bid_profiles', 'bid_sources', 'bid_opportunities'] loop
    execute format('alter table public.%I enable row level security', t);
    begin
      execute format($p$create policy tenant_isolation on public.%I for all to authenticated
        using (company_id in (select public.current_user_company_ids()))
        with check (company_id in (select public.current_user_company_ids()))$p$, t);
    exception when duplicate_object then null; end;
    begin
      execute format($p$create policy require_writable_ins on public.%I as restrictive for insert to authenticated with check (public.company_can_write(company_id))$p$, t);
    exception when duplicate_object then null; end;
    begin
      execute format($p$create policy require_writable_upd on public.%I as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id))$p$, t);
    exception when duplicate_object then null; end;
    begin
      execute format($p$create policy require_writable_del on public.%I as restrictive for delete to authenticated using (public.company_can_write(company_id))$p$, t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ---- The demo tenant gets a profile and its SAM source so the board is not
-- empty on the storefront. Company 25 is Denver-based (Summit Field Co).
insert into public.bid_profiles (company_id, service_lines, service_area, value_min, value_max, set_asides, capability_statement)
select 25,
  '[{"label":"Commercial lighting retrofit","naics":["238210"],"commodity_codes":["285","28500"],"keywords":["lighting","LED","retrofit","fixture","luminaire","electrical"],"exclusions":["traffic signal","runway"]},
    {"label":"Janitorial / custodial","naics":["561720"],"commodity_codes":["910","91039"],"keywords":["janitorial","custodial","cleaning","floor care"],"exclusions":["hazardous"]}]'::jsonb,
  '{"states":["CO","UT"],"radius_km":250}'::jsonb,
  5000, 750000, array['sb'],
  'Summit Field Co is a licensed commercial electrical and facilities contractor serving the Front Range since 2014: LED lighting retrofits, controls, and janitorial programs for schools, municipalities, and property managers.'
where exists (select 1 from public.companies where id = 25)
  and not exists (select 1 from public.bid_profiles where company_id = 25);

insert into public.bid_sources (company_id, kind, label, config)
select 25, 'sam', 'SAM.gov — CO and UT', '{"states":["CO","UT"],"naics":["238210","561720"]}'::jsonb
where exists (select 1 from public.companies where id = 25)
  and not exists (select 1 from public.bid_sources where company_id = 25 and kind = 'sam');
