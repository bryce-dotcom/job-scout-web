-- Storage: no anonymous access, and each company sees only its own files.
--
-- Found 2026-10-20 (Bryce: "how do we keep other bots seeing all of our
-- numbers and all of our data"). With nothing but the public anon key — it
-- ships in every browser bundle — anyone could LIST and DOWNLOAD every
-- company's estimate PDFs, invoices, receipts and job photos in
-- project-documents, and could UPLOAD and DELETE there too
-- (project_docs_select/insert/delete were granted to `public`). Any signed-in
-- user of ANY company could read, overwrite and delete all three buckets.
--
-- Nothing legitimate reads these with the anon key any more: the customer
-- portal goes through get-portal-document (service role), the onboarding
-- portal now gets its handbook/ICA links signed by employee-onboarding, and
-- Lenard's public pages write through edge functions. Edge functions use the
-- service role, which bypasses RLS.
--
-- audit-photos and employee-photos stay PUBLIC buckets for now: their public
-- URLs are stored in columns (quote_lines.photos, job_lines.photos,
-- audit_areas.photos, employees.headshot_url) and rendered in ~15 places, and
-- a /object/public/ URL does not consult RLS. What closes here is LISTING and
-- cross-company writes; the stored links keep working.
--
-- The payroll RESTRICTIVE policies (20261015140000) still apply on top.

/**
 * Which company owns a stored file, from its path (or, failing that, from
 * who uploaded it or the record that points at it). Null = nobody can say.
 */
create or replace function public.storage_object_company(p_bucket text, p_name text, p_owner uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  top text := split_part(p_name, '/', 1);
  seg text := split_part(p_name, '/', 2);
  n   bigint;
  c   integer;
begin
  if seg ~ '^\d+$' then n := seg::bigint; end if;

  if p_bucket = 'employee-photos' then
    if top ~ '^\d+$' then return top::integer; end if;                     -- <companyId>/<ts>.png
  elsif p_bucket = 'audit-photos' then
    if top = 'audits' and n is not null then
      select company_id into c from lighting_audits where id = n; if c is not null then return c; end if;
    elsif top = 'areas' and n is not null then
      return n::integer;                                                    -- areas/<companyId>/...
    elsif top = 'estimates' and n is not null then
      select company_id into c from quotes where id = n; if c is not null then return c; end if;
    end if;
  elsif p_bucket = 'project-documents' then
    if top ~ '^\d+$' then return top::integer; end if;                     -- <companyId>/docs/...
    if top in ('invoices','deposits','templates','handbooks','ica','bids','don','hcp',
               'onboarding','paystubs','tax-filings') and n is not null then
      return n::integer;                                                    -- <prefix>/<companyId>/...
    end if;
    if top in ('jobs','daily-verification') and n is not null then
      select company_id into c from jobs where id = n; if c is not null then return c; end if;
    end if;
    if top in ('estimates','signed-proposals','formal-drafts','signatures') and n is not null then
      -- estimates/<companyId>/<quote>.pdf is a PDF; estimates/<estimateId>/... is everything else.
      if top = 'estimates' and split_part(p_name, '/', 3) ~* '\.pdf$' and split_part(p_name, '/', 4) = ''
         and exists (select 1 from companies where id = n) then
        return n::integer;
      end if;
      select company_id into c from quotes where id = n; if c is not null then return c; end if;
    end if;
    if top = 'signatures' and seg ~ '^lead-\d+' then
      select company_id into c from leads where id = substring(seg from '^lead-(\d+)')::bigint; if c is not null then return c; end if;
    end if;
    if top = 'leads' and n is not null then
      select company_id into c from leads where id = n; if c is not null then return c; end if;
    end if;
  end if;

  -- Anything else: the company of whoever uploaded it…
  if p_owner is not null then
    select e.company_id into c
      from auth.users u join employees e on lower(e.email) = lower(u.email)
     where u.id = p_owner
     order by e.active desc limit 1;
    if c is not null then return c; end if;
  end if;
  -- …or of a record that points at this exact file.
  select company_id into c from file_attachments where file_path = p_name and storage_bucket = p_bucket limit 1;
  if c is not null then return c; end if;
  if p_bucket = 'project-documents' then
    select company_id into c from expenses where receipt_storage_path = p_name limit 1;
  end if;
  return c;
end;
$$;

/** May the signed-in person touch this file? Their own company's, or a developer. */
create or replace function public.can_touch_storage_object(p_bucket text, p_name text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (select 1 from employees e
             where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
               and e.active = true and e.is_developer = true)
    or public.storage_object_company(p_bucket, p_name, p_owner) = public.get_user_company_id(),
    false)
$$;

revoke all on function public.storage_object_company(text, text, uuid) from public, anon;
grant execute on function public.storage_object_company(text, text, uuid) to authenticated, service_role;
revoke all on function public.can_touch_storage_object(text, text, uuid) from public, anon;
grant execute on function public.can_touch_storage_object(text, text, uuid) to authenticated, service_role;

-- ── project-documents ────────────────────────────────────────────────
drop policy if exists project_docs_select on storage.objects;
drop policy if exists project_docs_insert on storage.objects;
drop policy if exists project_docs_delete on storage.objects;
drop policy if exists authenticated_read_project_documents on storage.objects;
drop policy if exists authenticated_update_project_documents on storage.objects;
drop policy if exists authenticated_delete_project_documents on storage.objects;
-- authenticated_upload_project_documents stays: signed-in uploads are unchanged.

create policy project_documents_read_own_company on storage.objects
  for select to authenticated
  using (bucket_id = 'project-documents' and public.can_touch_storage_object(bucket_id, name, owner));
create policy project_documents_update_own_company on storage.objects
  for update to authenticated
  using (bucket_id = 'project-documents' and public.can_touch_storage_object(bucket_id, name, owner));
create policy project_documents_delete_own_company on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-documents' and public.can_touch_storage_object(bucket_id, name, owner));

-- ── audit-photos ─────────────────────────────────────────────────────
drop policy if exists public_read_audit_photos on storage.objects;
drop policy if exists authenticated_update_audit_photos on storage.objects;
drop policy if exists authenticated_delete_audit_photos on storage.objects;

create policy audit_photos_read_own_company on storage.objects
  for select to authenticated
  using (bucket_id = 'audit-photos' and public.can_touch_storage_object(bucket_id, name, owner));
create policy audit_photos_update_own_company on storage.objects
  for update to authenticated
  using (bucket_id = 'audit-photos' and public.can_touch_storage_object(bucket_id, name, owner));
create policy audit_photos_delete_own_company on storage.objects
  for delete to authenticated
  using (bucket_id = 'audit-photos' and public.can_touch_storage_object(bucket_id, name, owner));

-- ── employee-photos ──────────────────────────────────────────────────
drop policy if exists public_read_employee_photos on storage.objects;
drop policy if exists authenticated_update_employee_photos on storage.objects;
drop policy if exists authenticated_delete_employee_photos on storage.objects;

create policy employee_photos_read_own_company on storage.objects
  for select to authenticated
  using (bucket_id = 'employee-photos' and public.can_touch_storage_object(bucket_id, name, owner));
create policy employee_photos_update_own_company on storage.objects
  for update to authenticated
  using (bucket_id = 'employee-photos' and public.can_touch_storage_object(bucket_id, name, owner));
create policy employee_photos_delete_own_company on storage.objects
  for delete to authenticated
  using (bucket_id = 'employee-photos' and public.can_touch_storage_object(bucket_id, name, owner));
