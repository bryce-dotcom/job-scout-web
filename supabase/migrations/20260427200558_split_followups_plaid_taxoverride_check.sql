-- Split-feature follow-ups:
--   1. Allow expense_splits to attach to a Plaid transaction (not just a manual_expense)
--   2. Add per-line tax_category override (falls back to category default in UI)
--   3. Deferred constraint trigger that validates SUM(splits.amount) = parent.amount
--      at COMMIT time. Pure CHECK can't span rows; deferred trigger can.

-- 1) New parent FK column for Plaid transactions. plaid_transactions.id is INTEGER (SERIAL).
ALTER TABLE public.expense_splits
  ADD COLUMN IF NOT EXISTS plaid_transaction_id INTEGER
    REFERENCES public.plaid_transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_expense_splits_plaid_txn_id
  ON public.expense_splits(plaid_transaction_id);

-- 1a) Existing expense_id was NOT NULL — relax it now that splits can hang off either parent.
ALTER TABLE public.expense_splits
  ALTER COLUMN expense_id DROP NOT NULL;

-- 1b) XOR: exactly one of expense_id / plaid_transaction_id must be set per row.
DO $$ BEGIN
  ALTER TABLE public.expense_splits
    ADD CONSTRAINT expense_splits_xor_parent
    CHECK (
      (expense_id IS NOT NULL AND plaid_transaction_id IS NULL)
      OR
      (expense_id IS NULL AND plaid_transaction_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Per-line tax-category override. Nullable: NULL = use category default.
ALTER TABLE public.expense_splits
  ADD COLUMN IF NOT EXISTS tax_category TEXT;

-- 3) Deferred constraint trigger: SUM(splits.amount) must equal parent.amount
--    at COMMIT (allow ±$0.01 rounding). Zero splits = no constraint.
CREATE OR REPLACE FUNCTION public.validate_expense_splits_sum()
RETURNS TRIGGER AS $$
DECLARE
  v_expense_id  BIGINT;
  v_plaid_id    INTEGER;
  v_parent_amt  NUMERIC(14,2);
  v_split_sum   NUMERIC(14,2);
  v_has_rows    BOOLEAN;
BEGIN
  -- Determine which parent row was touched by this NEW/OLD record.
  IF TG_OP = 'DELETE' THEN
    v_expense_id := OLD.expense_id;
    v_plaid_id   := OLD.plaid_transaction_id;
  ELSE
    v_expense_id := NEW.expense_id;
    v_plaid_id   := NEW.plaid_transaction_id;
  END IF;

  -- Manual expense parent.
  IF v_expense_id IS NOT NULL THEN
    SELECT amount INTO v_parent_amt FROM public.manual_expenses WHERE id = v_expense_id;
    -- Parent might already be deleted (CASCADE) — nothing to validate.
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT EXISTS (SELECT 1 FROM public.expense_splits WHERE expense_id = v_expense_id)
      INTO v_has_rows;
    IF NOT v_has_rows THEN RETURN NULL; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_split_sum
      FROM public.expense_splits WHERE expense_id = v_expense_id;

    IF ABS(v_split_sum - COALESCE(v_parent_amt, 0)) > 0.01 THEN
      RAISE EXCEPTION
        'expense_splits sum (%) does not match manual_expenses.amount (%) for expense_id=%',
        v_split_sum, v_parent_amt, v_expense_id;
    END IF;
  END IF;

  -- Plaid transaction parent. Plaid amount sign convention: positive = money out;
  -- compare against absolute value of parent amount.
  IF v_plaid_id IS NOT NULL THEN
    SELECT ABS(amount) INTO v_parent_amt FROM public.plaid_transactions WHERE id = v_plaid_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT EXISTS (SELECT 1 FROM public.expense_splits WHERE plaid_transaction_id = v_plaid_id)
      INTO v_has_rows;
    IF NOT v_has_rows THEN RETURN NULL; END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_split_sum
      FROM public.expense_splits WHERE plaid_transaction_id = v_plaid_id;

    IF ABS(v_split_sum - COALESCE(v_parent_amt, 0)) > 0.01 THEN
      RAISE EXCEPTION
        'expense_splits sum (%) does not match plaid_transactions absolute amount (%) for plaid_transaction_id=%',
        v_split_sum, v_parent_amt, v_plaid_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- DROP first so re-running migration replaces cleanly.
DROP TRIGGER IF EXISTS expense_splits_sum_check ON public.expense_splits;

CREATE CONSTRAINT TRIGGER expense_splits_sum_check
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_expense_splits_sum();
