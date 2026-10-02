-- How a video post should land: a Reel (Instagram Reel + Facebook Reel,
-- the default), a plain feed video (Facebook video post; Instagram has
-- no plain video any more, so still a Reel there), or a Story (24 hours
-- on Instagram and Facebook, no caption shown).
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS video_format text NOT NULL DEFAULT 'reel';
COMMENT ON COLUMN public.marketing_posts.video_format IS 'reel | video | story — only meaningful when media_type = video.';
