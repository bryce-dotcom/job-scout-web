-- EMPLOYEE IDENTITY ROLLBACK: put the fields back on employees.
--
-- Use only to roll the APP back to a build that reads identity off employees,
-- after employee_identity_finish.sql has emptied those columns. It copies
-- every value from employee_identity back onto employees and swaps the
-- redirect for the mirror again, so employee_identity stays in step.
-- employee_identity itself is left in place. The audit_log scrub and the
-- draft redaction cannot be undone, and should not be.

begin;

drop trigger if exists employees_redirect_identity on public.employees;

update public.employees e set
  ssn_last4 = i.ssn_last4, ssn_encrypted = i.ssn_encrypted, date_of_birth = i.date_of_birth,
  home_address = i.home_address, home_city = i.home_city, home_state = i.home_state, home_zip = i.home_zip,
  dd_account_encrypted = i.dd_account_encrypted, dd_routing_encrypted = i.dd_routing_encrypted,
  dd_account_last4 = i.dd_account_last4, dd_account_type = i.dd_account_type,
  w9_ein_encrypted = i.w9_ein_encrypted, w9_ein_last4 = i.w9_ein_last4
from public.employee_identity i
where i.employee_id = e.id;

drop trigger if exists employees_mirror_identity on public.employees;
create trigger employees_mirror_identity
  after insert or update on public.employees
  for each row execute function public.employees_mirror_identity();

commit;
