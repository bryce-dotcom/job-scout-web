-- New-sign-in alerts.
--
-- Bryce, 2026-10-20: "how do we keep other bots like grok seeing all of our
-- numbers". A bot that signs in as a rep is a new KIND of sign-in for that
-- person: a program instead of a browser, or a browser on a system they have
-- never used (AI browser agents usually run Chrome on Linux servers). The
-- day it appears, the company's owners get an email.
--
-- new_sign_ins() is called by the Vercel cron api/cron/sign-in-alerts.js with
-- the service role. It reads auth.sessions created since the last run,
-- classifies each one, and returns only the (person, kind) pairs never seen
-- before — recording them so each is reported once. Service role only.
--
-- Honest limit: Chrome on Windows driven by an AI looks exactly like Chrome
-- on Windows driven by the rep. This catches the new KIND, not every bot.

create table if not exists public.sign_in_seen (
  user_id    uuid not null,
  kind       text not null,
  first_seen timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.sign_in_seen enable row level security;
-- No policies: nobody reads this through the API; the function does.

create table if not exists public.sign_in_watch (
  id           integer primary key default 1 check (id = 1),
  last_checked timestamptz not null
);
alter table public.sign_in_watch enable row level security;

/** What kind of thing signed in, in words an owner can read. */
create or replace function public.sign_in_kind(p_ua text)
returns text
language sql
immutable
as $$
  select case
    when p_ua is null or p_ua = '' then 'program: unnamed (no browser)'
    when p_ua !~* 'mozilla' then 'program: ' || left(split_part(split_part(p_ua, ' ', 1), '/', 1), 40)
    else 'browser: ' ||
      case
        when p_ua ~* 'iphone|ipad' then 'iPhone/iPad'
        when p_ua ~* 'android' then 'Android'
        when p_ua ~* 'CrOS' then 'Chromebook'
        when p_ua ~* 'windows' then 'Windows'
        when p_ua ~* 'macintosh|mac os x' then 'Mac'
        when p_ua ~* 'linux' then 'Linux'
        else 'other system'
      end || ' · ' ||
      case
        when p_ua ~* 'headless' then 'Headless Chrome'
        when p_ua ~* ' Claude/' then 'Claude app'
        when p_ua ~* 'edg/' then 'Edge'
        when p_ua ~* 'firefox|fxios' then 'Firefox'
        when p_ua ~* 'crios|chrome' then 'Chrome'
        when p_ua ~* 'safari' then 'Safari'
        else 'browser'
      end
  end
$$;

/**
 * Sign-ins of a kind never seen before for that person, since the last run.
 * Advances the watermark and records what it returns.
 */
create or replace function public.new_sign_ins()
returns table (
  company_id integer, employee_id integer, employee_name text, email text,
  kind text, user_agent text, ip text, signed_in_at timestamptz, desktop_agent boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  since timestamptz;
  now_ts timestamptz := now();
begin
  select last_checked into since from public.sign_in_watch where id = 1 for update;
  if since is null then
    since := now_ts;
    insert into public.sign_in_watch (id, last_checked) values (1, now_ts) on conflict (id) do nothing;
  end if;

  return query
  with fresh as (
    select s.user_id, s.created_at, s.user_agent, host(s.ip) as ip, public.sign_in_kind(s.user_agent) as k,
           u.email as u_email
      from auth.sessions s
      join auth.users u on u.id = s.user_id
     where s.created_at > since and s.created_at <= now_ts
  ),
  firsts as (
    select distinct on (f.user_id, f.k) f.*
      from fresh f
     where not exists (select 1 from public.sign_in_seen x where x.user_id = f.user_id and x.kind = f.k)
     order by f.user_id, f.k, f.created_at
  ),
  recorded as (
    insert into public.sign_in_seen (user_id, kind, first_seen)
    select f.user_id, f.k, f.created_at from firsts f
    on conflict do nothing
    returning 1
  )
  select e.company_id, e.id, e.name::text, f.u_email::text, f.k, left(f.user_agent, 300), f.ip, f.created_at,
         -- JobScout's own desktop agent signs in as a program ("node") when
         -- someone presses Connect; that pairing leaves a computer session.
         exists (
           select 1 from public.arnie_computer_sessions c
            where c.employee_id = e.id
              and c.created_at between f.created_at - interval '15 minutes' and f.created_at + interval '15 minutes'
         )
    from firsts f
    join public.employees e on lower(e.email) = lower(f.u_email) and e.active = true;

  update public.sign_in_watch set last_checked = now_ts where id = 1;
end;
$$;

revoke all on function public.new_sign_ins() from public, anon, authenticated;
grant execute on function public.new_sign_ins() to service_role;

-- Start from today: every kind already in use counts as seen, so the first
-- run does not email a year of history. (What is in use today was reported
-- to Bryce by hand on 2026-10-20.)
insert into public.sign_in_seen (user_id, kind, first_seen)
select s.user_id, public.sign_in_kind(s.user_agent), min(s.created_at)
  from auth.sessions s
 group by 1, 2
on conflict do nothing;
insert into public.sign_in_watch (id, last_checked) values (1, now()) on conflict (id) do update set last_checked = excluded.last_checked;
