-- A job with no lead could not be created.
--
-- party_job_before (20260914180000) declared `l record` and only filled it
-- when the job carried a numeric lead_id. For every other job — a service
-- call, a direct booking, a job scheduled from an estimate with no lead —
-- it then read `l.id`, and PL/pgSQL refuses to read a field of a record
-- that was never assigned:
--
--   ERROR 55000: record "l" is not assigned yet
--
-- so the INSERT failed. Christopher hit it scheduling Evans Exterior Windows
-- (2026-09-17); in the three days since the trigger went live not one
-- lead-less job was created at HHH, against one or two a week before.
--
-- A %rowtype variable starts out as a row of NULLs, so `l.id is not null`
-- is simply false when there is no lead. Same for the customer row.

create or replace function public.party_job_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  c public.customers%rowtype;
  lid integer;
begin
  -- jobs.lead_id is TEXT; leads.id is INTEGER (see lib/jobOwnership).
  lid := case when new.lead_id ~ '^\d+$' then new.lead_id::integer else null end;
  if lid is not null then
    select * into l from leads where id = lid and company_id = new.company_id;
  end if;

  if new.customer_id is null and l.id is not null then
    new.customer_id := coalesce(l.converted_customer_id, l.customer_id);
  end if;
  if coalesce(trim(new.details), '') = '' and l.id is not null then
    new.details := nullif(trim(l.notes), '');
  end if;
  if coalesce(trim(new.job_address), '') = '' and l.id is not null then
    new.job_address := nullif(trim(l.address), '');
  end if;

  if new.customer_id is not null then
    select * into c from customers where id = new.customer_id and company_id = new.company_id;
    if c.id is not null then
      new.customer_name := coalesce(nullif(trim(new.customer_name), ''), party_display_name(c.business_name, c.name));
      new.business_name := coalesce(nullif(trim(new.business_name), ''), nullif(trim(c.business_name), ''));
      new.email         := coalesce(nullif(trim(new.email), ''),         nullif(trim(c.email), ''));
      new.phone         := coalesce(nullif(trim(new.phone), ''),         nullif(trim(c.phone), ''));
      new.job_address   := coalesce(nullif(trim(new.job_address), ''),   nullif(trim(c.address), ''));
    end if;
  end if;
  return new;
end $$;
