-- Which video goes when a post carries several: every network takes one
-- video per post, so the composer (or the AI) names the one that fits the
-- caption best and the rest stay in the inbox for their own posts.
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS primary_capture_id bigint;
COMMENT ON COLUMN public.marketing_posts.primary_capture_id IS 'The capture that is sent when a post has several videos; null = the first video.';
