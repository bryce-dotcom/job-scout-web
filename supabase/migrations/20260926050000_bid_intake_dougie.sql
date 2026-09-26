-- =====================================================================
-- Bids read from the buyer's own package, priced from the catalog or
-- sourced by AI — and a sourced price nobody has verified stops a bid.
--
-- Bryce, 2026-09-25: "build it all". The design he set the same day: an AI
-- reads a customer's bid document and builds the bid in THEIR required
-- format, with a three-way product match (exact / equivalent-with-
-- justification / must-source) and AI-sourced prices that land redlined
-- until a human ticks "verified" with a source link. A bid is a document
-- you are bound by, so an unverified sourced price BLOCKS the send; an
-- estimate or proposal only warns (lib/documentVocabulary.unverifiedSendRule).
--
-- The reader is Dougie — the document reader that already exists — not a
-- new agent. He gets an agents row here so a company can recruit him and
-- find him under Estimates.
-- =====================================================================

-- ---- quote_lines: where a price came from, and whether a human stands behind it
alter table public.quote_lines
  add column if not exists price_source      text,
  add column if not exists sourced_price     numeric,
  add column if not exists source_url        text,
  add column if not exists source_note       text,
  add column if not exists price_verified_at timestamptz,
  add column if not exists price_verified_by text,
  add column if not exists match_kind        text,
  add column if not exists match_note        text,
  add column if not exists bid_item_no       text,
  add column if not exists bid_spec          text;

do $$ begin
  alter table public.quote_lines
    add constraint quote_lines_price_source_check
    check (price_source is null or price_source in ('catalog', 'manual', 'ai_sourced'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quote_lines
    add constraint quote_lines_match_kind_check
    check (match_kind is null or match_kind in ('exact', 'equivalent', 'must_source'));
exception when duplicate_object then null; end $$;

comment on column public.quote_lines.price_source is
  'catalog = a products_services price; manual = a person typed it; ai_sourced = Dougie estimated it from market knowledge and it is unverified until price_verified_at is set';
comment on column public.quote_lines.price_verified_at is
  'A human confirmed the sourced price against source_url. Null on an ai_sourced line = redlined; a bid cannot be sent with one (send-estimate refuses).';
comment on column public.quote_lines.match_kind is
  'How Dougie matched the buyer''s item: exact catalog product, an equivalent with match_note saying why, or must_source (nothing in the catalog).';

-- The send gate reads this per estimate, so it should not scan the table.
create index if not exists quote_lines_unverified_sourced_idx
  on public.quote_lines (quote_id)
  where price_source = 'ai_sourced' and price_verified_at is null;

-- ---- quotes: the buyer's format, as Dougie read it
alter table public.quotes
  add column if not exists bid_intake jsonb;

comment on column public.quotes.bid_intake is
  'What Dougie read from the buyer''s bid package: title, bid number, buyer, due date, submission instructions, schedule sections, columns, and the source document path. The bid presentation mode renders from this.';

-- ---- Dougie becomes a recruitable agent
insert into public.agents (slug, name, title, full_name, tagline, description, icon, trade_category, ai_capabilities, price_monthly, price_yearly, is_free, status, display_order)
select 'dougie-docs', 'Dougie', 'Document Reader', 'Dougie The Document Reader',
       'Reads the buyer''s bid package and builds the bid.',
       'Drop in an invitation to bid — the PDF the agency or GC sent — and Dougie reads the schedule of items, matches each one to your catalog (exact, an equivalent with his reasoning, or flagged to source), prices what he can, and builds the bid in the buyer''s format. Anything he had to source lands redlined until someone on your team verifies it with a link. He also reads handwritten lighting takeoff forms for Lenard.',
       'FileSearch', 'all',
       array['Reads bid packages (PDF or photos)','Three-way catalog match with reasoning','Sourced prices redlined until verified','Bid schedule in the buyer''s format','Handwritten takeoff forms for Lenard']::text[],
       0, 0, true, 'active', 95
where not exists (select 1 from public.agents where slug = 'dougie-docs');
