-- =====================================================================
-- Notes written on an estimate after it became a job reach the job.
--
-- Damien, 2026-09-14 (ticket f6e94039): "If an estimate is converted to a
-- job, any notes that are changed or added after that point aren't
-- transferring over."
--
-- Conversion copies the estimate's text once (_shared/estimateConvert.ts):
--   jobs.notes   = notes ⏎⏎ summary
--   jobs.details = summary ⏎⏎ notes ⏎⏎ estimate_message
-- and then the two rows drift: the rep keeps writing on the estimate page
-- (it is the page they live on), the crew reads the job. The estimate page
-- even told them so — "edits here won't update the job" — which is a notice
-- about a bug, not a feature.
--
-- Same shape as party sync (20260914180000): the database keeps the copy in
-- step, in the one place every write passes through, so the page, Arnie and
-- the portal need no code of their own.
--
-- THE RULE (estimate_text_follow), in order:
--   1. the estimate's new text is empty          → leave the job alone.
--      Clearing a field on the estimate never blanks the crew's copy.
--   2. the job already contains the new text     → unchanged (idempotent).
--   3. the job's field is empty                  → the new text.
--   4. the job still holds the OLD text          → replace it in place, so
--      anything ops typed around it survives.
--   5. otherwise (ops rewrote it past recognition)→ append the new text.
-- Fill-only and convergent: run twice, nothing moves.
-- =====================================================================

-- Exactly the composition estimateConvert.ts uses. filter(Boolean) drops
-- '' and null; nullif does the same here.
create or replace function public.estimate_notes_compose(p_notes text, p_summary text)
returns text language sql immutable as $$
  select nullif(concat_ws(E'\n\n', nullif(p_notes, ''), nullif(p_summary, '')), '')
$$;

create or replace function public.estimate_details_compose(p_summary text, p_notes text, p_message text)
returns text language sql immutable as $$
  select nullif(concat_ws(E'\n\n', nullif(p_summary, ''), nullif(p_notes, ''), nullif(p_message, '')), '')
$$;

create or replace function public.estimate_text_follow(p_current text, p_old text, p_new text)
returns text language plpgsql immutable as $$
begin
  if p_new is null or p_new = '' then return p_current; end if;                    -- 1
  if p_current is not null and position(p_new in p_current) > 0 then return p_current; end if; -- 2
  if p_current is null or p_current = '' then return p_new; end if;                -- 3
  if p_old is not null and p_old <> '' and position(p_old in p_current) > 0 then  -- 4
    return replace(p_current, p_old, p_new);
  end if;
  return p_current || E'\n\n' || p_new;                                             -- 5
end
$$;

create or replace function public.quote_notes_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_notes   text := estimate_notes_compose(old.notes, old.summary);
  new_notes   text := estimate_notes_compose(new.notes, new.summary);
  old_details text := estimate_details_compose(old.summary, old.notes, old.estimate_message);
  new_details text := estimate_details_compose(new.summary, new.notes, new.estimate_message);
begin
  -- Only jobs made FROM this estimate. company_id as well as quote_id so a
  -- stray id can never cross a tenant.
  update public.jobs j
     set notes      = estimate_text_follow(j.notes, old_notes, new_notes),
         details    = estimate_text_follow(j.details, old_details, new_details),
         updated_at = now()
   where j.quote_id = new.id
     and j.company_id = new.company_id
     and (   j.notes   is distinct from estimate_text_follow(j.notes, old_notes, new_notes)
          or j.details is distinct from estimate_text_follow(j.details, old_details, new_details));
  return new;
end
$$;

drop trigger if exists quote_notes_after on public.quotes;
create trigger quote_notes_after
  after update of notes, summary, estimate_message on public.quotes
  for each row
  when (old.notes is distinct from new.notes
     or old.summary is distinct from new.summary
     or old.estimate_message is distinct from new.estimate_message)
  execute function public.quote_notes_after();
