-- Paystub delivery.
--
-- Bryce, 2026-10-10: "it's gotta be as good as Gusto." Gusto emails every
-- employee their stub on payday; JobScout had the PDF but only an admin
-- could download it one at a time. These columns let a run's stubs be
-- rendered once, stored, and emailed or texted, with a record of when
-- each one went out and why one did not.
--
-- Idempotent. Applied directly to production and recorded with
-- `supabase migration repair` (see memory: migrations-apply-directly).

ALTER TABLE public.paystubs
  ADD COLUMN IF NOT EXISTS pdf_path      text,
  ADD COLUMN IF NOT EXISTS emailed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS texted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_note text;

COMMENT ON COLUMN public.paystubs.pdf_path IS 'Rendered stub PDF in the project-documents bucket (paystubs/<company>/<run>/<stub>.pdf).';
COMMENT ON COLUMN public.paystubs.emailed_at IS 'When the stub PDF was last emailed to the employee.';
COMMENT ON COLUMN public.paystubs.texted_at IS 'When a link to the stub was last texted to the employee.';
COMMENT ON COLUMN public.paystubs.delivery_note IS 'Why delivery did not happen (no email on file, send failed, ...).';

-- Deposit reminders: one daily job, every tenant. 13:00 UTC = 7am Mountain.
DO $$
BEGIN
  PERFORM cron.unschedule('payroll-deadline-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'payroll-deadline-reminders',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/payroll-deadline-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU'
    ),
    body := '{}'::jsonb
  );
  $$
);
