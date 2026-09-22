-- Where a draft came from. Null = a person talking to Arnie, which is
-- everything until now and everything that should count on the owner's
-- "Arnie at work" screen.
--
-- The nightly eval drafts ~60 cards against the demo tenant and rejects or
-- rolls back every one of them, so the demo's approval rate read 6% — on
-- the screen a prospect is shown. The harness stamps its own rows 'eval'
-- and the panel leaves them out.
alter table public.arnie_proposals add column if not exists source text;
comment on column public.arnie_proposals.source is
  'Null for a real conversation. ''eval'' for rows the nightly harness made; the Arnie-at-work panel excludes those.';
create index if not exists arnie_proposals_company_source_idx on public.arnie_proposals (company_id, source, created_at desc);
