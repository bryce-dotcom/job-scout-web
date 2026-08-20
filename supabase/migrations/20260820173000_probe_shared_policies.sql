-- TEMPORARY, dropped next. Do the shared-catalogue tables already have a
-- policy that lets a tenant READ rows with a null company_id?
truncate public.__shared_probe;
insert into public.__shared_probe (tablename, null_rows, total_rows)
select p.tablename, count(*) filter (where p.qual ilike '%company_id is null%'), count(*)
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('utility_rate_schedules','utility_providers','utility_programs',
                      'utility_forms','prescriptive_measures','incentive_measures','expense_categories')
group by p.tablename;
