-- =====================================================================
-- similar_leads(): the duplicate-lead rule as one callable function.
--
-- 20260911130000 put the rule inside the BEFORE INSERT trigger. Arnie's
-- create rail needs the same answer BEFORE a lead exists — "a lead like
-- this is already here, use it?" — and asking the model to re-implement
-- name matching is how the substring check in Estimates.jsx ended up
-- missing "Haliflax". So the rule moves into a function, the trigger
-- calls it, and Arnie calls it through RPC. One definition.
--
-- Also adds two things the trigger did not need but a caller does: how
-- the row matched (so Arnie can say "same phone" rather than "similar"),
-- and a limit.
-- =====================================================================

create or replace function public.similar_leads(
  p_company_id integer,
  p_customer_name text default null,
  p_business_name text default null,
  p_phone text default null,
  p_email text default null,
  p_exclude_id integer default null,
  p_limit integer default 5
)
returns table (
  id integer,
  customer_name text,
  business_name text,
  status text,
  phone text,
  email text,
  setter_owner_id integer,
  lead_owner_id integer,
  appointment_time timestamptz,
  created_at timestamptz,
  possible_duplicate_of integer,
  matched_on text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  n1 text := public.squash_text(p_customer_name);
  n2 text := public.squash_text(p_business_name);
  ph text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if length(n1) < 4 then n1 := null; end if;
  if length(n2) < 4 then n2 := null; end if;
  if length(ph) < 7 then ph := null; end if;
  if n1 is null and n2 is null and ph is null and em is null then return; end if;

  return query
  select l.id, l.customer_name, l.business_name, l.status, l.phone, l.email,
         l.setter_owner_id, l.lead_owner_id, l.appointment_time, l.created_at, l.possible_duplicate_of,
         array_to_string(array_remove(array[
           case when ph is not null and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10) = ph then 'same phone number' end,
           case when em is not null and lower(trim(coalesce(l.email, ''))) = em then 'same email' end,
           case when (n1 is not null and (public.squash_text(l.customer_name) = n1 or public.squash_text(l.business_name) = n1))
                  or (n2 is not null and (public.squash_text(l.customer_name) = n2 or public.squash_text(l.business_name) = n2))
                then 'same name'
                when (n1 is not null and (public.names_alike(public.squash_text(l.customer_name), n1) or public.names_alike(public.squash_text(l.business_name), n1)))
                  or (n2 is not null and (public.names_alike(public.squash_text(l.customer_name), n2) or public.names_alike(public.squash_text(l.business_name), n2)))
                then 'very similar name' end
         ], null), ' · ') as matched_on
    from public.leads l
   where l.company_id = p_company_id
     and (p_exclude_id is null or l.id <> p_exclude_id)
     and l.created_at >= now() - interval '365 days'
     and lower(coalesce(l.status, '')) not in ('lost', 'dead', 'closed lost', 'not interested', 'disqualified', 'archived')
     and (
          (ph is not null and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10) = ph)
       or (em is not null and lower(trim(coalesce(l.email, ''))) = em)
       or (n1 is not null and (public.names_alike(public.squash_text(l.customer_name), n1)
                            or public.names_alike(public.squash_text(l.business_name), n1)))
       or (n2 is not null and (public.names_alike(public.squash_text(l.customer_name), n2)
                            or public.names_alike(public.squash_text(l.business_name), n2)))
     )
   -- The original first: a lead not itself flagged beats one that is.
   order by (l.possible_duplicate_of is null) desc, l.created_at desc
   limit greatest(1, least(p_limit, 20));
end;
$$;

grant execute on function public.similar_leads(integer, text, text, text, text, integer, integer) to authenticated, service_role;

-- The trigger now asks the function instead of carrying its own copy.
create or replace function public.flag_possible_duplicate_lead()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  hit integer;
begin
  if new.company_id is null then return new; end if;
  select s.id into hit
    from public.similar_leads(new.company_id, new.customer_name, new.business_name, new.phone, new.email, new.id, 1) s;
  new.possible_duplicate_of := hit;
  return new;
end;
$$;

notify pgrst, 'reload schema';
