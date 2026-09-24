-- Marketing, phase 1: field photos in, AI-drafted posts out, one publisher.
--
-- Two tables and one bucket.
--
--   marketing_captures  the inbox. A photo a tech snapped on a job (Field
--                       Scout "Share to Marketing"), or one an office user
--                       uploaded on the Marketing page. It sits here until
--                       someone makes a post out of it or dismisses it.
--   marketing_posts     the queue. One row per post: the AI's first draft is
--                       kept beside the caption the human approved, because
--                       that pair IS the style-learning data. Nothing here
--                       learns by fine-tuning; the drafter reads the last
--                       approved captions and the last edits as examples.
--   marketing-media     a PUBLIC bucket. Ayrshare fetches media by URL, so
--                       the file has to be reachable without a token. Private
--                       job photos stay in project-documents; a capture is a
--                       COPY the tech chose to share.
--
-- Brand kit and the Ayrshare key live in settings (keys marketing_brand_kit,
-- marketing_ayrshare) like every other per-company config blob.

CREATE TABLE IF NOT EXISTS public.marketing_captures (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id   integer REFERENCES public.employees(id) ON DELETE SET NULL,
  job_id        bigint REFERENCES public.jobs(id) ON DELETE SET NULL,
  bucket        text NOT NULL DEFAULT 'marketing-media',
  path          text NOT NULL,
  url           text NOT NULL,                 -- public URL, what the AI and Ayrshare read
  media_type    text NOT NULL DEFAULT 'image', -- image | video
  note          text,                          -- what the tech said about it
  status        text NOT NULL DEFAULT 'new',   -- new | used | dismissed
  post_id       bigint,                        -- set when a post was made from it
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_captures_inbox_idx
  ON public.marketing_captures (company_id, created_at DESC) WHERE status = 'new';

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- draft: nobody has approved it. approved: ready to publish. scheduled:
  -- Ayrshare holds it for scheduled_for. posted: live. failed: Ayrshare said
  -- no (error holds why). archived: hidden.
  status        text NOT NULL DEFAULT 'draft',
  caption       text NOT NULL DEFAULT '',
  ai_draft      text,                          -- the caption as the AI first wrote it
  hashtags      text[] NOT NULL DEFAULT '{}',
  platforms     text[] NOT NULL DEFAULT '{}',  -- Ayrshare platform ids
  media_urls    text[] NOT NULL DEFAULT '{}',
  capture_ids   bigint[] NOT NULL DEFAULT '{}',
  source        text NOT NULL DEFAULT 'manual',-- photo | manual
  job_id        bigint REFERENCES public.jobs(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  posted_at     timestamptz,
  ayrshare_id   text,
  post_urls     jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{platform, postUrl, id}]
  error         text,
  created_by    integer REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_by   integer REFERENCES public.employees(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_posts_queue_idx
  ON public.marketing_posts (company_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.marketing_posts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS marketing_posts_touch ON public.marketing_posts;
CREATE TRIGGER marketing_posts_touch
  BEFORE UPDATE ON public.marketing_posts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_posts_touch();

ALTER TABLE public.marketing_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_posts    ENABLE ROW LEVEL SECURITY;

-- Anyone in the company can read the inbox and file into it (that is the
-- point: a tech shares a photo). Drafting is open too. Publishing is gated in
-- the marketing-publish function (Manager and above), not here, because the
-- gate is "may this person put words in the company's mouth", which is a
-- function-level decision with the Ayrshare key in hand.
DO $$ BEGIN
  CREATE POLICY marketing_captures_select ON public.marketing_captures FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_captures_insert ON public.marketing_captures FOR INSERT
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_captures_update ON public.marketing_captures FOR UPDATE
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_captures_delete ON public.marketing_captures FOR DELETE
    USING (company_id IN (SELECT public.current_user_company_ids())
           AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY marketing_posts_select ON public.marketing_posts FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_posts_insert ON public.marketing_posts FOR INSERT
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_posts_update ON public.marketing_posts FOR UPDATE
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_posts_delete ON public.marketing_posts FOR DELETE
    USING (company_id IN (SELECT public.current_user_company_ids())
           AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The public bucket. Paths are <company_id>/<...>, and the upload policy
-- pins the first folder to the caller's own company so one tenant cannot
-- write into another's folder even though everyone can read.
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-media', 'marketing-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY marketing_media_select ON storage.objects
    FOR SELECT USING (bucket_id = 'marketing-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_media_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'marketing-media'
                AND (storage.foldername(name))[1] IN
                    (SELECT c::text FROM public.current_user_company_ids() AS c));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_media_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'marketing-media'
           AND (storage.foldername(name))[1] IN
               (SELECT c::text FROM public.current_user_company_ids() AS c));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.marketing_captures IS 'Marketing inbox: photos shared from the field or uploaded, waiting to become posts.';
COMMENT ON TABLE public.marketing_posts    IS 'Social post queue. ai_draft beside caption is the style-learning data: the drafter reads approved captions and edits as examples.';
