-- Temporary helper to find every NUMERIC(5,2) column. The Lenard save
-- path is hitting 22003 (numeric_field_overflow) and we need to know
-- which column needs widening. Function returns just the schema info
-- — no data — and is SECURITY DEFINER so the anon role can call it.
CREATE OR REPLACE FUNCTION public.find_numeric_5_2_cols()
RETURNS TABLE(table_name text, column_name text, numeric_precision integer, numeric_scale integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.table_name::text, c.column_name::text, c.numeric_precision, c.numeric_scale
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.data_type = 'numeric'
    AND c.numeric_precision = 5
    AND c.numeric_scale = 2
  ORDER BY c.table_name, c.column_name
$$;

GRANT EXECUTE ON FUNCTION public.find_numeric_5_2_cols() TO authenticated, anon, service_role;
