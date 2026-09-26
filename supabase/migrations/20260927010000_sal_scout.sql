-- =====================================================================
-- Sal The Solicitation Scout — Phase 0.
--
-- Bryce, 2026-09-26: finding projects to bid on is marketing, so the finder
-- is his own named agent, recruited like Freddy and Frankie, and he sits
-- under Marketing the way Benny sits under Estimates. Benny stays the
-- builder; Sal finds the work and drops it on him.
--
-- Phase 0 is the plumbing every later phase stands on: Sal's agents row,
-- and the inbox that receives what the procurement portals email to a
-- tenant's signed bids+<token>@appsannex.com address. No portal offers an
-- API and every one forbids scraping, so email alerts ARE the feed
-- (SAL_SCOUT_PLAN.md §3). Nothing here parses or scores yet — a row lands
-- with its attachments in storage, visible on Sal's Inbox tab, so that an
-- alert can never disappear the way estimate replies once did.
-- =====================================================================

-- ---- Sal becomes a recruitable agent
insert into public.agents (slug, name, title, full_name, tagline, description, icon, trade_category, ai_capabilities, price_monthly, price_yearly, is_free, status, display_order)
select 'sal-scout', 'Sal', 'Solicitation Scout', 'Sal The Solicitation Scout',
       'Finds the bids worth your week and hands them to Benny.',
       'Point every procurement portal''s alerts at Sal''s address and he reads what arrives — Bonfire, the Arizona Procurement Portal, OpenGov, BidNet, DemandStar, PlanHub, GC invitations — plus SAM.gov for federal work. He scores each solicitation against what you do, where you work, and what you can bond, and shows you the ones worth a look. You choose; Sal makes the lead, puts the deadlines on the calendar, and drops the package on Benny to build the bid. He never logs into a portal and never scrapes one.',
       'Radar', 'all',
       array['Reads portal email alerts and SAM.gov','Scores fit against your profile','Deadlines on the calendar','Hands chosen bids to Benny','Never scrapes a portal']::text[],
       39.99, 399.00, false, 'active', 29
where not exists (select 1 from public.agents where slug = 'sal-scout');

-- ---- The inbox: one row per email that reached a tenant's bids+ address
create table if not exists public.bid_inbox (
  id            bigserial primary key,
  company_id    integer not null references public.companies(id) on delete cascade,
  email_id      text,                       -- the provider's id (Resend); null for other providers
  from_email    text,
  subject       text,
  text_body     text,
  html_body     text,                       -- kept: alert links live in the anchors
  received_at   timestamptz not null default now(),
  attachments   jsonb not null default '[]'::jsonb,  -- [{ name, content_type, size, bucket, storage_path, fetched_at | error }]
  status        text not null default 'received',
  error         text,
  opportunity_ids bigint[] not null default '{}',  -- filled by Sal's parser (Phase 1)
  raw           jsonb,
  created_at    timestamptz not null default now()
);

do $$ begin
  alter table public.bid_inbox
    add constraint bid_inbox_status_check
    check (status in ('received', 'parsed', 'failed', 'ignored'));
exception when duplicate_object then null; end $$;

comment on table public.bid_inbox is
  'Every email that reached a tenant''s signed bids+<token>@ address (procurement portal alerts, forwarded GC invitations). Sal''s parser turns rows into bid_opportunities; a row that cannot be parsed stays visible on his Inbox tab rather than vanishing.';

-- A provider retries a webhook for days; the same email must land once.
create unique index if not exists bid_inbox_company_email_idx
  on public.bid_inbox (company_id, email_id) where email_id is not null;
create index if not exists bid_inbox_company_received_idx
  on public.bid_inbox (company_id, received_at desc);

alter table public.bid_inbox enable row level security;

do $$ begin
  create policy tenant_isolation on public.bid_inbox
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- The trial read-only gate (20260722000000) was applied by looping over the
-- tables that existed that day. A table born later has to ask for it.
do $$ begin
  create policy require_writable_ins on public.bid_inbox
    as restrictive for insert to authenticated with check (public.company_can_write(company_id));
  create policy require_writable_upd on public.bid_inbox
    as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id));
  create policy require_writable_del on public.bid_inbox
    as restrictive for delete to authenticated using (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;

-- ---- Recruit Sal for the demo tenant (company 25) so the storefront and
-- the live proof have him. HHH (company 3) switches him on when they are
-- ready to point their portal alerts at him — never test data there.
insert into public.company_agents (company_id, agent_id, subscription_status)
select 25, a.id, 'active' from public.agents a
 where a.slug = 'sal-scout'
   and exists (select 1 from public.companies where id = 25)
   and not exists (select 1 from public.company_agents ca where ca.company_id = 25 and ca.agent_id = a.id);

insert into public.ai_modules (company_id, module_name, display_name, description, icon, status, default_menu_section, default_menu_parent, sort_order, route_path)
select 25, 'sal', 'Sal - Solicitation Scout',
       'Reads procurement portal alerts and SAM.gov, scores the fit, hands chosen bids to Benny',
       'Radar', 'active', 'SALES_FLOW', 'Marketing', 29, '/agents/sal'
 where exists (select 1 from public.companies where id = 25)
   and not exists (select 1 from public.ai_modules where company_id = 25 and module_name = 'sal');
