-- Which estimate line a job line came from.
--
-- Bryce (2026-10-14), looking at a job line whose description reads
-- "Office · 9 ft · 96W T8 → 40W LED · LLLC controls": "The description was
-- created in the estimate… it would be helpful to be able to change it here in
-- the job page. But it would need to change it in the estimate as well, and a
-- little warning that this will change on the estimate as well, and get the
-- user's approval."
--
-- There was nothing to change it THROUGH. _shared/estimateConvert builds each
-- job line with a `_quote_line_id` marker, uses it to re-point the line's
-- photos, and then destructures it out before the insert — so the link existed
-- for the length of one function call and was thrown away. job_lines had no
-- column for it.
--
-- Nullable on purpose, and it will stay null for most rows: only 98 of HHH's
-- 7,172 jobs carry a quote_id at all. A job line with no estimate behind it is
-- the normal case, not a broken one — the job page edits it in place and never
-- offers to propagate.
--
-- No foreign key. quote_lines are deleted when an estimate is re-costed, and a
-- job that outlived its estimate must keep its lines; the app treats a missing
-- quote line as "nothing to propagate to" rather than relying on a cascade.

alter table job_lines add column if not exists quote_line_id integer;

comment on column job_lines.quote_line_id is
  'The quote_lines row this job line was converted from, when there was one. Null is normal. Used to offer "change it on the estimate too" — see src/lib/lineDescription.';

-- The lookup is always "this job's lines, which ones have an estimate line",
-- and the reverse "does anything still point at this quote line".
create index if not exists job_lines_quote_line_idx
  on job_lines (quote_line_id)
  where quote_line_id is not null;

-- Backfill what can be known for certain.
--
-- Only for jobs that carry a quote_id, and only where the job's lines and the
-- estimate's lines line up one-for-one on item_id. Where a quote has two lines
-- of the same product, or the counts differ because somebody edited the job,
-- the match is a guess and the row is left null — a wrong link here would
-- rewrite the wrong line on the estimate, which is worse than no link at all.
with pairs as (
  select
    jl.id as job_line_id,
    ql.id as quote_line_id,
    count(*) over (partition by jl.job_id, jl.item_id) as job_dupes,
    count(*) over (partition by ql.quote_id, ql.item_id) as quote_dupes
  from jobs j
  join job_lines jl on jl.job_id = j.id
  join quote_lines ql on ql.quote_id = j.quote_id and ql.item_id = jl.item_id
  where j.quote_id is not null
    and jl.item_id is not null
    and jl.quote_line_id is null
)
update job_lines jl
   set quote_line_id = p.quote_line_id
  from pairs p
 where jl.id = p.job_line_id
   and p.job_dupes = 1
   and p.quote_dupes = 1;
