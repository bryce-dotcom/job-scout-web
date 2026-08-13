-- Memberships (Slice 2 of recurring jobs + memberships).
--
-- A membership = a recurring service plan the CUSTOMER subscribes to, auto-billed
-- through the TENANT's own Stripe (never JobScout's master account). It rides on
-- the recurrence engine from Slice 1: an active membership generates recurring
-- service visits (jobs) tagged with membership_id.
--
-- All additive. Billing is handled by NEW, separate edge functions
-- (create-customer-subscription + customer-subscription-webhook) — the existing
-- stripe-webhook / invoice-payment path is never touched.

-- Plans a tenant offers (e.g. "Comfort Club — $29/mo, 2 tune-ups/yr").
create table if not exists public.membership_plans (
  id               bigserial primary key,
  company_id       integer     not null references public.companies(id) on delete cascade,
  name             text        not null,
  description      text,
  price_cents      integer     not null default 0,
  billing_interval text        not null default 'month',   -- 'month' | 'quarter' | 'year'
  included_visits  integer     default 0,                  -- visits included per year
  visit_frequency  text,                                    -- recurrence enum for auto-visits (e.g. 'Quarterly')
  service_kind     text,                                    -- kind stamped on generated visits (e.g. 'annual')
  perks            jsonb       not null default '[]'::jsonb, -- ["Priority scheduling", "15% off repairs"]
  stripe_price_id  text,                                    -- created lazily on first enroll
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
create index if not exists membership_plans_company_idx on public.membership_plans(company_id);

-- A customer's active subscription to a plan.
create table if not exists public.customer_memberships (
  id                    bigserial primary key,
  company_id            integer     not null references public.companies(id) on delete cascade,
  customer_id           integer     not null references public.customers(id) on delete cascade,
  membership_plan_id    bigint      references public.membership_plans(id) on delete set null,
  stripe_subscription_id text,
  stripe_customer_id    text,
  status                text        not null default 'incomplete', -- incomplete|active|past_due|canceled|trialing
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  next_visit_date       date,
  plan_name             text,        -- denormalized snapshot for display/history
  price_cents           integer,
  billing_interval      text,
  started_at            timestamptz,
  canceled_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);
create index if not exists customer_memberships_company_idx on public.customer_memberships(company_id);
create index if not exists customer_memberships_customer_idx on public.customer_memberships(customer_id);
create unique index if not exists customer_memberships_stripe_sub_idx
  on public.customer_memberships(stripe_subscription_id) where stripe_subscription_id is not null;

-- Webhook idempotency: each Stripe event processed at most once.
create table if not exists public.stripe_subscription_events (
  id             bigserial primary key,
  company_id     integer,
  stripe_event_id text       not null unique,
  event_type     text,
  processed_at   timestamptz not null default now()
);

-- Tag a job (service visit) as belonging to a membership.
alter table public.jobs add column if not exists membership_id bigint
  references public.customer_memberships(id) on delete set null;
create index if not exists idx_jobs_membership on public.jobs(membership_id) where membership_id is not null;

-- RLS — tenant isolation, matching the current pattern. Service role (edge
-- functions) bypasses RLS to write billing state.
alter table public.membership_plans enable row level security;
alter table public.membership_plans force row level security;
do $$ begin
  create policy tenant_isolation on public.membership_plans
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

alter table public.customer_memberships enable row level security;
alter table public.customer_memberships force row level security;
do $$ begin
  create policy tenant_isolation on public.customer_memberships
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- Idempotency ledger: service-role only (no authenticated policy).
alter table public.stripe_subscription_events enable row level security;
alter table public.stripe_subscription_events force row level security;

notify pgrst, 'reload schema';
