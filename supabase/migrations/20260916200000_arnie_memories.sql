-- What Arnie remembers about a person — per employee, per company.
--
-- "Call the Riverside job 'the gym'." "I always want the brief as a text."
-- "I'm Mike's backup on Fridays." Small facts a person tells Arnie once
-- and should never have to repeat. Each one is a row here; arnie-chat
-- reads the caller's rows on every request and puts them in front of the
-- model as "what you remember about <name>".
--
-- Written only through Arnie's create rail (a card the person approves)
-- and deleted from Arnie → Settings. A memory is the person's own: the
-- guard below lets a person delete theirs and an admin delete anyone's,
-- and nobody insert on someone else's behalf from the client.

create table if not exists public.arnie_memories (
  id           serial primary key,
  company_id   integer not null references public.companies(id) on delete cascade,
  employee_id  integer not null references public.employees(id) on delete cascade,
  kind         text not null default 'fact' check (kind in ('preference', 'alias', 'fact')),
  text         text not null check (char_length(text) between 3 and 240),
  created_by   text,
  source       text not null default 'arnie',
  created_at   timestamptz not null default now()
);

create index if not exists arnie_memories_employee on public.arnie_memories (company_id, employee_id, created_at);

alter table public.arnie_memories enable row level security;

do $$ begin
  create policy tenant_isolation on public.arnie_memories
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- Your own, or an admin's say-so. The same shape as the brief subscription
-- guard: the service role (Arnie's rail) passes, a person below admin may
-- only touch rows carrying their own employee id.
create or replace function public.guard_arnie_memory_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  me integer;
begin
  if jwt_email is null then return coalesce(new, old); end if;
  if public.current_user_access_level() >= 3 then return coalesce(new, old); end if;
  select id into me from public.employees where lower(email) = lower(jwt_email) and company_id = coalesce(new.company_id, old.company_id) limit 1;
  if me is null or me is distinct from coalesce(new.employee_id, old.employee_id) then
    raise exception 'Arnie remembers this for someone else; only they, or an admin, can change it.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_arnie_memory_owner on public.arnie_memories;
create trigger guard_arnie_memory_owner
  before insert or update or delete on public.arnie_memories
  for each row execute function public.guard_arnie_memory_owner();

comment on table public.arnie_memories is
  'Per-person facts Arnie carries into every conversation (aliases, preferences, standing facts). Written via the create rail, read by arnie-chat, deleted from Arnie → Settings.';

notify pgrst, 'reload schema';
