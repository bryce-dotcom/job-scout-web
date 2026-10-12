-- What a post did, kept on the post. The Performance tab used to fetch the
-- publisher's per-post snapshot and throw it away; now marketing-publish
-- writes the summed numbers here so the drafter can learn from the posts
-- that performed, not only from edits.
-- metrics: { views, reach, likes, comments, shares, saves, clicks, score }
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS metrics jsonb;
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS metrics_at timestamptz;
COMMENT ON COLUMN public.marketing_posts.metrics IS 'Summed per-post numbers from the publisher (views, reach, likes, comments, shares, saves, clicks, score); refreshed when the Performance tab loads.';
