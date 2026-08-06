-- =====================================================================
-- Arnie config customization — Tier A (see ARCHITECTURE.md §9).
--
-- The audit trail behind "tell Arnie what to change and he sets it up":
-- propose → approve → apply (versioned) → audit → rollback. Arnie only ever
-- writes a *proposal* row here; a deterministic edge function applies the
-- approved change to the real config tables (settings / company_agents).
-- No LLM-generated code ever runs against the shared runtime.
-- =====================================================================
create table if not exists public.arnie_proposals (
  id            bigserial primary key,
  company_id    integer     not null references public.companies(id) on delete cascade,
  created_by    text,                         -- email of the admin who asked
  request_text  text,                         -- the natural-language request
  target        text        not null,         -- 'business_units' | 'lead_sources' | 'service_types'
  action        text        not null,         -- 'add' | 'rename' | 'remove'
  payload       jsonb       not null,          -- { value, newValue? }
  summary       text,                          -- human-readable one-liner
  before_value  jsonb,                         -- config value BEFORE apply (rollback source)
  after_value   jsonb,                         -- config value AFTER apply
  status        text        not null default 'pending', -- pending|applied|rejected|rolled_back|failed
  decided_by    text,                          -- admin who approved/rejected
  error         text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

create index if not exists arnie_proposals_company_idx
  on public.arnie_proposals(company_id, created_at desc);

alter table public.arnie_proposals enable row level security;
alter table public.arnie_proposals force row level security;

-- Company members see their own company's proposals (the UI further limits
-- the create/approve actions to admins). Applying runs on the service role
-- (edge function), which bypasses RLS.
do $$ begin
  create policy tenant_isolation on public.arnie_proposals
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;
