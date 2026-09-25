-- Marketing video.
--
-- A video capture carries a poster and a few frames, pulled out in the
-- browser at upload time (the edge runtime has no ffmpeg). The drafter
-- reads the frames the way it reads photos; the queue shows the poster
-- with a play badge; the publisher sends the video file by URL.
--
-- A post remembers whether it is a photo post or a video post, because the
-- vendor's endpoints differ and TikTok / YouTube take video only.

ALTER TABLE public.marketing_captures ADD COLUMN IF NOT EXISTS poster_url text;
ALTER TABLE public.marketing_captures ADD COLUMN IF NOT EXISTS frames text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.marketing_captures ADD COLUMN IF NOT EXISTS duration_s numeric;
COMMENT ON COLUMN public.marketing_captures.poster_url IS 'Video only: a still from ~1s in, public URL, used as the thumbnail.';
COMMENT ON COLUMN public.marketing_captures.frames     IS 'Video only: up to 4 stills spread across the clip, public URLs, what the drafter looks at.';

ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';
COMMENT ON COLUMN public.marketing_posts.media_type IS 'image | video | text — decides which vendor endpoint publishes it.';
