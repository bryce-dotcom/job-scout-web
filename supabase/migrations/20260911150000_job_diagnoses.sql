-- =====================================================================
-- job_diagnoses: what was wrong, and what actually fixed it.
--
-- Diagnose slice 1 (PR #10) let a tech ask Arnie why a contactor
-- chatters. Slice 2 is the part a competitor cannot copy: when the tech
-- finds it, the answer is kept — equipment, symptom, cause, fix, parts —
-- on the job, searchable. The next time anyone in the company hits the
-- same thing, Arnie says "we fixed this on the Drinkle job in March:
-- rod seals" before he says anything from general knowledge.
--
-- A row is written only through the create rail (a person approves the
-- card) or by hand. Never by the model on its own.
-- =====================================================================

create table if not exists public.job_diagnoses (
  id                      serial primary key,
  company_id              integer not null references public.companies(id) on delete cascade,
  job_id                  integer references public.jobs(id) on delete set null,
  customer_id             integer references public.customers(id) on delete set null,
  trade                   text,
  equipment               text,
  symptom                 text not null,
  cause                   text,
  fix                     text not null,
  parts                   text,
  outcome                 text not null default 'fixed'
                          check (outcome in ('fixed', 'partial', 'escalated', 'unresolved')),
  created_by_employee_id  integer references public.employees(id) on delete set null,
  created_by              text,
  source                  text not null default 'arnie',
  created_at              timestamptz not null default now(),
  -- Everything a search should hit, as one indexed document.
  search                  tsvector generated always as (
                            to_tsvector('english',
                              coalesce(equipment, '') || ' ' || coalesce(symptom, '') || ' ' ||
                              coalesce(cause, '') || ' ' || coalesce(fix, '') || ' ' || coalesce(parts, ''))
                          ) stored
);

create index if not exists job_diagnoses_company_idx on public.job_diagnoses (company_id, created_at desc);
create index if not exists job_diagnoses_job_idx     on public.job_diagnoses (job_id) where job_id is not null;
create index if not exists job_diagnoses_search_idx  on public.job_diagnoses using gin (search);
create index if not exists job_diagnoses_equipment_trgm_idx
  on public.job_diagnoses using gin (lower(coalesce(equipment, '')) extensions.gin_trgm_ops);

alter table public.job_diagnoses enable row level security;

do $$ begin
  create policy tenant_isolation on public.job_diagnoses
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- The trial read-only gate (20260722000000) was applied by looping over the
-- tables that existed that day. A table born later has to ask for it.
do $$ begin
  create policy require_writable_ins on public.job_diagnoses
    as restrictive for insert to authenticated with check (public.company_can_write(company_id));
  create policy require_writable_upd on public.job_diagnoses
    as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id));
  create policy require_writable_del on public.job_diagnoses
    as restrictive for delete to authenticated using (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- search_diagnoses(): "have we seen this before?"
--
-- Full-text on the whole document, plus trigram on the equipment so
-- "Lennox ML180" finds "lennox ml-180" and a model number typed off a
-- nameplate still matches. Ranked, capped, company-scoped.
-- ---------------------------------------------------------------------
create or replace function public.search_diagnoses(
  p_company_id integer,
  p_query text,
  p_equipment text default null,
  p_limit integer default 5
)
returns table (
  id integer,
  job_id integer,
  job_label text,
  customer_name text,
  trade text,
  equipment text,
  symptom text,
  cause text,
  fix text,
  parts text,
  outcome text,
  fixed_by text,
  created_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  -- Two techs never describe the same fault in the same words. "fires then
  -- shuts off after 30 seconds, lockout" and "lights, runs half a minute,
  -- dies, locks out" are the same furnace. So:
  --   • every query word is OR-ed, not AND-ed, and ts_rank orders by how
  --     many of them hit (an exact all-words hit gets a bonus on top);
  --   • the equipment is matched with word_similarity, which asks "does the
  --     stored make/model appear, roughly, anywhere in what they said" —
  --     plain similarity punishes a long sentence for being long.
  with q as (
    select nullif(replace(plainto_tsquery('english', coalesce(p_query, ''))::text, ' & ', ' | '), '') as or_text,
           plainto_tsquery('english', coalesce(p_query, '')) as tsq_and,
           lower(coalesce(nullif(p_equipment, ''), p_query, '')) as said
  ),
  scored as (
    select d.*,
           case when q.or_text is null then 0 else ts_rank(d.search, q.or_text::tsquery) end as ts,
           case when q.or_text is null then false else d.search @@ q.tsq_and end as all_words,
           case when length(q.said) >= 3 and d.equipment is not null
                then word_similarity(lower(d.equipment), q.said) else 0 end as eq_sim
      from public.job_diagnoses d
      cross join q
     where d.company_id = p_company_id
  )
  select s.id, s.job_id,
         case when j.id is null then null
              else coalesce(j.job_id, '#' || j.id::text) || coalesce(' · ' || nullif(j.job_title, ''), '')
                   || coalesce(' — ' || nullif(j.customer_name, ''), '') end as job_label,
         coalesce(j.customer_name, c.name) as customer_name,
         s.trade, s.equipment, s.symptom, s.cause, s.fix, s.parts, s.outcome,
         e.name as fixed_by, s.created_at,
         (s.ts * 10 + s.eq_sim + case when s.all_words then 1 else 0 end)::real as rank
    from scored s
    left join public.jobs j on j.id = s.job_id
    left join public.customers c on c.id = s.customer_id
    left join public.employees e on e.id = s.created_by_employee_id
   where s.ts >= 0.01 or s.eq_sim >= 0.4
   order by rank desc, s.created_at desc
   limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.search_diagnoses(integer, text, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
