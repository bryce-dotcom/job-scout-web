-- How much the assistant says (Bryce, 2026-10-20): "most people just want her
-- to haul ass and give the most concise answer to the question ... can this be
-- her default mode with a toggle that allows for the details?"
--
-- 'brief'    (default) — the answer first, no narration of what she is doing,
--            and the "let me check…" text from lookup rounds is dropped on the
--            server before it reaches the screen.
-- 'detailed' — she says what she is checking and why, as before.
-- Per person, on their arnie_personas row; no row = brief.

alter table public.arnie_personas
  add column if not exists detail text not null default 'brief';

do $$ begin
  alter table public.arnie_personas
    add constraint arnie_personas_detail_check check (detail in ('brief', 'detailed'));
exception when duplicate_object then null; end $$;
