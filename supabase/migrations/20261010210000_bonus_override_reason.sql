-- Why a held bonus was released.
--
-- A bonus is held when the recorded hours do not support it: the job was
-- allotted far more time than anyone clocked, or it is not finished, or a
-- crew member has loose time on a day they worked it. An admin can clear the
-- hold, and until now that took one click and recorded nothing but who and
-- when.
--
-- HHH job 8747 was allotted 181.2 hours, has ZERO hours clocked against it,
-- and paid $4,235 on exactly that click. The hold did its job; nobody can say
-- what the release was based on. Sixty-seven bonuses have been released this
-- way in total.
--
-- release_reason already exists and is the SYSTEM's word for why the hold
-- fired or cleared ('allotted_over_actual', 'admin_override'). This is the
-- person's own sentence, which is a different thing and must not overwrite it.

ALTER TABLE public.job_bonuses
  ADD COLUMN IF NOT EXISTS override_reason text;

COMMENT ON COLUMN public.job_bonuses.override_reason IS
  'The admin''s written reason for clearing needs_verification. Required by the UI at override time; release_reason stays the system''s own code for why the hold fired.';
