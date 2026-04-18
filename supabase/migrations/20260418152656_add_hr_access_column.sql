-- HR access flag on employees
-- Only employees with has_hr_access = true can see compensation data
-- (hourly rate, salary, commission rates, tax classification, PTO)
-- and the Payroll page.
--
-- Super Admins get has_hr_access = true by default, but it's a separate flag
-- so companies can carve out HR-specific permissions even among Admins.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS has_hr_access BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: Super Admins, Owners, Developers, and is_developer=true get HR access.
-- Regular Admins (like Tracy) stay at false until explicitly granted.
UPDATE employees
SET has_hr_access = true
WHERE has_hr_access = false
  AND (
    user_role IN ('Super Admin', 'Owner', 'Developer')
    OR is_developer = true
  );

COMMENT ON COLUMN employees.has_hr_access IS
  'When true, the employee can view and edit HR-sensitive fields (pay, commission, tax, PTO) and access the Payroll page. Only Super Admins should be able to toggle this.';
