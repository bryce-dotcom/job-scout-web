-- =====================================================================
-- Phase 3 of Sal → Benny: submit and learn (SAL_SCOUT_PLAN.md §5.8–5.9).
--
--   reminders   which due-date reminders a submission has already raised
--               (24 h, 4 h), so the hourly cron never nags twice.
--   email_id    the Resend id the webhook matches delivery events by.
-- Everything else Phase 3 writes (approval, sent_to, delivery, confirmation,
-- outcome) was made in 20260927150000.
-- =====================================================================

alter table public.bid_submissions add column if not exists reminders jsonb not null default '[]'::jsonb;
create index if not exists bid_submissions_email_id_idx on public.bid_submissions (email_id) where email_id is not null;

comment on column public.bid_submissions.approval_text is
  'The exact sentence the approver ticked (lib/bidPacket.approvalSentence). bid-submit refuses any other wording.';
