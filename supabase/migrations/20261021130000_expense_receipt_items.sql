-- What a receipt photo says, line by line — read once by Arnie and kept.
--
-- London, 2026-10-20: he wanted to export the material receipts to an outside
-- AI to work out the month's truck stock. Bryce: do it with Arnie. An expense
-- row holds only the total; the items are on the photo. Arnie reads each photo
-- once (query_material_receipts), and this keeps what it said so next month
-- only the new receipts are read.
--
-- Service key only (arnie-chat); RLS on with no policies.
create table if not exists public.expense_receipt_items (
  expense_id bigint primary key references public.expenses(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,   -- [{ description, sku, quantity, unit_price, line_total }]
  merchant text,
  unreadable boolean not null default false,
  note text,
  read_at timestamptz not null default now()
);
create index if not exists expense_receipt_items_company on public.expense_receipt_items (company_id);
alter table public.expense_receipt_items enable row level security;
