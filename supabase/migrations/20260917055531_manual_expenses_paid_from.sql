-- Manual expenses can name the account they were paid from. Needed so an
-- expense paid out of a wallet balance (Venmo, Cash App) lowers the wallet
-- estimate on Books → Accounts, and so wallet fees recorded on a payout can
-- be tied to the wallet account. Soft-nullable: nothing existing changes.
ALTER TABLE public.manual_expenses
  ADD COLUMN IF NOT EXISTS bank_account_id INTEGER REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.manual_expenses.bank_account_id IS
  'Account the expense was paid from (bank_accounts row: bank, Stripe, or a manual wallet). Null = unknown / not tracked.';

CREATE INDEX IF NOT EXISTS idx_manual_expenses_bank_account ON public.manual_expenses(bank_account_id);

NOTIFY pgrst, 'reload schema';
