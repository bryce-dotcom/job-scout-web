-- glass_areas meets the window catalogue.
--
-- The table was written before window_types existed, so it records a
-- pane_count and nothing about WHAT was counted. That is the field the whole
-- cleaning bid turns on: "fourteen windows" is twenty-eight panes of
-- double-hung and fourteen of casement, and a takeoff that stores only the
-- answer cannot be re-checked, cannot be corrected when somebody realises the
-- grid was a snap-in grille, and cannot tell a crew what they are walking into.
--
-- So the row records the type and the count, and the pane figure becomes a
-- derived thing kept in step beside it — the same way jobs.job_total_source
-- says where a total came from rather than leaving a number with no parent.

ALTER TABLE public.glass_areas
  -- Which window_types row. A text code rather than an id so a takeoff still
  -- reads if the reference table is ever reseeded, and so an export is legible.
  ADD COLUMN IF NOT EXISTS type_code text REFERENCES public.window_types(type_code) ON UPDATE CASCADE,
  -- How many of them were counted. pane_count stays, computed from this.
  ADD COLUMN IF NOT EXISTS units integer,
  -- Bill the lites rather than the sashes. NULL means "whatever the catalogue
  -- says for this type", which is the answer in all but the one case that
  -- matters: true muntins against a snap-in grille, identical in a photograph
  -- and six times apart in the bill.
  ADD COLUMN IF NOT EXISTS count_lites boolean,
  -- Measured, when somebody measured. These pick the post-construction size
  -- band, which is three separate products at $6, $4 and $20.
  ADD COLUMN IF NOT EXISTS width_in numeric,
  ADD COLUMN IF NOT EXISTS height_in numeric,
  -- Inches above the FLOOR, inside. Not the storey: a ground-floor stairwell
  -- window can be nineteen feet up inside and a second-floor bedroom window is
  -- at chest height from the room.
  ADD COLUMN IF NOT EXISTS reach_in numeric,
  -- The band as it was decided when the bid went out, so reopening an old
  -- assessment does not silently re-band it against a catalogue that moved.
  ADD COLUMN IF NOT EXISTS size_band text,
  -- Extra work on this run that is not implied by the window type: a window
  -- well, a mirror, glass protectant. [{ "work": "window_well", "qty": 6 }]
  ADD COLUMN IF NOT EXISTS addons jsonb;

CREATE INDEX IF NOT EXISTS idx_glass_areas_type ON public.glass_areas(type_code);

COMMENT ON COLUMN public.glass_areas.units IS
  'How many windows of type_code were counted. pane_count is derived from this through the catalogue and is kept in step, not typed.';
COMMENT ON COLUMN public.glass_areas.reach_in IS
  'Inches above the interior floor, for high glass inside. Not the storey.';
