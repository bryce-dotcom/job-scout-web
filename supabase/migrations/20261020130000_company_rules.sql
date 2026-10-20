-- Teach Jenny: rules the TEAM teaches the assistant, for everyone.
--
-- Bryce, 2026-10-20: Cole and London were training a Jenny in Grok because
-- JobScout had nowhere to teach her — her memory is per person
-- (arnie_memories), and the company's rules lived in a settings form. So they
-- pasted the company's customers and prices into an outside AI instead.
--
-- A company rule is one line the assistant follows for EVERYONE in the
-- company: "Every exterior SRP light uses the 12/7 schedule." It is taught in
-- chat ("Jenny, new rule: …"), drafted as a card, approved by an admin, and
-- read into every conversation from then on (arnie-chat companyRulesBlock).
-- Retired, never deleted, so the history of what she was told stays.
--
-- Written only through the card rail (service role, arnie-config) — no
-- insert/update policy. Everyone in the company may read the list; it is how
-- they know what their assistant was taught.

create table if not exists public.company_rules (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  rule           text not null check (length(rule) between 3 and 400),
  topic          text,
  taught_by      text,
  taught_by_employee_id integer references public.employees(id) on delete set null,
  approved_by    text,
  source         text not null default 'chat',
  active         boolean not null default true,
  replaces_id    bigint references public.company_rules(id) on delete set null,
  created_at     timestamptz not null default now(),
  retired_at     timestamptz,
  retired_by     text
);

create index if not exists company_rules_company_active on public.company_rules (company_id, active, created_at);

alter table public.company_rules enable row level security;

drop policy if exists company_rules_read on public.company_rules;
create policy company_rules_read on public.company_rules
  for select to authenticated
  using (company_id = public.get_user_company_id());

-- An admin may retire a rule from Arnie → Setup (active=false, retired_at,
-- retired_by). New rules still come only through the card.
drop policy if exists company_rules_admin_retire on public.company_rules;
create policy company_rules_admin_retire on public.company_rules
  for update to authenticated
  using (public.is_company_admin_of(company_id))
  with check (public.is_company_admin_of(company_id));
