-- Nationwide parcels for Liahona via Regrid, part 1 of 2 (the other half is
-- the parcel-lookup edge function).
--
-- Free county sources (UGRC, Maricopa Assessor) stay first; Regrid answers
-- everywhere else and costs money per lookup. So:
--   * parcel_cache remembers every parcel Regrid has returned, keyed by its
--     ll_uuid and by the tapped point, for 90 days — a lot is never bought
--     twice, and a re-tap on a busy block is free;
--   * parcel_api_usage counts paid lookups per company per month, the same
--     shape as prospecting_usage, so the plan tier can meter them later.
-- Parcels are public records, so the cache is shared across tenants (no
-- company_id on the row); usage is per company.

create table if not exists public.parcel_cache (
  key         text primary key,            -- 'uuid:<ll_uuid>' or 'pt:<lat5>,<lng5>'
  ll_uuid     text,
  payload     jsonb not null,              -- normalized parcel (see parcel-lookup)
  fetched_at  timestamptz not null default now()
);
create index if not exists parcel_cache_uuid_idx on public.parcel_cache (ll_uuid);
create index if not exists parcel_cache_fetched_idx on public.parcel_cache (fetched_at);

create table if not exists public.parcel_api_usage (
  company_id  bigint not null,
  period      text   not null,             -- 'YYYY-MM' (UTC), like prospecting_usage
  lookups     integer not null default 0,  -- paid (uncached) Regrid calls
  updated_at  timestamptz not null default now(),
  primary key (company_id, period)
);

-- Only the edge function (service role) reads or writes these.
alter table public.parcel_cache enable row level security;
alter table public.parcel_api_usage enable row level security;
revoke all on public.parcel_cache from anon, authenticated;
revoke all on public.parcel_api_usage from anon, authenticated;

create or replace function public.bump_parcel_usage(p_company_id bigint, p_period text, p_lookups integer)
returns void language sql security definer as $$
  insert into public.parcel_api_usage (company_id, period, lookups)
  values (p_company_id, p_period, p_lookups)
  on conflict (company_id, period) do update
    set lookups = public.parcel_api_usage.lookups + excluded.lookups, updated_at = now();
$$;
