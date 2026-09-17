-- A standard construction chart of expense categories, in the shared
-- catalogue (company_id IS NULL) so every company has it: the five on the
-- books today and each one that signs up after.
--
-- Bryce, 17 Sep: "pre populate expense categories with standard construction
-- business categories for all instances." The catalogue had 20 rows, a
-- general-business list plus the job-cost handful Tracy asked for. A trade
-- contractor books thirty more things than that every month: permits, dump
-- fees, equipment rental, bonds, workers' comp, uniforms, retainage.
--
-- Each row carries the tax line Books auto-fills when it is picked, using
-- the exact values in src/lib/taxCategories.js. Sort order: 9 sits with the
-- job-cost group, 20 is overhead, 13 follows the income rows.
--
-- Idempotent: a name already in the shared catalogue is left alone.
INSERT INTO public.expense_categories (company_id, name, icon, color, type, sort_order, default_tax_category)
SELECT NULL, v.name, v.icon, v.color, v.type, v.sort_order, v.tax
FROM (VALUES
  -- Job costs
  ('Equipment Rental',          '🏗️', '#b45309', 'expense',  9, 'Line 20 - Equipment rental'),
  ('Permits & Inspections',     '📋', '#4b5563', 'expense',  9, 'Line 15 - Taxes and licenses'),
  ('Dump & Disposal Fees',      '🗑️', '#78716c', 'expense',  9, 'Line 2 - Cost of goods sold'),
  ('Freight & Delivery',        '🚚', '#0369a1', 'expense',  9, 'Line 2 - Cost of goods sold'),
  ('Job Site Costs',            '🚧', '#a16207', 'expense',  9, 'Line 2 - Cost of goods sold'),
  ('Small Tools & Consumables', '🪛', '#7c2d12', 'expense',  9, 'Line 20 - Other deductions'),
  ('Warranty & Callbacks',      '🔁', '#9f1239', 'expense',  9, 'Line 2 - Cost of goods sold'),
  -- Overhead
  ('Licenses & Bonds',          '📜', '#1d4ed8', 'expense', 20, 'Line 15 - Taxes and licenses'),
  ('Workers'' Comp Insurance',  '🦺', '#0e7490', 'expense', 20, 'Line 20 - Insurance'),
  ('Payroll Taxes',             '🧾', '#15803d', 'expense', 20, 'Line 15 - Taxes and licenses'),
  ('Employee Benefits',         '🩺', '#be185d', 'expense', 20, 'Line 19 - Employee benefit programs'),
  ('Retirement Contributions',  '🏦', '#6d28d9', 'expense', 20, 'Line 18 - Retirement plans'),
  ('Guaranteed Payments',       '👔', '#3f6212', 'expense', 20, 'Line 10 - Guaranteed payments'),
  ('Uniforms & Safety Gear',    '🥾', '#92400e', 'expense', 20, 'Line 20 - Other deductions'),
  ('Training & Certifications', '🎓', '#1e40af', 'expense', 20, 'Line 20 - Other deductions'),
  ('Phone & Internet',          '📱', '#0f766e', 'expense', 20, 'Line 20 - Utilities'),
  ('Professional Fees',         '⚖️', '#334155', 'expense', 20, 'Line 20 - Other deductions'),
  ('Bank & Merchant Fees',      '💳', '#475569', 'expense', 20, 'Line 20 - Other deductions'),
  ('Interest Expense',          '📉', '#b91c1c', 'expense', 20, 'Line 20 - Other deductions'),
  ('Dues & Memberships',        '🤝', '#5b21b6', 'expense', 20, 'Line 20 - Other deductions'),
  ('Vehicle Lease & Registration', '🚙', '#6b21a8', 'expense', 20, 'Line 20 - Auto expenses'),
  ('Yard & Storage Rent',       '🏬', '#4d7c0f', 'expense', 20, 'Line 14 - Rent'),
  ('Property Taxes',            '🏠', '#854d0e', 'expense', 20, 'Line 15 - Taxes and licenses'),
  ('Bad Debt',                  '🧨', '#7f1d1d', 'expense', 20, 'Line 13 - Bad debts'),
  -- Income
  ('Change Orders',             '📝', '#16a34a', 'income',  13, 'Income'),
  ('Retainage Released',        '🔓', '#0d9488', 'income',  13, 'Income'),
  ('Utility Rebates & Incentives', '⚡', '#ca8a04', 'income', 13, 'Income')
) AS v(name, icon, color, type, sort_order, tax)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories e WHERE e.company_id IS NULL AND e.name = v.name
);
