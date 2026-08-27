-- =====================================================================
-- Intra-tenant authorization — stage 3: pricing and people.
--
-- Same method as stage 2: shaped by which screens write each table.
-- Two flows here would have broken under an obvious-looking rule:
--
--   Login.jsx and AuthCallback.jsx write employees.last_login on EVERY
--   sign-in, for every role. Locking employees to admins logs everybody
--   out of their own audit trail.
--
--   FieldScout.jsx inserts customer_portal_tokens — a tech sends a
--   document from site, and the token is what lets the customer open it
--   without an account. Locking that stops work in the field.
--
-- So the pricing tier is guarded at the COLUMN level where the table is
-- also used for ordinary catalogue work, and at the table level only for
-- the pure rate books. The people tier gets ownership rules rather than
-- role locks.
--
-- Service-role callers are exempt throughout (no JWT email).
-- =====================================================================


-- ---------------------------------------------------------------------
-- A. What things cost.
--
-- products_services is edited for perfectly ordinary reasons — fixing a
-- name, a manufacturer, a category. That work must stay open (it is
-- exactly what the catalogue clean-up in Arnie exists to help with).
-- What must not move below Admin is the money.
-- ---------------------------------------------------------------------
create or replace function public.guard_product_prices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
  col text;
begin
  if jwt_email is null then return new; end if;
  if public.current_user_access_level() >= 3 then return new; end if;

  foreach col in array array['unit_price','cost','markup_percent','floor_price','ceiling_price',
                             'pricing_model','pricing_percent','pricing_floor','pricing_ceiling'] loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      changed := array_append(changed, col);
    end if;
  end loop;

  if cardinality(changed) > 0 then
    raise exception 'Only an admin can change % on a product.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_product_prices on public.products_services;
create trigger guard_product_prices
  before update on public.products_services
  for each row execute function public.guard_product_prices();


-- ---------------------------------------------------------------------
-- B. The rate books. These tables are nothing BUT pricing — a labour
--    rate, a dig rate, a utility rate schedule. There is no ordinary
--    non-admin reason to add, change or remove a row, and every screen
--    that writes them is a price-book screen.
-- ---------------------------------------------------------------------
create or replace function public.guard_rate_books()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  if jwt_email is null then return coalesce(new, old); end if;
  if public.current_user_access_level() >= 3 then return coalesce(new, old); end if;
  raise exception 'Only an admin can % a % record.', lower(tg_op), tg_table_name
    using errcode = '42501';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['labor_rates', 'dig_rates', 'utility_rate_schedules', 'lawn_pricing'] loop
    execute format('drop trigger if exists guard_rate_books on public.%I', t);
    execute format($p$
      create trigger guard_rate_books
        before insert or update or delete on public.%I
        for each row execute function public.guard_rate_books()
    $p$, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- C. Employee records: your own, or you are an admin.
--
-- Stage 1 already froze the columns that grant access or set pay. This
-- adds the other half — a non-admin editing a COLLEAGUE'S record at all.
-- No screen does that below Admin: Employees.jsx and DataConsoleUsers
-- are admin, while Login, AuthCallback and Settings only ever write the
-- row of the person signed in.
-- ---------------------------------------------------------------------
create or replace function public.guard_employee_row_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  if jwt_email is null then return new; end if;
  if public.current_user_access_level() >= 3 then return new; end if;
  if lower(coalesce(old.email, '')) = lower(jwt_email) then return new; end if;

  raise exception 'You can only change your own employee record.'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_employee_row_ownership on public.employees;
create trigger guard_employee_row_ownership
  before update on public.employees
  for each row execute function public.guard_employee_row_ownership();


-- ---------------------------------------------------------------------
-- D. Deleting a customer is an admin decision.
--
-- Creating and editing customers stays wide open on purpose: LeadDetail,
-- EstimateDetail and NewLightingAudit all create them, and that is the
-- sales flow working as designed. Removing one takes its jobs, quotes
-- and invoices out of every view that joins on it.
-- ---------------------------------------------------------------------
create or replace function public.guard_customer_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  if jwt_email is null then return old; end if;
  if public.current_user_access_level() >= 3 then return old; end if;
  raise exception 'Only an admin can delete a customer.' using errcode = '42501';
end;
$$;

drop trigger if exists guard_customer_delete on public.customers;
create trigger guard_customer_delete
  before delete on public.customers
  for each row execute function public.guard_customer_delete();


-- ---------------------------------------------------------------------
-- E. Benefits and document templates. Both are written from one
--    admin-gated screen apiece (EmployeeBenefitsPanel, DocumentRules),
--    so the whole write surface can close.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employee_benefits', 'document_templates'] loop
    execute format('drop trigger if exists guard_rate_books on public.%I', t);
    execute format($p$
      create trigger guard_rate_books
        before insert or update or delete on public.%I
        for each row execute function public.guard_rate_books()
    $p$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
