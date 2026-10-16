-- project-documents: tenant-scoped, and closed to the anon key.
--
-- The bucket is private, but until now its policies only checked
-- bucket_id = 'project-documents':
--   project_docs_select / _insert / _delete             to public (anon too)
--   authenticated_read / _upload / _update / _delete_project_documents
-- so the anon key could list, read, upload and delete every file in it, and a
-- signed-in user of any company could read every other company's files.
-- 20261015140000_payroll_storage_private already narrowed tax-filings/,
-- onboarding/ and paystubs/ with RESTRICTIVE policies; those stay as they are
-- and still apply on top of what this file grants.
--
-- Who touches the bucket (inventory, 2026-10-16):
--   * Signed-in tenant users, through the app pages (JobDetail, EstimateDetail,
--     InvoiceDetail, LeadDetail, Settings, Expenses, Victor, Benny/Sal, Don,
--     Arnie, DocumentRules, MyPay, PayrollInbox, OnboardingPanel ...).
--   * Edge functions (approve-document, get-portal-document, lenard-attach-file,
--     lenard-capture-signature, inbound-email, sal-*, send-*, render-*,
--     bid-submit, benny-bid-intake, arnie-config). All use the service role,
--     which bypasses RLS, so nothing here changes them. The customer portal,
--     estimate approval, invoice pay page, Zach quote page and the public Lenard
--     pages reach storage ONLY through these functions.
--   * One anonymous direct reader: OnboardingPortal (/onboarding/:token) signs
--     the company handbook and ICA PDFs with the anon key
--     (handbooks/<company>/..., ica/<company>/...). Those two prefixes keep an
--     anon SELECT; nothing anonymous uploads or deletes anywhere.
--
-- Every path is resolved to the ONE company that owns it, by
-- public.project_doc_company(name):
--   <co>/docs/...                                   the path's company
--   bids|templates|handbooks|ica|don|deposits/<co>/ the path's company
--   tax-filings|onboarding|paystubs/<co>/...        the path's company
--   invoices/<co>/<invoice>_<ts>.pdf                the path's company  (PDFs)
--   estimates/<co>/<quote>_<ts>.pdf                 the path's company  (PDFs)
--   invoices/<invoice id>/<13-digit ts>_<name>      invoices.company_id
--   estimates/<quote id>/...  (deeper, or ts-first) quotes.company_id
--   formal-drafts|signed-proposals|signatures|quotes/<quote id>/...
--                                                   quotes.company_id
--   signatures/lead-<lead id>.png                   leads.company_id
--   jobs/<job id>/...                               jobs.company_id
--   leads/<lead id>/...                             leads.company_id
--   daily-verification/<report uuid>/...            verification_reports
--   expenses/receipts/<file>                        the expenses row whose
--                                                   receipt_storage_path is it
-- invoices/<n> and estimates/<n> are ambiguous by number alone (company 3 and
-- quote 3 both exist), so the file name decides: the PDF writers name files
-- "<id>_<13-digit ts>.pdf" directly under the company folder, while every
-- per-row writer puts a deeper folder or a timestamp FIRST. Checked against all
-- 715 live objects under the two prefixes: no exceptions.
--
-- Signed-in access (authenticated):
--   read / delete   the path's company is one of current_user_company_ids(),
--                   or the caller uploaded the file (owner_id), which covers a
--                   receipt read back before its expenses row exists
--   upload / update the path's company is one of the caller's companies;
--                   expenses/receipts/ (no company in the path) is open to any
--                   active employee, and readable only as above
-- Paths that resolve to no company (unknown prefix, a deleted job's files)
-- are reachable only by the service role and the uploader.
-- Already-issued signed URLs keep working: they are checked by token, not RLS.

create or replace function public.project_doc_company(p_name text)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(coalesce(p_name, ''), '/');
  depth integer := coalesce(array_length(parts, 1), 0);
  s1 text := coalesce(parts[1], '');
  s2 text := coalesce(parts[2], '');
  s3 text := coalesce(parts[3], '');
  co integer;
begin
  if depth < 2 then
    return null;
  end if;

  -- <company>/docs/...
  if s1 ~ '^[0-9]{1,9}$' then
    return case when s2 = 'docs' then s1::integer end;
  end if;

  -- Company-first prefixes.
  if s1 in ('bids', 'templates', 'handbooks', 'ica', 'don', 'deposits',
            'tax-filings', 'onboarding', 'paystubs') then
    return case when s2 ~ '^[0-9]{1,9}$' then s2::integer end;
  end if;

  if s1 in ('invoices', 'estimates') then
    if s2 !~ '^[0-9]{1,9}$' then
      return null;
    end if;
    -- invoices/<co>/<id>_<ts>.pdf, estimates/<co>/<id>_<ts>.pdf
    if depth = 3 and s3 !~ '^[0-9]{13}_' then
      return s2::integer;
    end if;
    if s1 = 'invoices' then
      select i.company_id into co from public.invoices i where i.id = s2::integer;
    else
      select q.company_id into co from public.quotes q where q.id = s2::integer;
    end if;
    return co;
  end if;

  if s1 in ('formal-drafts', 'signed-proposals', 'quotes', 'signatures') then
    if s1 = 'signatures' and s2 ~ '^lead-[0-9]{1,9}\.png$' then
      select l.company_id into co from public.leads l
       where l.id = substring(s2 from '^lead-([0-9]+)')::integer;
      return co;
    end if;
    if s2 ~ '^[0-9]{1,9}$' then
      select q.company_id into co from public.quotes q where q.id = s2::integer;
    end if;
    return co;
  end if;

  if s1 = 'jobs' then
    if s2 ~ '^[0-9]{1,9}$' then
      select j.company_id into co from public.jobs j where j.id = s2::integer;
    end if;
    return co;
  end if;

  if s1 = 'leads' then
    if s2 ~ '^[0-9]{1,9}$' then
      select l.company_id into co from public.leads l where l.id = s2::integer;
    end if;
    return co;
  end if;

  if s1 = 'daily-verification' then
    if s2 ~ '^[0-9a-fA-F-]{36}$' then
      select r.company_id into co from public.verification_reports r where r.id = s2::uuid;
    end if;
    return co;
  end if;

  if s1 = 'expenses' then
    select e.company_id into co from public.expenses e
     where e.receipt_storage_path = p_name
     limit 1;
    return co;
  end if;

  return null;
end;
$$;

revoke all on function public.project_doc_company(text) from public;
grant execute on function public.project_doc_company(text) to anon, authenticated, service_role;

-- The open policies go.
drop policy if exists project_docs_select on storage.objects;
drop policy if exists project_docs_insert on storage.objects;
drop policy if exists project_docs_delete on storage.objects;
drop policy if exists authenticated_read_project_documents on storage.objects;
drop policy if exists authenticated_upload_project_documents on storage.objects;
drop policy if exists authenticated_update_project_documents on storage.objects;
drop policy if exists authenticated_delete_project_documents on storage.objects;

-- The onboarding portal (anon key) reads the company handbook and ICA.
drop policy if exists project_docs_onboarding_public_read on storage.objects;
create policy project_docs_onboarding_public_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'project-documents'
    and split_part(name, '/', 1) in ('handbooks', 'ica')
  );

drop policy if exists project_docs_tenant_select on storage.objects;
create policy project_docs_tenant_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-documents'
    and (
      public.project_doc_company(name) in (select public.current_user_company_ids())
      or owner_id = (select auth.uid())::text
    )
  );

drop policy if exists project_docs_tenant_insert on storage.objects;
create policy project_docs_tenant_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-documents'
    and (
      public.project_doc_company(name) in (select public.current_user_company_ids())
      or (name like 'expenses/receipts/%'
          and exists (select 1 from public.current_user_company_ids()))
    )
  );

-- upsert: true uploads need UPDATE (and SELECT) on the row being replaced.
drop policy if exists project_docs_tenant_update on storage.objects;
create policy project_docs_tenant_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-documents'
    and (
      public.project_doc_company(name) in (select public.current_user_company_ids())
      or owner_id = (select auth.uid())::text
    )
  )
  with check (
    bucket_id = 'project-documents'
    and (
      public.project_doc_company(name) in (select public.current_user_company_ids())
      or (name like 'expenses/receipts/%'
          and exists (select 1 from public.current_user_company_ids()))
    )
  );

drop policy if exists project_docs_tenant_delete on storage.objects;
create policy project_docs_tenant_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-documents'
    and (
      public.project_doc_company(name) in (select public.current_user_company_ids())
      or owner_id = (select auth.uid())::text
    )
  );
