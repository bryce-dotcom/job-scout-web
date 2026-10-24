-- Two corrections the first seeded takeoff found, both about screens and
-- tracks going missing from a bid.
--
-- 1. glass_areas.screens and .tracks defaulted to 0.
--
--    The catalogue is supposed to fill them in: a double-hung has a screen and
--    a track, a picture window has neither, and nobody should have to remember
--    which. The rule reads "if the row says nothing, ask the catalogue" — and a
--    DEFAULT of 0 means the row always says something. So every counted run
--    came back with no screens and no tracks, on a fourteen-run takeoff of a
--    house with twenty-eight of each.
--
--    NULL is the honest default. It means nobody has said, which is true the
--    moment the row is created. A typed 0 still means "do not charge screens
--    here" and still wins, which is the whole point of the distinction.
--
-- 2. Six window types were recorded as having a track.
--
--    A casement, a casement pair, an awning, a hopper, a basement hopper and a
--    jalousie all swing or crank on a hinge. There is a sill, but no sliding
--    channel to clean and nothing to charge Window Track Cleaning for. Only
--    glass that SLIDES has a track: hung windows, sliders, patio doors, storm
--    sashes and shower doors.
--
--    Left alone this was a $5 line on every hinged window in every bid.

ALTER TABLE public.glass_areas ALTER COLUMN screens DROP DEFAULT;
ALTER TABLE public.glass_areas ALTER COLUMN tracks  DROP DEFAULT;

-- The rows that already carry the default rather than a decision. Only the
-- demo takeoff exists today, so this is cheap and will never be again.
UPDATE public.glass_areas SET screens = NULL WHERE screens = 0;
UPDATE public.glass_areas SET tracks  = NULL WHERE tracks  = 0;

UPDATE public.window_types SET has_track = FALSE
WHERE type_code IN (
  'casement', 'casement_pair', 'awning', 'hopper', 'basement_hopper', 'jalousie'
);
