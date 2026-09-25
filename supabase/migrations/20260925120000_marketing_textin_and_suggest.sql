-- Marketing, phase 2a: photos arrive by text, and drafts write themselves.
--
-- marketing_captures.source says how a photo got into the inbox:
--   shared     a tech tapped Share to Marketing in Field Scout
--   text       a tech texted it to the company's Twilio number (marketing-textin)
--   suggested  marketing-suggest found it on a job that finished yesterday
--
-- A suggested capture points at the job's PRIVATE photo (project-documents);
-- nothing is copied to the public marketing-media bucket until a human
-- publishes the post. The page signs private URLs to show them.
--
-- The cron knocks daily; marketing-suggest drafts a post for every photo
-- group nobody turned into one, and tells the managers.

ALTER TABLE public.marketing_captures
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'shared';
COMMENT ON COLUMN public.marketing_captures.source IS 'shared | text | suggested — how the photo reached the inbox';

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS suggested_at timestamptz;
COMMENT ON COLUMN public.marketing_posts.suggested_at IS 'Set when marketing-suggest wrote this draft unasked; null for human-started posts.';

CREATE INDEX IF NOT EXISTS marketing_posts_job_idx ON public.marketing_posts (company_id, job_id) WHERE job_id IS NOT NULL;

DO $$
BEGIN
  PERFORM cron.unschedule('marketing-suggest-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 13:30 UTC = 7:30 Mountain. Yesterday's finished work is in the queue
-- before the office opens.
SELECT cron.schedule(
  'marketing-suggest-daily',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/marketing-suggest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU'
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);
