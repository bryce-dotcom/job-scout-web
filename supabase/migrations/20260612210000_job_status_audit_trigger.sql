-- Job status-change audit trail.
--
-- Doug (6/12): "Some of the jobs keep moving on the job board without me
-- moving them." Investigation found no automated mover (no clock-ins on the
-- job, no overnight batch updates) but also NO WAY to attribute a status
-- change after the fact — jobs.updated_at gets overwritten by the next
-- touch. This trigger writes every status transition to audit_log (which
-- the Data Console "Recent Activity" panel already displays), capturing the
-- acting user's email when the change came through the app, or
-- 'service-role/system' for backend writes.

CREATE OR REPLACE FUNCTION log_job_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      SELECT email INTO actor FROM auth.users WHERE id = auth.uid();
    EXCEPTION WHEN OTHERS THEN
      actor := NULL;
    END;
    INSERT INTO audit_log (company_id, user_email, action, table_name, record_id, old_values, new_values)
    VALUES (
      NEW.company_id,
      COALESCE(actor, 'service-role/system'),
      'status_change',
      'jobs',
      NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'job_title', NEW.job_title)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS jobs_status_audit ON jobs;
CREATE TRIGGER jobs_status_audit
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_change();
