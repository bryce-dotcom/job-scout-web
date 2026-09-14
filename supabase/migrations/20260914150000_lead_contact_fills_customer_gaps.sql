-- =====================================================================
-- A lead edited after conversion still reaches the customer.
--
-- Bryce, 2026-09-14: "look at AZ Camping Nation RV. look at the job details
-- and compare it to the lead information. we keep having trouble with all of
-- the information getting into the job details."
--
-- The audit log for that job, in Mountain time:
--
--   08-24 16:07  lead created from Lenard — address only, no email, no phone
--   08-28 18:19  estimate approved → customer 7976 + job 23559 created,
--                copying exactly what the lead had: address, nothing else
--   08-28 18:21  the rep adds the email and phone — TO THE LEAD
--
-- Two minutes late, and nothing carried it across. The job page reads the
-- customer, the customer had blanks, and the lead had the answers. The
-- conversion code already fills a matched customer's blanks from the lead
-- (lib/customerMatch contactGapPatch, after Doug's Halverson ticket); what it
-- could not do is run again when the lead changes afterwards — and reps fill
-- leads in afterwards all the time, because Lenard creates the lead before
-- anyone has asked for a phone number.
--
-- Same rule, in the database, on every lead update from any screen: fill the
-- converted customer's EMPTY email / phone / address from the lead. Never
-- overwrite. A value someone corrected on the customer outranks the lead.
-- =====================================================================

create or replace function public.lead_contact_fills_customer_gaps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_customer_id is null then
    return new;
  end if;

  update public.customers c
     set email   = case when coalesce(trim(c.email), '')   = '' then nullif(trim(new.email), '')   else c.email   end,
         phone   = case when coalesce(trim(c.phone), '')   = '' then nullif(trim(new.phone), '')   else c.phone   end,
         address = case when coalesce(trim(c.address), '') = '' then nullif(trim(new.address), '') else c.address end
   where c.id = new.converted_customer_id
     and c.company_id = new.company_id
     and (
          (coalesce(trim(c.email), '')   = '' and nullif(trim(new.email), '')   is not null)
       or (coalesce(trim(c.phone), '')   = '' and nullif(trim(new.phone), '')   is not null)
       or (coalesce(trim(c.address), '') = '' and nullif(trim(new.address), '') is not null)
     );

  return new;
end;
$$;

drop trigger if exists lead_contact_fills_customer_gaps on public.leads;
create trigger lead_contact_fills_customer_gaps
  after insert or update of email, phone, address, converted_customer_id on public.leads
  for each row execute function public.lead_contact_fills_customer_gaps();

-- Every converted customer whose lead already holds what it is missing.
-- Measured before this migration: 4 customers, one company (email ×4,
-- phone ×2, address ×2). AZ Camping Nation RV is one of them.
update public.customers c
   set email   = case when coalesce(trim(c.email), '')   = '' then nullif(trim(l.email), '')   else c.email   end,
       phone   = case when coalesce(trim(c.phone), '')   = '' then nullif(trim(l.phone), '')   else c.phone   end,
       address = case when coalesce(trim(c.address), '') = '' then nullif(trim(l.address), '') else c.address end
  from public.leads l
 where l.converted_customer_id = c.id
   and l.company_id = c.company_id
   and (
        (coalesce(trim(c.email), '')   = '' and nullif(trim(l.email), '')   is not null)
     or (coalesce(trim(c.phone), '')   = '' and nullif(trim(l.phone), '')   is not null)
     or (coalesce(trim(c.address), '') = '' and nullif(trim(l.address), '') is not null)
   );
