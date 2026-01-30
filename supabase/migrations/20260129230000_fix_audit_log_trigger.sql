-- Fix audit log trigger to use correct column names
-- The audit_log table has: old_values, new_values, user_email
-- The trigger was using: old_data, new_data, user_id
-- Also make it fail gracefully so audit errors don't block operations

CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Wrap in exception handler so audit failures don't block main operations
  BEGIN
    INSERT INTO audit_log (
      table_name,
      record_id,
      action,
      old_values,
      new_values,
      user_email,
      company_id
    ) VALUES (
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id)::TEXT,
      TG_OP,
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
      COALESCE(auth.jwt()->>'email', 'system'),
      COALESCE(NEW.company_id, OLD.company_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the main operation
    RAISE WARNING 'Audit log failed: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
