-- The shared expense-category catalogue became invisible to everyone.
--
-- Tracy, 20 Aug: "Something has changed in the transaction categorization menu.
-- I used to have a much longer list of options in the first dropdown, including
-- Expense and Income categories. Now, the only options I see are under 'Other':
-- Transfer, Owner Distribution, Owner Contribution, Loan Payment, and Tax
-- Payment... when categorizing a payment to Claude, I used to be able to select
-- an Expense category such as 'Subscription'. Now I can't move forward."
--
-- Those five ARE the only options left, because they are hardcoded in the JSX.
-- The Expense and Income groups come from expense_categories, and every one of
-- the 20 rows is the shared catalogue: company_id IS NULL. No tenant owns any.
--
-- tenant_isolation reads
--     USING (company_id IN (SELECT current_user_company_ids()))
--
-- and NULL IN (...) is NULL, never true. So the rollout that closed the tenant
-- isolation hole also hid every shared row from every tenant. Books could not
-- categorise an expense at all — in any company, not just HHH.
--
-- SELECT only. The catalogue stays readable by all tenants and writable by
-- none: tenant_isolation's WITH CHECK still refuses to write a row with a NULL
-- company_id, so nobody can edit the shared list from inside a tenant, and a
-- company's own categories remain private to it.
do $$
begin
  create policy shared_catalogue_readable on public.expense_categories
    for select to authenticated
    using (company_id is null);
exception when duplicate_object then null;
end $$;

-- Introspection scaffolding from working this out.
drop table if exists public.__policy_probe;
