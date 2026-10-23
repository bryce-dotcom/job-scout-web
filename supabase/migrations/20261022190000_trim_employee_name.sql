-- An employee name can never again carry stray whitespace.
--
-- `jobs.assigned_team` is a comma-separated string of employee NAMES used as a
-- foreign key, so the name is load-bearing: every surface that asks "is this
-- person on this job?" compares text. Employee 55 was stored as "Robyn Lyman "
-- with a trailing space while the readers trimmed their own side, so the
-- comparison never matched. All 23 of her jobs failed to resolve her, and
-- opening and saving any one of them would have dropped her from the crew.
--
-- Eight of these existed across company 3 (Payton Barnes, Robyn Lyman, Larry
-- Sullivan, Alex Burrows, Noah Sorensen, Angeline Putnam, Energy Scout Team,
-- Nycole Westcott), all from ordinary data entry. lib/crewRoster now forgives
-- them on read, but forgiving the symptom is the second line of defence. This
-- is the first: the bad value cannot be stored.
--
-- btrim also takes tabs and newlines, which a paste out of a spreadsheet
-- brings along. Inner whitespace is left alone — "Mary  Jane" with two spaces
-- is the user's business, and crewRoster.normalizeName collapses it for
-- comparison without rewriting what they typed.

CREATE OR REPLACE FUNCTION trim_employee_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := btrim(NEW.name, E' \t\r\n');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_trim_name ON employees;

CREATE TRIGGER employees_trim_name
  BEFORE INSERT OR UPDATE OF name ON employees
  FOR EACH ROW
  EXECUTE FUNCTION trim_employee_name();

-- Clean what is already there. Company 3's eight were trimmed by hand on
-- 2026-10-22; this catches every other tenant, and makes the migration
-- idempotent for anyone restoring from an older dump.
--
-- It skips a row whose trimmed name would collide with another employee in
-- the same company. Company 9 holds both "Kade Coleman " (254) and "Kade
-- Coleman" (74), both active — two records for what is probably one person.
-- Trimming would make them indistinguishable to the name-based crew matcher,
-- so the migration leaves it for a human to merge rather than quietly
-- deepening the ambiguity. The trigger above still normalizes that row if
-- someone deliberately edits it; this only governs the silent sweep.
UPDATE employees e
   SET name = btrim(e.name, E' \t\r\n')
 WHERE e.name IS NOT NULL
   AND e.name <> btrim(e.name, E' \t\r\n')
   AND NOT EXISTS (
     SELECT 1 FROM employees o
      WHERE o.id <> e.id
        AND o.company_id IS NOT DISTINCT FROM e.company_id
        AND btrim(o.name, E' \t\r\n') = btrim(e.name, E' \t\r\n')
   );
