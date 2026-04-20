-- Per-invoice conversation log so payment-arrangement chats live with the
-- invoice they're about (not in someone's email or sticky notes).
-- Stored as a jsonb array of {at, by, text} entries — append-only via the UI.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS conversation_log jsonb NOT NULL DEFAULT '[]'::jsonb;
