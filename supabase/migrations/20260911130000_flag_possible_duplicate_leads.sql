-- =====================================================================
-- Flag a lead that looks like one the company already has.
--
-- Tracy set "Halifax Flooring". Ninety minutes later the rep created
-- "Haliflax flooring " and quoted from it, and her setter fee was
-- orphaned on the original. The forms now warn (lib/leadDuplicates.js),
-- but there are seven places a lead gets created, including edge
-- functions, and a warning only helps where it is shown.
--
-- This is the backstop. BEFORE INSERT, look for an open lead in the same
-- company from the last year with the same squashed name, a very similar
-- one (trigram), the same phone, or the same email — and record it on
-- the new row. It never blocks: a second location for a real customer
-- is normal business. It just makes the duplicate VISIBLE, on the row,
-- to every screen and to Arnie, instead of being discovered when a
-- commission goes missing.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

alter table public.leads
  add column if not exists possible_duplicate_of integer
    references public.leads(id) on delete set null;

create index if not exists leads_possible_duplicate_of_idx
  on public.leads (possible_duplicate_of) where possible_duplicate_of is not null;

-- Same rule as lib/leadDuplicates.js squash(): lowercase, letters and digits.
create or replace function public.squash_text(s text)
returns text
language sql
immutable
as $$ select regexp_replace(lower(coalesce(s, '')), '[^a-z0-9]', '', 'g') $$;

-- Mirrors the name rules in lib/leadDuplicates.js findSimilarLeads():
--   same squashed name · one contains the other (both >= 6) · close enough
--   by trigram (>= 6). Both sides already squashed.
create or replace function public.names_alike(a text, b text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select a is not null and b is not null and length(a) >= 4 and length(b) >= 4 and (
       a = b
    or (length(a) >= 6 and length(b) >= 6 and (position(a in b) > 0 or position(b in a) > 0))
    or (length(a) >= 6 and length(b) >= 6 and similarity(a, b) >= 0.6)
  )
$$;

create or replace function public.flag_possible_duplicate_lead()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n1 text := public.squash_text(new.customer_name);
  n2 text := public.squash_text(new.business_name);
  ph text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
  em text := nullif(lower(trim(coalesce(new.email, ''))), '');
  hit integer;
begin
  if new.company_id is null then return new; end if;
  if length(n1) < 4 then n1 := null; end if;
  if length(n2) < 4 then n2 := null; end if;
  if length(ph) < 7 then ph := null; end if;
  if n1 is null and n2 is null and ph is null and em is null then return new; end if;

  select l.id into hit
    from public.leads l
   where l.company_id = new.company_id
     and l.id is distinct from new.id
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
   -- Point at the ORIGINAL: a lead that is not itself flagged wins over
   -- one that is, so a third copy links to the real lead, not to the
   -- second copy. Then newest.
   order by (l.possible_duplicate_of is null) desc, l.created_at desc
   limit 1;

  new.possible_duplicate_of := hit;
  return new;
end;
$$;

drop trigger if exists leads_flag_possible_duplicate on public.leads;
create trigger leads_flag_possible_duplicate
  before insert on public.leads
  for each row execute function public.flag_possible_duplicate_lead();

-- The one that started this.
update public.leads set possible_duplicate_of = 4178
 where id = 4180 and possible_duplicate_of is null;

notify pgrst, 'reload schema';
