-- Line quantities are not always whole numbers.
--
-- quote_lines.quantity and job_lines.quantity have been integer since the
-- schema was built around lighting, where a quantity counts fixtures and a
-- fixture is never 0.78 of a fixture. Every trade added since has fitted that
-- assumption by luck: window panes, lawn visits, treatment rounds.
--
-- Excavation does not. A strip of topsoil is 777.78 CY, an import is 620.4
-- tons, a pipe run is 340.5 LF. These are measured quantities, not counts.
--
-- The failure this caused was not a visible error. Don built its five lines,
-- Postgres rejected the batch with 22P02 "invalid input syntax for type
-- integer", the insert error was only console.warn'd, and the UI reported
-- "Pushed to the pipeline as Quote #4615 with 5 line items." The quote existed
-- with its headline total and NOTHING itemised under it — the worst possible
-- shape for a document you hand a customer.
--
-- Widening integer -> numeric is backward compatible: every existing value is
-- still valid, nothing loses precision, and code that reads the column keeps
-- getting a number. Rounding Don's quantities instead was the alternative, and
-- it is wrong twice over — it misprices the line, and it stops the bid
-- reconciling with the volumes Don shows on the takeoff it came from.

ALTER TABLE public.quote_lines
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

ALTER TABLE public.job_lines
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

COMMENT ON COLUMN public.quote_lines.quantity IS
  'Measured or counted quantity. Numeric, not integer — excavation bills fractional CY, LF and tons.';
COMMENT ON COLUMN public.job_lines.quantity IS
  'Measured or counted quantity. Numeric, not integer — an accepted excavation bid lands here.';

NOTIFY pgrst, 'reload schema';
