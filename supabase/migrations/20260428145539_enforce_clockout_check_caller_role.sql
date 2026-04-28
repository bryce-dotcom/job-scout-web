-- Fix clock-out verification trigger to also bypass when the CALLER is an
-- admin/owner/developer. The original trigger only checked the time-entry's
-- employee role, which meant when an admin force-closed a tech's stuck
-- entry through normal supabase-js (without setting adjusted_by/reason),
-- the trigger evaluated the TECH's role (User/Installer) and blocked.
--
-- Now we additionally look up the calling auth.uid() and check whether
-- THAT employee is an admin/owner/developer. Service role bypass and the
-- explicit adjusted_by + reason override remain unchanged.

CREATE OR REPLACE FUNCTION public.enforce_clockout_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_role TEXT;
  v_emp RECORD;
  v_caller RECORD;
  v_has_pass BOOLEAN;
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

  -- Admin override trail: explicit force-clock-out with a reason
  IF NEW.adjusted_by IS NOT NULL AND NEW.adjustment_reason IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Caller-role bypass: if the calling user (via JWT email claim) is an
  -- admin/owner/developer employee, allow the clock-out regardless of
  -- whose entry is being closed. This is the fix for admins clocking out
  -- stuck techs. Auth-to-employee linkage is by email match (no
  -- auth_user_id column on employees).
  DECLARE
    v_email TEXT;
  BEGIN
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
  END;

  -- Entry-owner role bypass (admins clocking out their OWN entries)
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

  -- Require a passing completion verification_report for this job
  SELECT EXISTS (
    SELECT 1
      FROM public.verification_reports vr
     WHERE vr.company_id = NEW.company_id
       AND vr.job_id = NEW.job_id
       AND vr.verification_type = 'completion'
       AND COALESCE(vr.voided, false) = false
       AND COALESCE(vr.score, 0) >= 60
  ) INTO v_has_pass;

  IF NOT v_has_pass THEN
    RAISE EXCEPTION 'Clock-out blocked: job % requires a passing Victor completion verification (score >= 60) before this time entry can be closed. Use Victor Verify, or have an admin force-close with a reason.', NEW.job_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$func$;

COMMENT ON FUNCTION public.enforce_clockout_verification IS
  'Enforces server-side clock-out verification gate. Bypasses: service_role, admin override (adjusted_by+adjustment_reason), CALLER is admin/owner/developer (via auth.uid lookup), entry-owner is admin/owner/developer, and rows with NULL job_id.';
