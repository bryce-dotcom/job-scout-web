-- Jobs get coordinates, so Liahona can show finished work and cloverleaf
-- around it.
--
-- Cloverleaf ("the neighbours of a job we just finished") started from lead
-- pins, but most of HHH's history came in from HousecallPro as jobs with no
-- lead at all: 7,142 jobs, 6,580 with an address, 2,093 with a lead. Those
-- never reached the map. Same pattern as leads (20260914120000/200000): the
-- columns, an index for "what still needs geocoding", and a trigger that
-- clears a pin when the address changes so the geocode cron refills it.

alter table public.jobs add column if not exists latitude          double precision;
alter table public.jobs add column if not exists longitude         double precision;
alter table public.jobs add column if not exists geocoded_at       timestamptz;
alter table public.jobs add column if not exists geocode_failed_at timestamptz;
comment on column public.jobs.latitude          is 'WGS84 latitude of jobs.job_address, filled by /api/cron/geocode-leads. NULL = not yet geocoded.';
comment on column public.jobs.longitude         is 'WGS84 longitude of jobs.job_address.';
comment on column public.jobs.geocoded_at       is 'When latitude/longitude were last computed. Cleared by trigger when job_address changes.';
comment on column public.jobs.geocode_failed_at is 'Last time the geocode cron tried this address and found nothing. Retried after 7 days, or immediately when the address changes.';

create index if not exists jobs_company_geocoded_idx
  on public.jobs (company_id)
  where latitude is not null and longitude is not null;

create index if not exists jobs_geocode_pending_idx
  on public.jobs (geocode_failed_at)
  where latitude is null and job_address is not null;

create or replace function public.jobs_clear_coords_on_address_change()
returns trigger
language plpgsql
as $$
begin
  if new.job_address is distinct from old.job_address
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    new.latitude := null;
    new.longitude := null;
    new.geocoded_at := null;
    new.geocode_failed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_clear_coords_on_address_change on public.jobs;
create trigger jobs_clear_coords_on_address_change
  before update of job_address on public.jobs
  for each row
  execute function public.jobs_clear_coords_on_address_change();
