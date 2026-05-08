-- Grandfather every tenant that existed before this migration onto
-- Field Boss free-for-life. They'll never see a billing prompt.
-- New tenants signing up after this point hit the standard 30-day
-- trial flow set up in beta-signup.
--
-- Marker columns:
--   subscription_tier = 'field_boss'
--   billing_status    = 'grandfathered'  (special status — bypasses
--                        the trial banner + payment requirement)
--   trial_ends_at     = NULL              (not on a trial; permanent)
--   billing_notes     = explanation
--
-- Active beta tenants today: HHH (id=3) and Demo Company (id=4) per
-- earlier audit. The WHERE clause is open-ended (created_at < now)
-- to also grandfather any beta tester who signed up before this
-- migration runs.

UPDATE public.companies
   SET subscription_tier = 'field_boss',
       billing_status    = 'grandfathered',
       trial_ends_at     = NULL,
       billing_notes     = COALESCE(billing_notes, '')
                            || E'\n[Auto] Grandfathered onto Field Boss free-for-life on '
                            || to_char(now(), 'YYYY-MM-DD')
                            || ' (beta-period customer).'
 WHERE active = TRUE
   AND created_at < now()
   AND (billing_status IS NULL OR billing_status IN ('unbilled', 'free'));

-- Anything that lands new (signups after this) gets:
--   subscription_tier = 'field_crew'  (default for the trial)
--   billing_status    = 'trialing'
--   trial_ends_at     = now() + 30 days
-- That's set inside the beta-signup edge function, NOT here, so the
-- grandfather rule above doesn't accidentally catch new signups that
-- happen to insert their company row a millisecond before this
-- migration commits.

NOTIFY pgrst, 'reload schema';
