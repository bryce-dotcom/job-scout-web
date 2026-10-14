-- Why a deduction happened.
--
-- Tracy (2026-10-11): "Travis Millward is a longtime client… he just lost his
-- son and for the funeral wanted his windows cleaned. The whole invoice was
-- $300. Christopher wanted this to be a write off but wanted to make sure that
-- Cameron got paid for his hours. I put the invoice in and then just did the
-- discount for the amount of the invoice so it would show zero. I almost think
-- that in times like this, it would be nice to have some sort of way to show
-- the reason for a loss to the company or rather a gift to the client."
--
-- An invoice could record HOW MUCH came off and never WHY. So a $300 gift and
-- a $300 price concession are the same row, and the loss the company chose to
-- absorb is invisible in every margin figure.
--
-- On HHH today: 57 invoices carry a deduction, 29 of them are utility
-- incentives where the customer never owed the money, and 13 are zeroed
-- outright with no utility behind them — Tracy's pattern, thirteen times, none
-- of them explainable six months later.
--
-- NO ARITHMETIC CHANGES HERE. discount_applied remains the total deduction and
-- lib/invoiceMoney still owns it; the invoice money model has been broken more
-- than once by passes that re-derived it, and nothing about recording a reason
-- needs a different number. These two columns say what the existing number
-- MEANT.
--
-- Nullable, and null for every existing row, because "nobody has said" is the
-- truth about all of them and must not be dressed up as "discount".

alter table invoices add column if not exists deduction_kind text;
alter table invoices add column if not exists deduction_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'invoices'::regclass and conname = 'invoices_deduction_kind_chk'
  ) then
    -- 'incentive' is deliberately NOT accepted. Whether an invoice carries a
    -- utility incentive is derived from the job, the linked utility record and
    -- the invoice's own utility debt (invoiceSections#invoiceCarriesIncentive).
    -- Letting someone type it would let a goodwill gift be filed as money the
    -- utility owes.
    alter table invoices add constraint invoices_deduction_kind_chk
      check (deduction_kind is null or deduction_kind in ('discount','goodwill','write_off','warranty'));
  end if;
end $$;

comment on column invoices.deduction_kind is
  'What the deduction on this invoice WAS: discount | goodwill | write_off | warranty. Null means unclassified. Never ''incentive'' — that is derived. See src/lib/writeOff.';
comment on column invoices.deduction_reason is
  'Why, in the person''s own words. Required for the kinds the company absorbs. Internal — the customer-facing line is still deductionLineLabel''s.';

-- The report this exists for is "what did we give away", which reads the
-- absorbed kinds across a date range.
create index if not exists invoices_deduction_kind_idx
  on invoices (company_id, deduction_kind)
  where deduction_kind is not null;
