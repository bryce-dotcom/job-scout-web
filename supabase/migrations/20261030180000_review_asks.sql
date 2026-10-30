-- =====================================================================
-- Review requests (2026-10-30): after a job is finished, one message to the
-- customer with the company's review link. Sent by the campaign tick, as
-- the customer's own channel allows (a text if they said yes to texts,
-- else email), once per job and no more than once per customer in 90 days.
--
-- review_asks is the memory of who was asked: the job, the customer, the
-- campaign member row that carried the unsubscribe token, the channel, and
-- when. sent_at stays null when the send failed; such a row is retried
-- after a day, and never a second time for a job that went out.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.review_asks (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id        bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id   integer REFERENCES public.customers(id) ON DELETE SET NULL,
  member_id     bigint REFERENCES public.campaign_members(id) ON DELETE SET NULL,
  channel       text,                                   -- email | text
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_id)
);
CREATE INDEX IF NOT EXISTS review_asks_customer_idx ON public.review_asks (company_id, customer_id, sent_at DESC);

ALTER TABLE public.review_asks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY review_asks_select ON public.review_asks FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
