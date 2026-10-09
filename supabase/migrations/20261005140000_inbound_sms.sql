-- Texts that arrive.
--
-- JobScout could send a text and never receive one. The number's inbound
-- webhook still pointed at Twilio's demo autoresponder from account setup, and
-- once the number joined a Messaging Service even that stopped applying — the
-- service's inbound URL was null, so a customer replying to an invoice reminder
-- was answered by silence. 110 portal messages exist and not one is from a
-- customer; the same shape of hole the inbound EMAIL work closed in September.
--
-- Two things are needed and neither existed:
--
-- 1. somewhere to put an arriving message. communications_log is the right
--    table — it is already read by /communications and by CustomerDetail — but
--    every row in it was outbound by assumption, with no way to say so. The
--    new `direction` column makes that assumption explicit instead of implied.
--    `recipient` keeps meaning "the other party's number" in both directions,
--    so every existing view keeps working unchanged.
--
-- 2. a way to tell WHO texted. Phone numbers are stored in whatever shape they
--    arrived in — '4357904777' on one row, '(801) 999-8430' on another — so
--    matching has to compare digits, and comparing digits across three tables
--    for 3,376 customers is not something to do by fetching them to the edge
--    (PostgREST caps at 1000 rows regardless of .limit, which has bitten this
--    codebase before). It belongs in SQL, next to the data.

alter table communications_log
  add column if not exists direction text not null default 'out';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'communications_log'::regclass and conname = 'communications_log_direction_chk'
  ) then
    alter table communications_log
      add constraint communications_log_direction_chk check (direction in ('in', 'out'));
  end if;
end $$;

comment on column communications_log.direction is
  'in = they contacted us, out = we contacted them. Existing rows are out, which is what they all were.';
comment on column communications_log.recipient is
  'The OTHER party''s address or number, whichever way the message went.';

-- Twilio retries a webhook it did not get a 200 from, so the arriving message
-- id is what makes a second delivery a no-op rather than a duplicate.
create unique index if not exists communications_log_communication_id_uniq
  on communications_log (company_id, communication_id)
  where communication_id is not null;

-- Who owns this phone number? Checked across the three tables a texter could
-- be in, newest first within each. SECURITY DEFINER because the caller is the
-- inbound webhook running as the service role before any user exists.
create or replace function inbound_sms_match(p_company_id integer, p_phone text)
returns table (kind text, match_id integer, match_name text, salesperson_id integer)
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as key
  )
  (select 'customer'::text, c.id, c.name, c.salesperson_id
     from customers c, k
    where c.company_id = p_company_id
      and length(k.key) = 10
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = k.key
    order by c.id desc
    limit 3)
  union all
  (select 'employee'::text, e.id, e.name, null::integer
     from employees e, k
    where e.company_id = p_company_id
      and e.active
      and length(k.key) = 10
      and right(regexp_replace(coalesce(e.phone, ''), '\D', '', 'g'), 10) = k.key
    order by e.id desc
    limit 3)
  union all
  (select 'lead'::text, l.id, coalesce(nullif(l.customer_name, ''), l.business_name), l.salesperson_id
     from leads l, k
    where l.company_id = p_company_id
      and length(k.key) = 10
      and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10) = k.key
    order by l.id desc
    limit 3)
$$;

-- A phone number is customer data, and the parameter is a company id: anyone
-- able to call this with someone else's id could ask whose number it is. Only
-- the service role (the webhook) may.
revoke all on function inbound_sms_match(integer, text) from public;
revoke all on function inbound_sms_match(integer, text) from anon;
revoke all on function inbound_sms_match(integer, text) from authenticated;
grant execute on function inbound_sms_match(integer, text) to service_role;
