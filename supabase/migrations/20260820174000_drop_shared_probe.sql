-- Introspection scaffolding removed, and an assertion in its place: the shared
-- expense-category catalogue must stay readable. Every one of the 20 rows has a
-- null company_id, so losing this policy hides the entire Expense and Income
-- dropdown in Books again — which is how Tracy ended up with only the five
-- hardcoded "Other" options and no way to categorise a subscription.
drop table if exists public.__shared_probe;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'expense_categories'
       and qual ilike '%company_id is null%'
  ) then
    raise exception 'the shared expense-category catalogue is unreadable again — Books cannot categorise anything';
  end if;
end $$;
