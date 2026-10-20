-- project-documents: one policy set, and no anon read left.
--
-- Two sessions closed this bucket the same day, so two permissive policy sets
-- were live at once and OR'ed together:
--   project_docs_tenant_{select,insert,update,delete}     20261016213000
--     project_doc_company(name) in current_user_company_ids(), or the uploader
--   project_documents_{read,update,delete}_own_company    20261020120000
--     can_touch_storage_object -> storage_object_company = get_user_company_id()
-- Both are company-scoped, so nothing leaked, but every read ran two resolvers.
-- The project_docs_tenant_* set stays (it also owns INSERT); the other three
-- go. audit-photos / employee-photos keep their *_own_company policies, and
-- storage_object_company / can_touch_storage_object stay for them.
--
-- The only coverage given up: 19 orphan files (a deleted job's and two deleted
-- quotes' photos) that storage_object_company placed by the uploader's company.
-- No page can reach them, since the row that linked them is gone. Under the
-- surviving set only their uploader and the service role can.
--
-- project_docs_onboarding_public_read (anon SELECT on handbooks/ and ica/) also
-- goes: employee-onboarding returns a server-signed signed_url for both, and
-- OnboardingPortal uses it. The portal's anon createSignedUrl remains only as a
-- fallback, and it will now find nothing.

drop policy if exists project_documents_read_own_company on storage.objects;
drop policy if exists project_documents_update_own_company on storage.objects;
drop policy if exists project_documents_delete_own_company on storage.objects;
drop policy if exists project_docs_onboarding_public_read on storage.objects;
