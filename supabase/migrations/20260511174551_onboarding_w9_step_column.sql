-- Track W-9 step completion separately from W-4 step.
ALTER TABLE public.employee_onboarding_packets
  ADD COLUMN IF NOT EXISTS step_w9_completed_at timestamptz;

NOTIFY pgrst, 'reload schema';
