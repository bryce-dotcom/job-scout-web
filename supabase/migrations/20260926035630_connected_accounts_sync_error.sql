-- Plaid item health, so Books can say "your bank needs a re-login" instead of
-- silently showing stale balances. get_accounts / sync_all stamp these on a
-- Plaid error (ITEM_LOGIN_REQUIRED etc.) and clear them on the next success.
-- balance_synced_at is when the BALANCES were last refreshed (last_synced is
-- the transaction cursor stamp and never moved on a balance refresh).
ALTER TABLE connected_accounts
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS sync_error_code TEXT,
  ADD COLUMN IF NOT EXISTS sync_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_synced_at TIMESTAMPTZ;
