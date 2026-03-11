-- Add fields needed for on-site card payments via Stripe
ALTER TABLE payments ADD COLUMN IF NOT EXISTS job_id integer REFERENCES jobs(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Add skill_level to employees (was missing)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS skill_level text;
