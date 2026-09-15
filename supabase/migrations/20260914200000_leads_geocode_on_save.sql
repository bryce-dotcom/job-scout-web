-- Geocode on save, part 1 of 2 (the other half is /api/cron/geocode-leads).
--
-- Liahona pins come from leads.latitude/longitude, which the one-off backfill
-- filled for existing rows. New leads and edited addresses would drift back
-- to "unpinned" because nothing kept the columns current. Leads are written
-- from a dozen places (Leads form, estimate intake, customer detail, Zach,
-- inbound webhooks, imports), so this does not patch each caller:
--
--   * a trigger clears the coordinates whenever an address changes and the
--     caller did not supply new ones, so a stale pin never survives an edit;
--   * a Vercel cron every 10 minutes geocodes whatever has an address and no
--     coordinates, and records failures so junk addresses are not retried
--     every run.
--
-- Why a cron and not pg_net from the trigger: see 20260821120000 — pg_net
-- calls fail silently when a function's verify_jwt flips, and the repo has
-- already lost a month of follow-ups to that. A Vercel cron logs its failures
-- where someone looks.

alter table public.leads add column if not exists geocode_failed_at timestamptz;
comment on column public.leads.geocode_failed_at is
  'Last time the geocode cron tried this address and found nothing. Retried after 7 days, or immediately when the address changes.';

-- "What still needs geocoding?" is the cron's only query.
create index if not exists leads_geocode_pending_idx
  on public.leads (geocode_failed_at)
  where latitude is null and address is not null;

create or replace function public.leads_clear_coords_on_address_change()
returns trigger
language plpgsql
as $$
begin
  -- Only when the address actually changed, and only when the caller did not
  -- send fresh coordinates along with it (Liahona's drop-lead and pin drag do).
  if new.address is distinct from old.address
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

drop trigger if exists leads_clear_coords_on_address_change on public.leads;
create trigger leads_clear_coords_on_address_change
  before update of address on public.leads
  for each row
  execute function public.leads_clear_coords_on_address_change();
