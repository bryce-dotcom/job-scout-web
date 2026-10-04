-- A video the AI made keeps its plan, so it can be reopened and changed
-- (music, narrator, scenes) instead of remade from scratch. Shape:
-- { description, sb, aspect, music, musicGain, voiceId, voiceOn, script,
--   source_capture_ids, made_at }. Null on every capture that is not a
-- generated video.
ALTER TABLE public.marketing_captures ADD COLUMN IF NOT EXISTS storyboard jsonb;
COMMENT ON COLUMN public.marketing_captures.storyboard IS 'For source=generated videos: the storyboard + soundtrack settings used, so the maker can reopen it.';
