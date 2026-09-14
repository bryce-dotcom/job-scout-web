-- =====================================================================
-- Who-and-where is one fact. The database keeps every copy of it in step.
--
-- Bryce, 2026-09-14: "we keep having trouble with all of the information
-- getting into the job details" … "can we make it automatic, without a
-- button".
--
-- The same contact information lives in five places — Lenard's audit, the
-- lead, the customer, the estimate, the job — and it was copied by hand at
-- conversion, in two different code paths, by whatever the lead happened to
-- say at that moment. Thirty files write these fields. Every fix so far
-- patched one copy: Doug's Halverson ticket (fill the matched customer at
-- conversion), yesterday's trigger (fill the customer when the lead is
-- edited after conversion), today's labels (put the person and the site in
-- the right slots). This makes the copies unable to drift, in the one place
-- every write already passes through.
--
-- RULES, all of them fill-only and idempotent, so the triggers converge and
-- cannot fight each other:
--
--   leads    → on insert/contact edit: link to an existing customer by
--              email, then phone (identity-safe: never by name alone).
--              Fill the linked customer's blanks. Never overwrite a value
--              someone put on the customer.
--   customers→ on contact edit: the job's snapshot columns mirror the
--              customer (they are a display cache, the job page reads the
--              customer anyway); linked leads get their blanks filled.
--   jobs     → on insert: customer from the lead if missing; details from
--              the lead's notes if empty (Lenard's whole write-up was being
--              left behind); snapshot columns from the customer; address
--              from the lead.
--   quotes   → on insert / lead change: customer from the lead if missing.
--
-- Address is per SITE, not per customer — one customer, many buildings — so
-- it is only ever filled into blanks, in every direction.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers: how two contact values are compared.
-- ---------------------------------------------------------------------
create or replace function public.party_phone_key(p text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

create or replace function public.party_email_key(e text)
returns text language sql immutable as $$
  select nullif(lower(trim(coalesce(e, ''))), '')
$$;

-- Existing customer for this contact info, or null. Email, then phone.
-- Name alone is not an identity: "Doug" matched Curley Construction's Doug
-- once, and the lead's phone was written into the wrong company's record.
create or replace function public.party_find_customer(p_company_id integer, p_email text, p_phone text)
returns integer language plpgsql stable set search_path = public as $$
declare
  ek text := party_email_key(p_email);
  pk text := party_phone_key(p_phone);
  cid integer;
begin
  if ek is not null then
    select id into cid from customers where company_id = p_company_id and party_email_key(email) = ek order by id limit 1;
    if cid is not null then return cid; end if;
  end if;
  if pk is not null and length(pk) >= 7 then
    select id into cid from customers where company_id = p_company_id and party_phone_key(phone) = pk order by id limit 1;
    if cid is not null then return cid; end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- leads: link, then fill the customer's blanks.
-- ---------------------------------------------------------------------
create or replace function public.party_lead_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is null then
    new.customer_id := party_find_customer(new.company_id, new.email, new.phone);
  end if;
  return new;
end $$;

drop trigger if exists party_lead_before on public.leads;
create trigger party_lead_before
  before insert or update of email, phone on public.leads
  for each row execute function public.party_lead_before();

-- Replaces lead_contact_fills_customer_gaps (20260914150000): same rule,
-- now for the pre-conversion link as well, and for the two names.
create or replace function public.lead_contact_fills_customer_gaps()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid integer := coalesce(new.converted_customer_id, new.customer_id);
begin
  if cid is null or pg_trigger_depth() > 3 then return new; end if;
  update customers c
     set email         = case when coalesce(trim(c.email), '')         = '' then nullif(trim(new.email), '')         else c.email end,
         phone         = case when coalesce(trim(c.phone), '')         = '' then nullif(trim(new.phone), '')         else c.phone end,
         address       = case when coalesce(trim(c.address), '')       = '' then nullif(trim(new.address), '')       else c.address end,
         business_name = case when coalesce(trim(c.business_name), '') = '' then nullif(trim(new.business_name), '') else c.business_name end,
         name          = case when coalesce(trim(c.name), '')          = '' then nullif(trim(new.customer_name), '') else c.name end
   where c.id = cid and c.company_id = new.company_id
     and (   (coalesce(trim(c.email), '')         = '' and nullif(trim(new.email), '')         is not null)
          or (coalesce(trim(c.phone), '')         = '' and nullif(trim(new.phone), '')         is not null)
          or (coalesce(trim(c.address), '')       = '' and nullif(trim(new.address), '')       is not null)
          or (coalesce(trim(c.business_name), '') = '' and nullif(trim(new.business_name), '') is not null)
          or (coalesce(trim(c.name), '')          = '' and nullif(trim(new.customer_name), '') is not null));
  return new;
end $$;

drop trigger if exists lead_contact_fills_customer_gaps on public.leads;
create trigger lead_contact_fills_customer_gaps
  after insert or update of email, phone, address, customer_name, business_name, customer_id, converted_customer_id on public.leads
  for each row execute function public.lead_contact_fills_customer_gaps();

-- ---------------------------------------------------------------------
-- customers: the job's snapshot mirrors the customer; leads get blanks.
-- ---------------------------------------------------------------------
create or replace function public.party_display_name(p_business text, p_name text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(p_business), ''), nullif(trim(p_name), ''))
$$;

create or replace function public.party_customer_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 3 then return new; end if;

  -- Jobs: a mirror. JobDetail reads the customer; lists and PDFs read these.
  update jobs j
     set customer_name = coalesce(party_display_name(new.business_name, new.name), j.customer_name),
         business_name = coalesce(nullif(trim(new.business_name), ''), j.business_name),
         email         = coalesce(nullif(trim(new.email), ''), j.email),
         phone         = coalesce(nullif(trim(new.phone), ''), j.phone)
   where j.customer_id = new.id and j.company_id = new.company_id
     and (   j.customer_name is distinct from coalesce(party_display_name(new.business_name, new.name), j.customer_name)
          or j.business_name is distinct from coalesce(nullif(trim(new.business_name), ''), j.business_name)
          or j.email         is distinct from coalesce(nullif(trim(new.email), ''), j.email)
          or j.phone         is distinct from coalesce(nullif(trim(new.phone), ''), j.phone));

  -- Leads: blanks only. A lead may legitimately hold a different site.
  update leads l
     set email = case when coalesce(trim(l.email), '') = '' then nullif(trim(new.email), '') else l.email end,
         phone = case when coalesce(trim(l.phone), '') = '' then nullif(trim(new.phone), '') else l.phone end
   where (l.customer_id = new.id or l.converted_customer_id = new.id) and l.company_id = new.company_id
     and (   (coalesce(trim(l.email), '') = '' and nullif(trim(new.email), '') is not null)
          or (coalesce(trim(l.phone), '') = '' and nullif(trim(new.phone), '') is not null));
  return new;
end $$;

drop trigger if exists party_customer_after on public.customers;
create trigger party_customer_after
  after update of email, phone, name, business_name on public.customers
  for each row execute function public.party_customer_after();

-- ---------------------------------------------------------------------
-- jobs: arrive complete.
-- ---------------------------------------------------------------------
create or replace function public.party_job_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l record;
  c record;
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

drop trigger if exists party_job_before on public.jobs;
create trigger party_job_before
  before insert on public.jobs
  for each row execute function public.party_job_before();

-- ---------------------------------------------------------------------
-- quotes: the customer comes with the lead.
-- ---------------------------------------------------------------------
create or replace function public.party_quote_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is null and new.lead_id is not null then
    select coalesce(converted_customer_id, customer_id) into new.customer_id
      from leads where id = new.lead_id and company_id = new.company_id;
  end if;
  return new;
end $$;

drop trigger if exists party_quote_before on public.quotes;
create trigger party_quote_before
  before insert or update of lead_id on public.quotes
  for each row execute function public.party_quote_before();

-- ---------------------------------------------------------------------
-- Backfill: every tenant, blanks only, in the same order the triggers run.
-- ---------------------------------------------------------------------
-- 1. leads → existing customers, by email then phone.
update leads l
   set customer_id = party_find_customer(l.company_id, l.email, l.phone)
 where l.customer_id is null and l.converted_customer_id is null
   and party_find_customer(l.company_id, l.email, l.phone) is not null;

-- 2. quotes → the lead's customer.
update quotes q
   set customer_id = coalesce(l.converted_customer_id, l.customer_id)
  from leads l
 where q.customer_id is null and q.lead_id = l.id and l.company_id = q.company_id
   and coalesce(l.converted_customer_id, l.customer_id) is not null;

-- 3. jobs → the lead's customer, details, address.
update jobs j
   set customer_id = coalesce(j.customer_id, coalesce(l.converted_customer_id, l.customer_id)),
       details     = case when coalesce(trim(j.details), '') = '' then nullif(trim(l.notes), '') else j.details end,
       job_address = case when coalesce(trim(j.job_address), '') = '' then nullif(trim(l.address), '') else j.job_address end
  from leads l
 where j.lead_id ~ '^\d+$' and l.id = j.lead_id::integer and l.company_id = j.company_id
   and (   (j.customer_id is null and coalesce(l.converted_customer_id, l.customer_id) is not null)
        or (coalesce(trim(j.details), '') = '' and nullif(trim(l.notes), '') is not null)
        or (coalesce(trim(j.job_address), '') = '' and nullif(trim(l.address), '') is not null));

-- 4. jobs' snapshot columns from their customer — this year's live jobs.
--    7,209 jobs qualify across all time; most are imports nobody opens, and
--    every job UPDATE writes an audit row. 751 from 2026 and not archived.
update jobs j
   set customer_name = coalesce(nullif(trim(j.customer_name), ''), party_display_name(c.business_name, c.name)),
       business_name = coalesce(nullif(trim(j.business_name), ''), nullif(trim(c.business_name), '')),
       email         = coalesce(nullif(trim(j.email), ''),         nullif(trim(c.email), '')),
       phone         = coalesce(nullif(trim(j.phone), ''),         nullif(trim(c.phone), ''))
  from customers c
 where c.id = j.customer_id and c.company_id = j.company_id
   and j.created_at >= '2026-01-01' and coalesce(j.status, '') not in ('Archived', 'Closed', 'Cancelled')
   and (   (coalesce(trim(j.customer_name), '') = '' and party_display_name(c.business_name, c.name) is not null)
        or (coalesce(trim(j.business_name), '') = '' and nullif(trim(c.business_name), '') is not null)
        or (coalesce(trim(j.email), '')         = '' and nullif(trim(c.email), '') is not null)
        or (coalesce(trim(j.phone), '')         = '' and nullif(trim(c.phone), '') is not null));

-- 5. customers' blanks from their leads (names included now).
update customers c
   set email         = case when coalesce(trim(c.email), '')         = '' then nullif(trim(l.email), '')         else c.email end,
       phone         = case when coalesce(trim(c.phone), '')         = '' then nullif(trim(l.phone), '')         else c.phone end,
       address       = case when coalesce(trim(c.address), '')       = '' then nullif(trim(l.address), '')       else c.address end,
       business_name = case when coalesce(trim(c.business_name), '') = '' then nullif(trim(l.business_name), '') else c.business_name end,
       name          = case when coalesce(trim(c.name), '')          = '' then nullif(trim(l.customer_name), '') else c.name end
  from leads l
 where coalesce(l.converted_customer_id, l.customer_id) = c.id and l.company_id = c.company_id
   and (   (coalesce(trim(c.email), '')         = '' and nullif(trim(l.email), '')         is not null)
        or (coalesce(trim(c.phone), '')         = '' and nullif(trim(l.phone), '')         is not null)
        or (coalesce(trim(c.address), '')       = '' and nullif(trim(l.address), '')       is not null)
        or (coalesce(trim(c.business_name), '') = '' and nullif(trim(l.business_name), '') is not null)
        or (coalesce(trim(c.name), '')          = '' and nullif(trim(l.customer_name), '') is not null));
