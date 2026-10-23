-- Receipts the phone lost (Bryce, 2026-10-22). A tech snaps a receipt and
-- pockets the phone; the read finishes on the server, the answer is lost
-- while the app sleeps, and the expense went in at $0 "Dougie could not read
-- it" — two clear Home Depot receipts that way in October, ~$1,940 of job
-- cost at $0 across the month. receipt-reread reads them again from the
-- stored photo every ten minutes, three tries each; what is still $0 after
-- that is flagged on the Expenses page for a person.
alter table public.expenses
  add column if not exists receipt_read_attempts smallint not null default 0,
  add column if not exists receipt_read_at timestamptz;

create index if not exists expenses_receipt_unread
  on public.expenses (created_at)
  where amount = 0 and receipt_storage_path is not null;

select cron.unschedule('receipt-reread') where exists (select 1 from cron.job where jobname = 'receipt-reread');
select cron.schedule(
  'receipt-reread',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/receipt-reread',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_key' limit 1)
    ),
    body := '{"cron": true}'::jsonb,
    timeout_milliseconds := 140000
  );
  $$
);
