-- =====================================================================
-- Marketing security pass (2026-10-15): three things the review found.
--
-- 1. employee_notifications INSERT let any employee write any colleague a
--    notification of any type (a tech could push "Your pay is ready" rows
--    to the whole company). The browser legitimately inserts from below
--    Manager in exactly two places: Field Scout sharing a photo with the
--    office (marketing_capture) and a driver filing a repair request (the
--    fleet_service_request_notify trigger runs as the driver, type
--    fleet_request_*). Everything else is Manager+ or an edge function.
--
-- 2. marketing_posts UPDATE was open to every employee: status could be
--    set to approved/posted, approved_by forged, post_urls and the
--    publisher id rewritten. Below Manager a post is a draft and stays
--    one; the approval columns are the office's.
--
-- 3. The nightly marketing-suggest cron carried the anon JWT, and the
--    function trusted the role claim it decoded out of it, unverified.
--    The job now sends a secret pg_cron reads from Vault
--    (marketing_internal_key); the function compares it with
--    MARKETING_INTERNAL_KEY. Service-role callers are exempt throughout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Who may create a notification for whom.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS employee_notifications_insert ON public.employee_notifications;
CREATE POLICY employee_notifications_insert ON public.employee_notifications FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.current_user_company_ids())
    AND (
      public.current_user_access_level() >= 2
      OR type = 'marketing_capture'
      OR type LIKE 'fleet\_request\_%'
    )
  );

-- ---------------------------------------------------------------------
-- 2. A post below Manager is a draft.
-- ---------------------------------------------------------------------
create or replace function public.guard_marketing_posts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
  col text;
  guarded text[] := array['approved_by','approved_at','posted_at','ayrshare_id','post_urls','metrics','metrics_at'];
begin
  if jwt_email is null then return new; end if;                   -- edge functions, cron
  if public.current_user_access_level() >= 2 then return new; end if;

  if new.status not in ('draft', 'archived') then
    raise exception 'Only a Manager or above can approve, schedule or post. Save it as a draft and the office takes it from there.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.approved_by is not null or new.approved_at is not null or new.posted_at is not null
       or new.ayrshare_id is not null or coalesce(new.post_urls, '[]'::jsonb) <> '[]'::jsonb or new.metrics is not null then
      raise exception 'Only a Manager or above can set approval or posting details on a post.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status not in ('draft', 'archived') then
    raise exception 'Only a Manager or above can change a post that has been approved or posted.'
      using errcode = '42501';
  end if;
  foreach col in array guarded loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      changed := array_append(changed, col);
    end if;
  end loop;
  if cardinality(changed) > 0 then
    raise exception 'Only a Manager or above can change % on a post.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_marketing_posts on public.marketing_posts;
create trigger guard_marketing_posts
  before insert or update on public.marketing_posts
  for each row execute function public.guard_marketing_posts();

-- ---------------------------------------------------------------------
-- 3. The nightly suggester proves it is ours.
--    Prereq (done by hand, never in git): vault.create_secret('<random>',
--    'marketing_internal_key') and the edge secret MARKETING_INTERNAL_KEY
--    set to the same value. The job reads Vault at run time, so no secret
--    sits in cron.job or in this file.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  PERFORM cron.unschedule('marketing-suggest-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'marketing-suggest-daily',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/marketing-suggest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_internal_key' LIMIT 1)
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);
