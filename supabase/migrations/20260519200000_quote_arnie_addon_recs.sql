-- Per-estimate cache of Arnie's add-on recommendations.
--
-- arnie_addon_recommendations: jsonb array of { addon_id: bigint, reason: text }
--   ordered most-relevant first; typically 3 items
-- arnie_addon_recs_hash: stable hash of the line items + project total that
--   produced these recommendations. Client compares against the live hash
--   to know whether the cache is still valid. When the estimate's lines
--   change materially, the hash drifts and we re-call Arnie.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS arnie_addon_recommendations jsonb,
  ADD COLUMN IF NOT EXISTS arnie_addon_recs_hash text,
  ADD COLUMN IF NOT EXISTS arnie_addon_recs_at timestamptz;
