-- Real music under marketing videos. A track is composed by ElevenLabs
-- Music (marketing-music fn, commercially cleared on paid plans) or
-- uploaded by the company, stored in marketing-media/<co>/music/, and
-- listed here so the video makers can pick it again. The synthesised
-- "beds" in src/lib/musicBed.js stay only as the fallback when no key.
CREATE TABLE IF NOT EXISTS public.marketing_music (
  id          bigserial PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title       text NOT NULL,
  prompt      text,                          -- what was asked of the composer
  mood        text,                          -- calm | upbeat | bold | custom
  url         text NOT NULL,                 -- public URL in marketing-media
  path        text NOT NULL,
  seconds     numeric,
  source      text NOT NULL DEFAULT 'eleven', -- eleven | upload
  created_by  integer REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_music_company_idx ON public.marketing_music (company_id, created_at DESC);
ALTER TABLE public.marketing_music ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY marketing_music_select ON public.marketing_music FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_music_insert ON public.marketing_music FOR INSERT
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_music_update ON public.marketing_music FOR UPDATE
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_music_delete ON public.marketing_music FOR DELETE
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
