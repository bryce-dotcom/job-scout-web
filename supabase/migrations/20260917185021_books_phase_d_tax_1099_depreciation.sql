-- Books, phase D: sales tax on invoices, 1099 fields on vendors, and
-- depreciation inputs on assets. All additive and nullable/defaulted:
-- nothing existing changes until a company turns a feature on.

-- Sales tax. `amount` stays the pre-tax gross the whole money model is built
-- on; tax rides alongside and is added by invoiceCustomerTotal (lib/arHelpers)
-- so AR, payment status, portal, PDF and email agree. tax_rate is a PERCENT
-- (7.25 = 7.25%). invoice_lines.taxable carries the flag from job/quote lines.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_rate   NUMERIC(6,3)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS taxable BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.invoices.tax_rate IS 'Sales tax rate applied, in percent (7.25 = 7.25%). 0 = no tax.';
COMMENT ON COLUMN public.invoices.tax_amount IS 'Sales tax charged on top of amount (pre-tax gross). Added to the customer total by lib/arHelpers.invoiceCustomerTotal.';

-- 1099-NEC for vendors paid as contractors. Only the last four of the TIN is
-- stored; the W-9 itself lives wherever the office keeps it.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_1099      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tin_type     TEXT CHECK (tin_type IN ('ssn', 'ein')),
  ADD COLUMN IF NOT EXISTS tin_last4    TEXT,
  ADD COLUMN IF NOT EXISTS w9_signed_at DATE;
COMMENT ON COLUMN public.vendors.is_1099 IS 'Paid as a contractor: include in the year-end 1099-NEC list when total paid >= $600.';

-- Depreciation inputs. Straight-line by default; book value is computed
-- (lib/depreciation.js), never stored, so a corrected input re-derives history.
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS purchase_date       DATE,
  ADD COLUMN IF NOT EXISTS in_service_date     DATE,
  ADD COLUMN IF NOT EXISTS useful_life_years   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS salvage_value       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_method TEXT NOT NULL DEFAULT 'straight_line';
COMMENT ON COLUMN public.assets.useful_life_years IS 'Straight-line life in years. Null = not depreciated; current_value stays a typed number.';

NOTIFY pgrst, 'reload schema';
