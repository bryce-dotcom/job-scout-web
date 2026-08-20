-- =====================================================================
-- Who is allowed to operate what, and until when.
--
-- Two gaps closed together.
--
-- employees has 82 columns and not one of them concerns driving. A fleet
-- business cannot answer "is the person in that truck licensed for it, and is
-- the licence still valid" from this database at all.
--
-- And fleet.assigned_to has never existed, despite FreddyDrivers reading
-- vehicle.assigned_to to build its entire driver scorecard. That page has been
-- matching drivers on a column that was not there, which is why it has never
-- shown a driver.
--
-- ---------------------------------------------------------------------
-- On not storing the licence number
--
-- The obvious move is a licence_number column. It is deliberately absent.
--
-- A driving licence number is durable government identity — it does not rotate
-- like a card number, and it is a key into other records. Storing it in
-- plaintext next to a person's home address, date of birth and pay rate raises
-- the cost of any future breach considerably, and this codebase already treats
-- comparable identifiers that way: SSNs live in ssn_encrypted with an
-- ssn_last4 for display.
--
-- More to the point, nothing this feature does needs it. Matching a driver to
-- a truck needs an employee id. Warning that someone cannot legally drive
-- needs a class and an expiry date. Proving a check was done needs the last
-- four and a date. The full number is needed only for DOT filings, and a
-- business doing those has the physical licence in front of it.
--
-- So: class, state, expiry, endorsements and last four. If the full number is
-- genuinely required later, it should follow the ssn_encrypted pattern rather
-- than being added as plain text.
-- =====================================================================

-- 'driver'   operates road-legal vehicles; a licence class matters
-- 'operator' runs equipment; certifications matter, a licence often does not
-- 'both'     does both, which on a small crew is the common case
-- NULL       neither, which is most of an office
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS operator_role text;
DO $$ BEGIN
  ALTER TABLE public.employees ADD CONSTRAINT employees_operator_role_check
    CHECK (operator_role IS NULL OR operator_role IN ('driver','operator','both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS license_last4 text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS license_state text;

-- Class governs what may legally be driven, so it is the field that decides
-- whether an assignment is valid rather than merely recorded.
--   C       ordinary licence
--   B       heavy straight truck
--   A       combination / tractor-trailer
--   CDL-*   the commercial equivalents
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS license_class text;
DO $$ BEGIN
  ALTER TABLE public.employees ADD CONSTRAINT employees_license_class_check
    CHECK (license_class IS NULL OR license_class IN ('C','B','A','CDL-C','CDL-B','CDL-A'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS license_expires date;
-- H hazmat, N tanker, T doubles/triples, P passenger, X tanker+hazmat.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS license_endorsements text;
-- A commercial driver's medical certificate expires separately from the
-- licence and lapses far more often, because it is a two-year cycle nobody
-- has a renewal notice for.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS medical_card_expires date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS license_verified_at date;

COMMENT ON COLUMN public.employees.license_last4 IS
  'Last four of the licence only. The full number is deliberately not stored — see the migration that added this column.';
COMMENT ON COLUMN public.employees.operator_role IS
  'driver = road vehicles, operator = equipment, both, NULL = neither.';

-- ---------------------------------------------------------------------
-- The link the fleet side has been reading and never had
-- ---------------------------------------------------------------------
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS assigned_to integer;
DO $$ BEGIN
  ALTER TABLE public.fleet ADD CONSTRAINT fleet_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS fleet_assigned_to_idx
  ON public.fleet (company_id, assigned_to) WHERE assigned_to IS NOT NULL;

COMMENT ON COLUMN public.fleet.assigned_to IS
  'Employee normally operating this asset. FreddyDrivers has read this since before it existed.';

-- ---------------------------------------------------------------------
-- Assignments worth someone's attention
--
-- A view rather than a query in the client, because the same question gets
-- asked from the fleet card, the employee card and eventually a report, and
-- three implementations of "is this licence expired" will disagree.
--
-- Deliberately reports days_until as a negative number when already lapsed,
-- so a caller sorting ascending gets the worst case first without special
-- casing anything.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.fleet_driver_compliance
  WITH (security_invoker = true) AS
  SELECT
    f.company_id,
    f.id                AS fleet_id,
    f.name              AS asset_name,
    f.asset_class,
    e.id                AS employee_id,
    e.name              AS employee_name,
    e.operator_role,
    e.license_class,
    e.license_expires,
    e.medical_card_expires,
    (e.license_expires - current_date)      AS license_days_until,
    (e.medical_card_expires - current_date) AS medical_days_until,
    -- An assignment is a problem when the person is not marked as a driver at
    -- all, or their licence has lapsed. Missing dates are 'unknown' rather
    -- than 'fine': an unrecorded expiry is the most common way a lapsed
    -- licence stays invisible.
    CASE
      WHEN e.id IS NULL THEN 'unassigned'
      WHEN e.operator_role IS NULL OR e.operator_role = 'operator' THEN 'not_a_driver'
      WHEN e.license_expires IS NULL THEN 'unknown'
      WHEN e.license_expires < current_date THEN 'expired'
      WHEN e.license_expires < current_date + 30 THEN 'expiring'
      WHEN e.medical_card_expires IS NOT NULL AND e.medical_card_expires < current_date THEN 'medical_expired'
      ELSE 'ok'
    END AS status
  FROM public.fleet f
  LEFT JOIN public.employees e ON e.id = f.assigned_to;

GRANT SELECT ON public.fleet_driver_compliance TO authenticated;

NOTIFY pgrst, 'reload schema';
