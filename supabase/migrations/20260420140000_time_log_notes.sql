-- Add notes column to time_log so the JobDetail "Add Time Entry" form can
-- actually save (it currently inserts a `notes` field that doesn't exist on
-- the table — PostgREST returns 400 and the row never lands, but the UI
-- swallows the error).
ALTER TABLE public.time_log
  ADD COLUMN IF NOT EXISTS notes text;
