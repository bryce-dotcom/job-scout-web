-- "Hey Jenny" on an iPhone (Bryce, 2026-10-26, after a post showing "Hey Grok"
-- through Shortcuts + Vocal Shortcuts). JobScout is a web app, so a Shortcut
-- cannot open it the way it opens Grok; instead the Shortcut itself listens,
-- sends the words to arnie-voice, and reads the answer aloud.
--
-- A voice key is how that Shortcut proves who is talking. One person's key,
-- made by them in Arnie → Settings, shown to them ONCE; only its SHA-256 is
-- kept here, so nobody — us included — can read it back. It acts as that one
-- employee with their own access, never more, and they can switch it off at
-- any time. Service key only; RLS on, no policies (arnie-voice reads it).
create table if not exists public.arnie_voice_keys (
  id bigserial primary key,
  company_id integer not null references public.companies(id) on delete cascade,
  employee_id integer not null references public.employees(id) on delete cascade,
  key_hash text not null unique,
  hint text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  uses_today integer not null default 0,
  uses_day date,
  revoked_at timestamptz
);
create index if not exists arnie_voice_keys_employee on public.arnie_voice_keys (employee_id) where revoked_at is null;
alter table public.arnie_voice_keys enable row level security;
