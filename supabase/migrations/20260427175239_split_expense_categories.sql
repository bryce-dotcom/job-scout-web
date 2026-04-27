-- Split a single manual_expense (e.g. one check to a vendor) across multiple
-- expense_categories. When rows exist here for a given expense_id, the parent
-- manual_expenses.category_id should be considered a "primary"/derived value
-- and category rollups should sum splits per category instead.
--
-- Sum of split amounts is expected to equal the parent expense.amount
-- (enforced in the UI; not a hard DB constraint to allow partial saves).

CREATE TABLE IF NOT EXISTS public.expense_splits (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expense_id BIGINT NOT NULL REFERENCES public.manual_expenses(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_company_id ON public.expense_splits(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_category_id ON public.expense_splits(category_id);

ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Match the policy style used by sibling Books tables (manual_expenses,
-- assets, liabilities) which use a permissive all_access policy. Multi-tenant
-- scoping is enforced at the query layer via company_id filters.
DO $$ BEGIN
  CREATE POLICY "all_access" ON public.expense_splits FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
