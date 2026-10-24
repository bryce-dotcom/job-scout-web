-- The learning loop, part 3 (Bryce, 2026-10-23): every rule a company teaches
-- Arnie becomes a test he takes every night, on that company's own data.
--
-- A rule is a lesson someone had to teach him — usually by correcting him.
-- Approving it is not the end: the question is whether he still follows it a
-- month later, after a model change or a prompt change. arnie-lesson-tests
-- writes one realistic question per active rule (and what a right answer must
-- do), asks it as a real employee of that company with LOOK-UPS ONLY (no card,
-- email, text or computer step can happen), and has the answer judged against
-- the rule. The result lives here; Monday's review shows any rule he broke.
--
-- Service key only; RLS on, no policies. A retired rule's test is skipped.
create table if not exists public.arnie_lesson_tests (
  id bigserial primary key,
  company_id integer not null references public.companies(id) on delete cascade,
  rule_id bigint not null references public.company_rules(id) on delete cascade,
  question text not null,
  must text not null,
  created_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_passed boolean,
  last_answer text,
  last_why text,
  runs integer not null default 0,
  fails integer not null default 0,
  fails_in_a_row integer not null default 0,
  unique (rule_id)
);
create index if not exists arnie_lesson_tests_due on public.arnie_lesson_tests (last_run_at nulls first);
alter table public.arnie_lesson_tests enable row level security;

-- 03:00–05:50 Mountain, every ten minutes: a few tests per call, so no single
-- call runs long. Each test runs at most once a day.
select cron.unschedule('arnie-lesson-tests') where exists (select 1 from cron.job where jobname = 'arnie-lesson-tests');
select cron.schedule(
  'arnie-lesson-tests',
  '*/10 9-11 * * *',
  $$
  select net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/arnie-lesson-tests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_key' limit 1)
    ),
    body := '{"cron": true}'::jsonb,
    timeout_milliseconds := 145000
  );
  $$
);
