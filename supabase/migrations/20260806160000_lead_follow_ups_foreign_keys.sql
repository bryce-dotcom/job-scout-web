-- lead_follow_ups had no foreign keys, so PostgREST could not join it to leads
-- or jobs at all: `lead:leads!lead_id(...)` failed with "Could not find a
-- relationship ... in the schema cache" and the query returned NOTHING. The
-- appointments calendar would have shown zero follow-ups while 27 rows sat in
-- the table — a silent empty result, not an error the user would ever see.
--
-- ON DELETE SET NULL, deliberately, not CASCADE: deleting a lead must not
-- erase the record that someone chased it. That is the same mistake that wiped
-- setter commissions when a lead was deleted.

DO $$ BEGIN
  ALTER TABLE lead_follow_ups
    ADD CONSTRAINT lead_follow_ups_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE lead_follow_ups
    ADD CONSTRAINT lead_follow_ups_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The calendar and the pipeline both read "latest touch per deal", newest
-- first, filtered to rows carrying a scheduled date.
CREATE INDEX IF NOT EXISTS lead_follow_ups_next_due_idx
  ON lead_follow_ups (company_id, next_follow_up_at DESC)
  WHERE next_follow_up_at IS NOT NULL;
