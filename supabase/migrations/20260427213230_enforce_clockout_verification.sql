-- Server-side enforcement of clock-out verification gate.
-- Mirrors the client-side gate in FieldScout.jsx: if a time_clock row has a job_id
-- and is being closed out (clock_out transitions from NULL -> NOT NULL), then a
-- passing Victor "completion" verification_report must exist for that job, OR
-- the close-out must be an admin override (adjusted_by + adjustment_reason set),
-- OR the row must have no job_id (general/non-job time entries are exempt),
-- OR the closing employee's role must be admin/owner/super_admin/developer,
-- OR the operation must be performed by service_role (Supabase admin contexts).

CREATE OR REPLACE FUNCTION public.enforce_clockout_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_role TEXT;
  v_emp RECORD;
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

  -- Role-based bypass for admins/owners/developers
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

DROP TRIGGER IF EXISTS trg_enforce_clockout_verification ON public.time_clock;

CREATE TRIGGER trg_enforce_clockout_verification
BEFORE UPDATE OF clock_out ON public.time_clock
FOR EACH ROW
EXECUTE FUNCTION public.enforce_clockout_verification();

COMMENT ON FUNCTION public.enforce_clockout_verification IS
  'Enforces server-side clock-out verification gate. See FieldScout.jsx for client-side equivalent. Bypasses: service_role, admin override (adjusted_by+adjustment_reason), admin/owner/developer roles, and rows with NULL job_id.';
