-- =====================================================================
-- Verification flags a shift. It must never trap someone on the clock.
--
-- That decision was made on 2026-08-03 (fcdaca8, "Verification flags a
-- shift — it must never trap someone on the clock") and applied to
-- FieldScout, whose comment still explains why:
--
--   "17 punches were sitting open when we found this, some from six weeks
--    earlier, and Lucas had to be clocked out by hand because 'it won't let
--    me get to the verification process so I can't do anything about
--    clocking out'."
--
-- Only the client half was changed. This trigger — written 2026-04-27,
-- before that decision — still raises, so the server kept doing exactly what
-- the client had stopped doing. The rule was written in two places and only
-- one of them was corrected.
--
-- On 2 Sep 2026 it trapped two more people:
--
--   Mike Thompson    shift 1495, job 12456 — open 34h
--   Dusty Sensabaugh shift 1492, job 23578 — open 36h
--
-- Dusty is the case that settles it. He ran Victor four times that evening
-- (22:00, 22:04, 22:08, 22:11) and got his score up to 72, comfortably past
-- the 60 this trigger demands. He was still refused, because his reports are
-- verification_type 'daily' and this trigger only accepts 'completion'. He
-- did the check, passed it, and could not end his shift.
--
-- Blocking guards no money. bonusCalc.js computes needs_verification from a
-- passing completion check on its own (lib/bonusCalc.js:404) and withholds
-- the bonus there — "verification is a flag, not a hide switch or a wipe
-- (Bryce 2026-06-23)". All the block ever produced was wrong time records:
-- an open punch is dropped from pay entirely, which is worse for everyone
-- than a closed punch marked for review.
--
-- So the terminal action changes from RAISE to a flag. Every exemption below
-- is kept exactly as it was — they now decide whether the shift gets FLAGGED
-- rather than whether the worker is allowed to go home.
-- =====================================================================

create or replace function public.enforce_clockout_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  v_role TEXT;
  v_emp RECORD;
  v_caller RECORD;
  v_has_pass BOOLEAN;
  v_email TEXT;
BEGIN
  -- Only fire when transitioning from open -> closed
  IF NEW.clock_out IS NULL OR OLD.clock_out IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Non-job entries are exempt (matches client behavior)
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Service-role bypass (Supabase admin / scripts using service_role key)
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Explicit force / tech-skip trail: someone typed a reason. Already audited
  -- in notes and adjustment_reason by the client; nothing to add.
  IF NEW.adjusted_by IS NOT NULL AND NEW.adjustment_reason IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Caller is an admin/owner/developer (e.g. clocking out a stuck tech).
  BEGIN
    v_email := current_setting('request.jwt.claims', true)::jsonb ->> 'email';
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;
  IF v_email IS NOT NULL AND v_email <> '' THEN
    SELECT id, role, user_role, is_admin, is_developer
      INTO v_caller
      FROM public.employees
     WHERE LOWER(email) = LOWER(v_email)
       AND COALESCE(active, true) = true
     LIMIT 1;
    IF FOUND AND (
         COALESCE(v_caller.is_admin, false)
      OR COALESCE(v_caller.is_developer, false)
      OR v_caller.role = 'Owner'
      OR v_caller.user_role IN ('Developer', 'Super Admin', 'Admin')
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Entry owner is an admin/owner/developer.
  SELECT id, role, user_role, is_admin, is_developer
    INTO v_emp
    FROM public.employees
   WHERE id = NEW.employee_id;

  IF FOUND AND (
       COALESCE(v_emp.is_admin, false)
    OR COALESCE(v_emp.is_developer, false)
    OR v_emp.role = 'Owner'
    OR v_emp.user_role IN ('Developer', 'Super Admin', 'Admin')
  ) THEN
    RETURN NEW;
  END IF;

  -- A passing completion verification for this job.
  SELECT EXISTS (
    SELECT 1
      FROM public.verification_reports vr
     WHERE vr.company_id = NEW.company_id
       AND vr.job_id = NEW.job_id
       AND vr.verification_type = 'completion'
       AND COALESCE(vr.voided, false) = false
       AND COALESCE(vr.score, 0) >= 60
  ) INTO v_has_pass;

  -- Unverified. Let the shift close and mark it, which is what the client
  -- already does. COALESCE so a reason the client set (it distinguishes job
  -- vs daily verification) is not overwritten by this generic one.
  IF NOT v_has_pass THEN
    NEW.flagged_for_review := true;
    NEW.review_reason := COALESCE(
      NULLIF(NEW.review_reason, ''),
      'Clocked out before job verification was completed'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- The trigger itself is unchanged and must stay BEFORE, so the flag this
-- function sets on NEW is what actually lands on the row.
drop trigger if exists trg_enforce_clockout_verification on public.time_clock;
create trigger trg_enforce_clockout_verification
  before update of clock_out on public.time_clock
  for each row execute function public.enforce_clockout_verification();
