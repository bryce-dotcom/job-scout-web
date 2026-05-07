-- Step 5a: track Terms of Service / Privacy Policy acceptance per tenant.
--
-- Stamped at signup; updated only when the tenant explicitly agrees to a
-- newer version. tos_version lets us increment when terms change and
-- detect tenants who need to re-accept.
--
-- HHH (the only existing tenant when this lands) is grandfathered:
-- their tos_accepted_at gets set to their company creation date, so we
-- don't pop a re-acceptance modal on the team that's been using this
-- for 6 weeks. New beta tenants going forward must accept on signup.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tos_accepted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tos_version       TEXT,
  ADD COLUMN IF NOT EXISTS tos_accepted_ip   TEXT;

COMMENT ON COLUMN public.companies.tos_accepted_at IS
  'When this tenant accepted the Terms of Service / Privacy Policy.';
COMMENT ON COLUMN public.companies.tos_version IS
  'Version string of the ToS that was accepted (e.g., "v1-2026-05-07").';
COMMENT ON COLUMN public.companies.tos_accepted_ip IS
  'IP address recorded at acceptance time, for audit purposes.';

-- Grandfather any existing tenant — they were on board before we had
-- explicit ToS. Stamp their company creation date as the acceptance.
UPDATE public.companies
   SET tos_accepted_at = COALESCE(tos_accepted_at, created_at),
       tos_version     = COALESCE(tos_version, 'v0-grandfathered')
 WHERE tos_accepted_at IS NULL;

NOTIFY pgrst, 'reload schema';
