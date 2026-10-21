-- The weekly Arnie review (Bryce, 2026-10-21): every time the fact-check
-- catches him claiming something no tool did — a card, an email, a figure, a
-- step on their computer — is kept here, with what was asked and what he tried
-- to say. Until now it went to the function log and nowhere else, so nobody
-- saw the pattern until a person had already been sent down a rabbit hole.
--
-- Written by arnie-chat with the service key; read by api/cron/arnie-review.js
-- with the service key. RLS on with no policies: no signed-in user reads or
-- writes it directly.
create table if not exists public.arnie_review_events (
  id bigserial primary key,
  company_id bigint references public.companies(id) on delete cascade,
  employee_email text,
  kind text not null,          -- card | memory | email | computer | figures
  shown boolean not null default false,  -- false = held and replaced before anyone read it
  said text,                   -- what the person asked
  reply text,                  -- what he tried to say
  created_at timestamptz not null default now()
);
create index if not exists arnie_review_events_company_created on public.arnie_review_events (company_id, created_at desc);
alter table public.arnie_review_events enable row level security;
