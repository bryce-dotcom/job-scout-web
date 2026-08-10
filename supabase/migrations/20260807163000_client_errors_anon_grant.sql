-- The previous migration granted INSERT to anon and it did not take: a signed
-- out portal visitor still got "permission denied for table client_errors".
-- Re-applied explicitly and verified, because the whole point of that change
-- was making customer-portal crashes visible, and a policy without the
-- underlying table GRANT is silently inert.

GRANT INSERT ON TABLE public.client_errors TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.client_errors_id_seq TO anon;

-- anon still may not read, change or delete anything.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.client_errors FROM anon;

NOTIFY pgrst, 'reload schema';
