-- SMS consent is its own fact, recorded, never derived.
--
-- Registering HHH for A2P 10DLC, the campaign form asks how recipients
-- consented to be texted. The app had no answer: nothing on any form, estimate
-- or portal page said we may text them. The one field that LOOKS like consent
-- is marketing_opt_in, and it is true for 2,687 of HHH's 3,376 customers
-- because an import defaulted it that way — not because anyone said yes.
-- Treating that as text consent would be manufacturing consent for 2,687
-- people at once, so these columns are new and are deliberately NOT backfilled
-- from it. Every tenant starts at zero and earns the record honestly.
--
-- Three columns, because a carrier reviewer asks three questions: did they
-- agree, when, and how. customers already carries an audit trigger, so each
-- change to these is logged with who made it — that is the evidence trail.
--
-- The rule for what these permit is in src/lib/smsConsent.js. Nothing here
-- gates the texts the app already sends: those are transactional (invoice past
-- due, onboarding link, follow-up on an estimate they asked for), which an
-- existing business relationship covers. Express consent is what marketing
-- needs, and that is the rule the lib enforces.

alter table customers
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_source text;

comment on column customers.sms_consent is
  'Customer agreed to receive text messages. Never derived from marketing_opt_in — see src/lib/smsConsent.js.';
comment on column customers.sms_consent_at is
  'When that agreement was recorded.';
comment on column customers.sms_consent_source is
  'How it was obtained: office (staff recorded what the customer said), portal (the customer ticked it themselves), import.';
