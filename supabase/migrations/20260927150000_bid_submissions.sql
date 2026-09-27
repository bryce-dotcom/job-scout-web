-- =====================================================================
-- Phase 2 of Sal → Benny: the builder bridge (SAL_SCOUT_PLAN.md §4.4, §5.6, §5.7).
--
-- A chosen opportunity becomes a redlined bid (Phase 1), and from here a
-- complete packet: the buyer's checklist read out of the package, the bid
-- form, a cover letter and qualification statement, the buyer's own forms
-- filled, the certificates, one merged PDF. Phase 3 sends it.
--
--   bid_submissions          what will go out, how, and (Phase 3) what happened.
--                            One live row per opportunity; a bid built from
--                            the upload card has no opportunity, so the
--                            column is nullable and quote_id is the anchor.
--   quotes.bid_opportunity_id the estimate page shows the opportunity card;
--                            the board shows the bid's readiness.
--   benny_jobs.extra_paths   a package is bid form + specs + addenda: Benny
--                            reads them together (§5.6.1).
--   benny_jobs.stage         gains 'requirements' (§5.6.2), after write.
-- =====================================================================

create table if not exists public.bid_submissions (
  id                  bigserial primary key,
  company_id          integer not null references public.companies(id) on delete cascade,
  opportunity_id      bigint references public.bid_opportunities(id) on delete set null,
  quote_id            integer not null references public.quotes(id) on delete cascade,
  method              text,                                        -- email | portal | mail | buildingconnected | planhub
  packet              jsonb not null default '[]'::jsonb,          -- [{ kind, file_name, storage_path, bucket, bytes, built_at }]
  packet_built_at     timestamptz,
  cover_letter        text,
  checklist           jsonb not null default '[]'::jsonb,          -- [{ key, item, required, kind, page, auto, done, done_by, done_at, waived_reason }]
  approved_by         text,
  approved_at         timestamptz,
  approval_text       text,
  signed_document_id  bigint,
  sent_to             jsonb,
  sent_at             timestamptz,
  email_id            text,
  delivery_status     text,
  bounce_reason       text,
  confirmation        jsonb,
  status              text not null default 'draft',
  outcome             text,
  award_amount        numeric,
  low_bid_amount      numeric,
  outcome_notes       text,
  outcome_at          timestamptz,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

do $$ begin
  alter table public.bid_submissions add constraint bid_submissions_status_check
    check (status in ('draft', 'approved', 'sent', 'delivered', 'bounced', 'confirmed', 'withdrawn'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.bid_submissions add constraint bid_submissions_method_check
    check (method is null or method in ('email', 'portal', 'mail', 'buildingconnected', 'planhub'));
exception when duplicate_object then null; end $$;

-- One live submission per opportunity, and one per bid.
create unique index if not exists bid_submissions_live_opportunity_idx
  on public.bid_submissions (opportunity_id) where status <> 'withdrawn' and opportunity_id is not null;
create unique index if not exists bid_submissions_live_quote_idx
  on public.bid_submissions (quote_id) where status <> 'withdrawn';

alter table public.bid_submissions enable row level security;

do $$ begin
  create policy tenant_isolation on public.bid_submissions
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy require_writable_ins on public.bid_submissions
    as restrictive for insert to authenticated with check (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy require_writable_upd on public.bid_submissions
    as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy require_writable_del on public.bid_submissions
    as restrictive for delete to authenticated using (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;

-- The bid knows its opportunity.
alter table public.quotes add column if not exists bid_opportunity_id bigint references public.bid_opportunities(id) on delete set null;
create index if not exists quotes_bid_opportunity_idx on public.quotes (bid_opportunity_id) where bid_opportunity_id is not null;

-- Benny reads the whole package, and reads its requirements after the bid is written.
alter table public.benny_jobs add column if not exists extra_paths jsonb not null default '[]'::jsonb;
alter table public.benny_jobs drop constraint if exists benny_jobs_stage_check;
alter table public.benny_jobs add constraint benny_jobs_stage_check
  check (stage in ('read', 'takeoff', 'match', 'price', 'write', 'requirements', 'done', 'failed'));
