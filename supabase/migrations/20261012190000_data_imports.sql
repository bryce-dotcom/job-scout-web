-- =====================================================================
-- Bringing a company's data in from whatever they were using before.
--
-- "If a customer is using Salesforce we just ask Arnie to use Salesforce to
-- get all the data into JobScout."
--
-- WHAT WAS ALREADY HERE, and is the reason this is small: customers already
-- carry `source_system` and `source_id`, left behind by the HousecallPro
-- migration — 673 rows from 'hcp', 94 from 'alc_import'. That is exactly the
-- pair an importer needs, so this does not invent an identity scheme. What it
-- adds is the guarantee nobody got round to: those columns had NO unique
-- index, so importing the same export twice produced two of everything, and
-- the only defence was remembering not to.
--
-- NOT A PER-VENDOR INTEGRATION. Salesforce, HousecallPro, ServiceTitan and
-- Jobber all export CSV, and so does the spreadsheet half of them actually
-- run the business on. An API integration per vendor is OAuth, a review, and
-- a thing that breaks when they ship a change; one importer that reads any
-- export covers all of it and the spreadsheet too. The AI does the part a
-- person hates — working out that "Account Name" is the customer and
-- "Billing Street" is the address — and never touches the rows themselves.
--
-- Rows do NOT pass through a model. Mapping is a dozen headers and five
-- sample rows; moving 5,000 customers is mechanical, batched, and must be
-- exactly as boring as it sounds.
-- =====================================================================

create table if not exists public.data_imports (
  id            bigserial primary key,
  company_id    integer not null references public.companies(id) on delete cascade,
  -- Who did it. An import is a big, visible act and it belongs to a person.
  employee_id   integer references public.employees(id) on delete set null,
  -- What is being brought in. One kind per import, so a part-finished job is
  -- never half customers and half something else.
  kind          text not null check (kind in ('customers')),
  -- What they called where it came from: 'Salesforce', 'HousecallPro', 'our
  -- spreadsheet'. It becomes customers.source_system, so a row can always be
  -- traced back to the day it arrived.
  source_label  text not null,
  file_name     text,
  status        text not null default 'planning'
                  check (status in ('planning', 'ready', 'applying', 'applied', 'undone', 'failed')),
  -- Which column became which field, as confirmed by a person. Kept because
  -- the next import from the same system should not have to be worked out
  -- again, and because "why is this customer's name their account number"
  -- needs an answer.
  mapping       jsonb,
  counts        jsonb not null default '{}'::jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz,
  undone_at     timestamptz
);

create index if not exists data_imports_company_idx
  on public.data_imports (company_id, created_at desc);

alter table public.data_imports enable row level security;

do $$ begin
  create policy data_imports_tenant on public.data_imports
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy data_imports_service on public.data_imports
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Which import a customer came from, so it can be undone as a unit and so an
-- admin can ask "where did these 800 rows come from".
alter table public.customers
  add column if not exists import_id bigint references public.data_imports(id) on delete set null;

create index if not exists customers_import_idx
  on public.customers (import_id) where import_id is not null;

-- THE GUARANTEE THAT WAS MISSING. Same export twice, same rows — not two of
-- everything. A PLAIN unique index, not a partial one: PostgREST cannot
-- target a partial index in an upsert (42P10) and the write silently
-- vanishes, which this project has already paid for once. Nulls are distinct
-- in Postgres, so the 2,763 customers with no source are untouched and can
-- stay that way.
create unique index if not exists customers_source_unique
  on public.customers (company_id, source_system, source_id);

-- The file's column headings, IN ORDER.
--
-- Not derivable from `mapping`, and that is the point: jsonb does not keep an
-- object's key order — it sorts the keys — so a mapping stored as
-- {"Billing Street":…,"Billing City":…,"Billing State":…,"Billing Zip":…}
-- comes back City, State, Street, Zip. Several columns join to make the
-- address, so the first version of this wrote "84601, Provo, UT, 101 Mill
-- Road" on every row: a real address, backwards, with nothing erroring.
-- A jsonb ARRAY does keep its order, so the order lives here.
alter table public.data_imports
  add column if not exists columns jsonb;
