-- Every bulk export, on the record.
--
-- Bryce, 2026-10-20, after learning reps were feeding company data to an
-- outside AI (Grok): "how do we keep other bots seeing all of our numbers and
-- all of our data, customers, all that stuff". A spreadsheet of customers is
-- the easiest thing to hand one. Exports are now admin-only in the app
-- (src/lib/exportGuard.js), and each one leaves a row here: who, what, how
-- many rows, when. Refused attempts are written too (allowed = false), so a
-- non-admin trying is visible as well.
--
-- Written by the signed-in person for their own company; read by that
-- company's admins.

create table if not exists public.export_log (
  id          bigserial primary key,
  company_id  integer not null references public.companies(id) on delete cascade,
  employee_id integer references public.employees(id) on delete set null,
  email       text,
  what        text not null,
  row_count   integer,
  file_name   text,
  page        text,
  allowed     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists export_log_company_created on public.export_log (company_id, created_at desc);

alter table public.export_log enable row level security;

drop policy if exists export_log_insert_own on public.export_log;
create policy export_log_insert_own on public.export_log
  for insert to authenticated
  with check (
    company_id = public.get_user_company_id()
    and lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists export_log_admin_read on public.export_log;
create policy export_log_admin_read on public.export_log
  for select to authenticated
  using (public.is_company_admin_of(company_id));

-- No update, no delete: a log that can be edited is not a log.
