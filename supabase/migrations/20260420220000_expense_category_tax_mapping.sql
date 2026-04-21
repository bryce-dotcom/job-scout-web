-- Add a default tax-category mapping to expense_categories so the Books edit
-- modal can auto-fill the Tax Category once the user picks an Expense Category.
-- Also seed COGS / Job Materials / Subcontractors which were missing.

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS default_tax_category text;

-- Backfill defaults for the existing global seed categories.
UPDATE public.expense_categories SET default_tax_category = 'Line 20 - Auto expenses'           WHERE name = 'Fuel'      AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 20 - Office expenses'         WHERE name = 'Supplies'  AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 16a - Depreciation'           WHERE name = 'Equipment' AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 20 - Advertising'             WHERE name = 'Marketing' AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 20 - Insurance'               WHERE name = 'Insurance' AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 20 - Utilities'               WHERE name = 'Utilities' AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 9 - Salaries and wages'       WHERE name = 'Payroll'   AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Line 20 - Other deductions'        WHERE name = 'Other'     AND default_tax_category IS NULL;
UPDATE public.expense_categories SET default_tax_category = 'Income'                            WHERE type = 'income'    AND default_tax_category IS NULL;

-- Seed the missing job-cost / contractor categories that field-services
-- companies need (these were the gaps Tracy flagged).
INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Cost of Goods Sold', '📦', '#dc2626', 'expense', 9, 'Line 2 - Cost of goods sold'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Cost of Goods Sold' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Job Materials', '🧱', '#ea580c', 'expense', 9, 'Line 2 - Cost of goods sold'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Job Materials' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Subcontractors', '👷', '#0891b2', 'expense', 9, 'Line 20 - Contract labor'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Subcontractors' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Vehicle Maintenance', '🚛', '#7c3aed', 'expense', 9, 'Line 20 - Auto expenses'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Vehicle Maintenance' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Rent', '🏢', '#65a30d', 'expense', 9, 'Line 14 - Rent'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Rent' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Repairs & Maintenance', '🔨', '#0d9488', 'expense', 9, 'Line 12 - Repairs and maintenance'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Repairs & Maintenance' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Travel', '✈️', '#0284c7', 'expense', 9, 'Line 20 - Travel'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Travel' AND company_id IS NULL);

INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, 'Meals', '🍽️', '#d97706', 'expense', 9, 'Line 20 - Meals'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Meals' AND company_id IS NULL);

-- RLS for expense_categories: if RLS is enabled on the table, allow authenticated
-- users to read everything and to CRUD rows only for their OWN company. Globals
-- (company_id IS NULL) stay read-only to normal users. The employees table does
-- not carry auth.uid() directly; we match on email.
DO $$ BEGIN
  CREATE POLICY "expense_categories_select_authenticated"
    ON public.expense_categories FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "expense_categories_insert_own_company"
    ON public.expense_categories FOR INSERT
    TO authenticated
    WITH CHECK (
      company_id IS NOT NULL AND company_id IN (
        SELECT e.company_id FROM public.employees e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "expense_categories_update_own_company"
    ON public.expense_categories FOR UPDATE
    TO authenticated
    USING (
      company_id IS NOT NULL AND company_id IN (
        SELECT e.company_id FROM public.employees e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "expense_categories_delete_own_company"
    ON public.expense_categories FOR DELETE
    TO authenticated
    USING (
      company_id IS NOT NULL AND company_id IN (
        SELECT e.company_id FROM public.employees e WHERE lower(e.email) = lower(auth.jwt() ->> 'email')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
