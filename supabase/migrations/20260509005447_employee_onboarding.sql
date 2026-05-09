-- ====================================================================
-- Employee Onboarding (Sprint A)
--
-- Self-service onboarding for new hires. Alayda clicks "Send onboarding
-- link" on the employee record → SMS + email goes to the new hire with
-- a one-time magic link → they walk through W-4, state withholding,
-- direct deposit, I-9 Section 1, signed handbook acknowledgment, and
-- a short training segment from their phone → everything they submit
-- pre-fills the employee record + lands on the employee file as a
-- signed PDF.
--
-- Two new tables:
--   employee_onboarding_packets: one row per packet, with magic-link
--     token + JSON state + per-step completion timestamps.
--   signed_documents: one row per signed form (W-4, I-9 Section 1,
--     direct deposit auth, handbook ack, etc.) with the PDF storage
--     path + signature blob + IP + user-agent for ESIGN compliance.
-- ====================================================================

-- 1. employee_onboarding_packets ---------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_onboarding_packets (
  id              bigserial PRIMARY KEY,
  company_id      integer  NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id     integer  NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Magic link
  token           uuid     NOT NULL DEFAULT gen_random_uuid(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  is_revoked      boolean  NOT NULL DEFAULT false,

  -- Lifecycle
  status          text     NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('draft','sent','in_progress','completed','revoked')),
  sent_at         timestamptz,
  sent_via        text[]   DEFAULT ARRAY[]::text[],     -- 'email' | 'sms'
  opened_at       timestamptz,
  completed_at    timestamptz,

  -- Per-step timestamps so the HR-side checklist can flip ✓ as each
  -- step lands (without us having to re-derive from the JSON every time).
  step_personal_completed_at         timestamptz,
  step_w4_completed_at               timestamptz,
  step_state_w4_completed_at         timestamptz,
  step_direct_deposit_completed_at   timestamptz,
  step_i9_section1_completed_at      timestamptz,
  step_handbook_completed_at         timestamptz,
  step_emergency_contact_completed_at timestamptz,
  step_workers_comp_completed_at     timestamptz,
  step_background_check_completed_at timestamptz,
  step_training_completed_at         timestamptz,
  step_signed_completed_at           timestamptz,

  -- Working draft of what the employee has typed in. Each step writes
  -- its slice (e.g. {w4: {filing_status: 'single', ...}}). On
  -- "Finish & Sign", the edge function takes this snapshot, generates
  -- PDFs, applies it to the employee row, and marks completed_at.
  draft_data      jsonb    NOT NULL DEFAULT '{}'::jsonb,

  -- I-9 Section 2 deadline tracking. When the employee finishes their
  -- Section 1, we set this to hire_date + 3 business days. Alayda
  -- gets a Payroll Inbox task to physically inspect their ID before
  -- this date.
  i9_section2_due_date date,
  i9_section2_completed_at timestamptz,
  i9_section2_completed_by integer REFERENCES public.employees(id),

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer REFERENCES public.employees(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_token
  ON public.employee_onboarding_packets (token);

CREATE INDEX IF NOT EXISTS idx_onboarding_company_status
  ON public.employee_onboarding_packets (company_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_employee
  ON public.employee_onboarding_packets (employee_id);

-- 2. signed_documents -------------------------------------------------
-- One row per signed form. We store the rendered PDF in the
-- project-documents bucket + the signature image (base64 PNG) + the
-- ESIGN audit fields (typed name, IP, user-agent, timestamp). Re-signing
-- creates a new row; never overwrite (audit trail).
CREATE TABLE IF NOT EXISTS public.signed_documents (
  id                bigserial PRIMARY KEY,
  company_id        integer  NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id       integer  NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  onboarding_packet_id bigint REFERENCES public.employee_onboarding_packets(id) ON DELETE SET NULL,

  document_kind     text     NOT NULL CHECK (document_kind IN (
    'w4','state_w4','i9_section1','i9_section2','direct_deposit_auth',
    'handbook_ack','emergency_contact','workers_comp','background_check_auth',
    'custom_policy','training_acknowledgment','offer_letter'
  )),
  document_label    text,                                -- e.g. 'Form W-4 (2025)'
  pdf_storage_path  text,                                -- project-documents/onboarding/<emp>/<doc>-<ts>.pdf

  -- Snapshot of the values used to render the PDF (so we can re-render
  -- a faithful copy if needed without depending on the live employee row).
  values_snapshot   jsonb    NOT NULL DEFAULT '{}'::jsonb,

  -- ESIGN compliance
  signature_typed_name  text,
  signature_image_base64 text,                           -- the drawn signature, PNG
  signed_at         timestamptz,
  signer_ip         text,
  signer_user_agent text,
  consent_text      text,                                -- the exact text they checked

  -- Lifecycle
  status            text     NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','signed','superseded','voided')),
  superseded_by     bigint REFERENCES public.signed_documents(id),

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signed_docs_employee
  ON public.signed_documents (employee_id, document_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signed_docs_packet
  ON public.signed_documents (onboarding_packet_id);

-- 3. RLS --------------------------------------------------------------
REVOKE ALL ON public.employee_onboarding_packets FROM anon;
REVOKE ALL ON public.signed_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_onboarding_packets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signed_documents TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.employee_onboarding_packets_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.signed_documents_id_seq TO authenticated;

ALTER TABLE public.employee_onboarding_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_onboarding_packets FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.signed_documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signed_documents             FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.employee_onboarding_packets
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.signed_documents
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Onboarding training videos — let Alayda configure her own URLs
--    via the existing settings table. Just an empty default; UI lives
--    in Settings → Onboarding Training tab.
INSERT INTO public.settings (key, value, company_id)
  SELECT 'onboarding_training_videos',
         '[]'::jsonb,
         id
    FROM public.companies
   WHERE NOT EXISTS (
     SELECT 1 FROM public.settings s
      WHERE s.key = 'onboarding_training_videos' AND s.company_id = companies.id
   );

-- 5. updated_at trigger
DROP TRIGGER IF EXISTS trg_onboarding_touch ON public.employee_onboarding_packets;
CREATE TRIGGER trg_onboarding_touch BEFORE UPDATE ON public.employee_onboarding_packets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
