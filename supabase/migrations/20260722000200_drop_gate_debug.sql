-- Remove the temporary diagnostic from 20260722000100. Its job (confirming
-- the write-gate landed on every tenant table and revealing which tables
-- still have RLS disabled) is done.
drop function if exists public._gate_debug();
