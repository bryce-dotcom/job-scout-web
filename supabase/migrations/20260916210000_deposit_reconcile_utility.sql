-- A bank deposit can be the utility's money.
--
-- Books matched a deposit to a CUSTOMER invoice with a customer balance and
-- nothing else. A utility's incentive cheque — SRP's $57,372.68 for two
-- Arizona jobs, Evergreen's $6,524 ACH for Ryan Kimball's — had nowhere to
-- go: the utility's receivable lives on utility_invoices, so the deposit sat
-- unmatched forever (Tracy, 2026-09-16, three tickets in one afternoon).
--
-- The settlement is still recorded where it always was (utility_invoices,
-- mirrored onto the invoice). This only lets Books say WHICH deposit it was.
alter table public.utility_invoices
  add column if not exists source_transaction_id integer references public.plaid_transactions(id) on delete set null;
create index if not exists utility_invoices_source_transaction_idx on public.utility_invoices (source_transaction_id);

-- A settlement on a utility record that is not linked to an invoice has no
-- invoice for the bank row to point at; it points at the record instead.
alter table public.plaid_transactions
  add column if not exists matched_utility_invoice_id integer references public.utility_invoices(id) on delete set null;
