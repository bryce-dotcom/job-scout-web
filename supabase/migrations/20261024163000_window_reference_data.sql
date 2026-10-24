-- Walter's window catalogue — what a window IS, before anything prices one.
--
-- The twin of 20260220100000_fixture_reference_data.sql, and global for the
-- same reason: a double-hung sash is two panes of glass in every state, the
-- way a 4-lamp T8 troffer is 112 watts in every state. Only the PRICE is the
-- tenant's, and the price lives in products_services where they typed it.
--
-- Three things live here, and Walter could not count a window without any of
-- them:
--
--   1. window_types — how many panes a unit of this kind actually has. A rep
--      who writes "14 windows" has told us nothing: fourteen casements is
--      fourteen panes, fourteen double-hungs is twenty-eight, and fourteen
--      15-lite French doors is two hundred and ten pieces of glass a cloth
--      has to touch. The pane count is the whole bid.
--
--   2. The typical size, so a size band can be proposed before anyone
--      measures. HHH does not sell post-construction cleaning as one product;
--      they sell it three times by size — $6 under 4ft, $4 over 4ft, $20 over
--      6ft — and nothing picks between those without a dimension.
--
--   3. window_scale_reference — how to turn a photograph into a height. There
--      is no EXIF field for "this sill is on the second storey", so a height
--      is estimated by comparing the glass to something of known size in the
--      same picture: a door is 80in, a brick course is 2.67in, a storey is
--      about 10ft. That is how a person does it on site and it is the only
--      way a photograph can do it either.
--
-- Why a table rather than a constant in the engine: this is the data an AI
-- vision call reads at request time, exactly as analyze-fixture reads
-- fixture_wattage_reference and visual_identification_guide. Numbers in a
-- component cannot be read by an edge function, corrected by anyone, or added
-- to without a deploy.

-- ---------------------------------------------------------------------
-- 1. The window catalogue
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.window_types (
  id                SERIAL PRIMARY KEY,
  type_code         TEXT UNIQUE NOT NULL,
  type_name         TEXT NOT NULL,
  -- operable | fixed | door | specialty | commercial | skylight
  family            TEXT,

  -- -- what it is worth ------------------------------------------------
  -- Billable panes per unit, ONE side. Interior and exterior are separate
  -- products at separate prices, so faces are never a multiplier here.
  panes_per_unit    INTEGER NOT NULL DEFAULT 1,
  -- Divided lites, when the sash carries a grid. Equal to panes_per_unit on a
  -- plain unit; much larger on a colonial grid or a French door.
  lites_per_unit    INTEGER,
  -- TRUE when the trade normally bills the lites rather than the sashes,
  -- because a cloth has to go into every corner of every one of them. Data,
  -- not a guess buried in a component — and the takeoff shows which basis it
  -- used so a rep can disagree in one tap.
  bill_lites        BOOLEAN DEFAULT FALSE,

  -- -- how big it usually is -------------------------------------------
  typical_width_in  NUMERIC,
  typical_height_in NUMERIC,
  -- under_4 | over_4 | over_6, by the LARGER dimension — the literal reading
  -- of the price book own phrase "wide/high". A measurement on the row
  -- overrides it; this is only what to assume before anyone measures.
  size_band         TEXT,

  -- -- what comes with it ----------------------------------------------
  screens_per_unit  INTEGER DEFAULT 0,
  has_track         BOOLEAN DEFAULT FALSE,
  openable          BOOLEAN DEFAULT TRUE,

  -- -- how to know it in a photograph -----------------------------------
  identification_tips TEXT,
  common_mistakes     TEXT,
  typical_locations   TEXT[],
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Reference data: every authenticated user may read it, nobody may write it
-- through the API. Deliberately tighter than the Lenard tables, which carry
-- FOR ALL USING (true) and are therefore writable by anon — the same shape
-- that let anon delete every project PDF before 2026-10-20.
ALTER TABLE public.window_types ENABLE ROW LEVEL SECURITY;
DO $do$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY read_window_types ON public.window_types
               FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$do$;

INSERT INTO public.window_types
  (type_code, type_name, family, panes_per_unit, lites_per_unit, bill_lites,
   typical_width_in, typical_height_in, size_band, screens_per_unit, has_track,
   openable, identification_tips, common_mistakes, typical_locations) VALUES

-- -- operable, the bread and butter -----------------------------------
 ('double_hung', 'Double-hung', 'operable', 2, 2, FALSE, 32, 60, 'over_4', 1, TRUE, TRUE,
  'Two sashes stacked, both slide up and down. Look for a horizontal meeting rail across the middle and a lift handle on the bottom sash.',
  'Counted as one pane. It is two — the upper sash and the lower sash are separate pieces of glass and both get cleaned.',
  ARRAY['Bedroom', 'Living room', 'Traditional home']),

 ('single_hung', 'Single-hung', 'operable', 2, 2, FALSE, 32, 54, 'over_4', 1, TRUE, TRUE,
  'Looks identical to a double-hung from outside. Only the bottom sash moves; the top is fixed. Still two panes of glass.',
  'Told apart from a double-hung from a photograph. You usually cannot, and it does not matter — both are two panes.',
  ARRAY['Bedroom', 'Tract home', 'Rental']),

 ('slider_2', 'Slider, 2-lite', 'operable', 2, 2, FALSE, 60, 36, 'over_4', 1, TRUE, TRUE,
  'Wider than tall, one vertical meeting rail, sashes slide sideways in a bottom track.',
  'The track is forgotten. A slider always has a bottom track and that is a separate product.',
  ARRAY['Bedroom', 'Basement', 'Mid-century home']),

 ('slider_3', 'Slider, 3-lite', 'operable', 3, 3, FALSE, 96, 36, 'over_6', 2, TRUE, TRUE,
  'Two vertical meeting rails, fixed centre pane with an operable panel each side.',
  'Counted as two panes. There are three.',
  ARRAY['Living room', 'Mid-century home']),

 ('casement', 'Casement', 'operable', 1, 1, FALSE, 24, 48, 'under_4', 1, FALSE, TRUE,
  'Single pane on a side hinge, swings out like a door. A crank handle at the sill is the giveaway.',
  'Counted as two because it is tall. A casement is one pane.',
  ARRAY['Kitchen', 'Modern home', 'Bathroom']),

 ('casement_pair', 'Casement pair', 'operable', 2, 2, FALSE, 48, 48, 'under_4', 2, FALSE, TRUE,
  'Two casements in one frame, hinged at opposite sides, meeting in the middle with no post between them.',
  'Read as one wide picture window. Look for the two crank handles.',
  ARRAY['Kitchen', 'Living room']),

 ('awning', 'Awning', 'operable', 1, 1, FALSE, 32, 24, 'under_4', 1, FALSE, TRUE,
  'Wider than tall, hinged at the TOP, opens outward from the bottom. Often above a fixed pane or a door.',
  'Confused with a hopper. An awning hinges at the top; a hopper hinges at the bottom.',
  ARRAY['Bathroom', 'Above a door', 'Basement']),

 ('hopper', 'Hopper', 'operable', 1, 1, FALSE, 32, 18, 'under_4', 1, FALSE, TRUE,
  'Short and wide, hinged at the BOTTOM, tips inward. Almost always low on a wall.',
  'Confused with an awning, which hinges at the top.',
  ARRAY['Basement', 'Utility room']),

 ('basement_hopper', 'Basement hopper, below grade', 'operable', 1, 1, FALSE, 32, 16, 'under_4', 1, FALSE, TRUE,
  'A hopper at or below ground level, usually inside a window well. The well itself is a separate product.',
  'The window well is not counted. It is a product of its own and often the dirtier half of the job.',
  ARRAY['Basement', 'Window well']),

 ('jalousie', 'Jalousie / louvre', 'operable', 1, 8, TRUE, 32, 48, 'under_4', 1, FALSE, TRUE,
  'A stack of narrow horizontal glass slats on a crank. Each slat is cleaned on both edges.',
  'Counted as one pane. Eight slats is eight pieces of glass and takes far longer than one sheet the same size.',
  ARRAY['Porch', 'Older home', 'Florida room']),

-- -- fixed glass ------------------------------------------------------
 ('picture', 'Picture / fixed', 'fixed', 1, 1, FALSE, 60, 48, 'over_4', 0, FALSE, FALSE,
  'One large pane, no meeting rail, no handle, no screen.',
  'Assumed to have a screen. Fixed glass has none, so no screen line.',
  ARRAY['Living room', 'Stairwell']),

 ('picture_large', 'Picture, large format', 'fixed', 1, 1, FALSE, 96, 72, 'over_6', 0, FALSE, FALSE,
  'A single pane over 6ft in either direction. Usually needs two people or a pole even at ground level.',
  'Priced as a standard pane. HHH prices glass over 6ft as its own product.',
  ARRAY['Great room', 'Vaulted wall']),

 ('transom', 'Transom', 'fixed', 1, 1, FALSE, 36, 18, 'under_4', 0, FALSE, FALSE,
  'A short pane directly above a door or another window.',
  'Missed entirely — it sits above eye level in most photographs.',
  ARRAY['Above a door', 'Entry', 'Storefront']),

 ('sidelight', 'Sidelight', 'fixed', 1, 1, FALSE, 14, 72, 'over_4', 0, FALSE, FALSE,
  'A tall narrow pane beside an entry door, often one each side.',
  'Only one counted when there are two, one per side.',
  ARRAY['Entry', 'Front door']),

 ('clerestory', 'Clerestory', 'fixed', 1, 1, FALSE, 48, 18, 'under_4', 0, FALSE, FALSE,
  'A band of short panes high on a wall, above the roofline of the storey below.',
  'Assumed reachable from the ground. It rarely is — this is usually ladder or pole work.',
  ARRAY['Modern home', 'Church', 'Atrium']),

 ('arched', 'Arched / round top', 'fixed', 1, 1, FALSE, 36, 24, 'under_4', 0, FALSE, FALSE,
  'A half-round or segmented pane, usually directly above a rectangular window.',
  'Counted as part of the window below it. It is a separate pane.',
  ARRAY['Entry', 'Stairwell', 'Great room']),

 ('round', 'Round / octagon', 'specialty', 1, 1, FALSE, 24, 24, 'under_4', 0, FALSE, FALSE,
  'A circular or octagonal pane, often decorative and small.',
  'Skipped as trivial. It still takes a setup, especially if it is high.',
  ARRAY['Gable', 'Stairwell', 'Bathroom']),

 ('glass_block', 'Glass block panel', 'specialty', 1, 1, FALSE, 32, 32, 'under_4', 0, FALSE, FALSE,
  'A grid of thick translucent blocks in mortar. Textured, never clear.',
  'Billed per block. It is cleaned as one panel, and the texture makes it slower per square foot, not faster.',
  ARRAY['Basement', 'Bathroom', 'Stairwell']),

 ('storm_window', 'Storm window, exterior', 'fixed', 1, 1, FALSE, 32, 54, 'over_4', 0, TRUE, FALSE,
  'A second sash mounted outside the real window, usually aluminium framed with its own track.',
  'Counted as one pane when it doubles the exterior work — the storm and the window behind it are two surfaces.',
  ARRAY['Older home', 'Cold climate']),

-- -- gridded glass, where the lite count is the job --------------------
 ('divided_lite_6', 'Divided lite sash, 6 over 6', 'operable', 2, 12, TRUE, 32, 60, 'over_4', 1, TRUE, TRUE,
  'A double-hung whose sashes are divided into six small panes each by true muntins — the bars sit proud of the glass and cast a shadow.',
  'Confused with a snap-in grille. A grille lifts out or sits between the panes and cleans as two flat sashes; true muntins mean twelve separate pieces of glass.',
  ARRAY['Colonial home', 'Historic district']),

 ('grille_insert', 'Snap-in or between-glass grille', 'operable', 2, 2, FALSE, 32, 60, 'over_4', 1, TRUE, TRUE,
  'Looks divided but the bars are inside the sealed unit or clip onto the inside face. The outer glass is one flat sheet.',
  'Billed as divided lites. The glass is flat, so it cleans at the plain sash rate — billing twelve lites here overcharges by six times.',
  ARRAY['Tract home', 'Replacement window']),

-- -- doors ------------------------------------------------------------
 ('french_door', 'French door, 15-lite', 'door', 1, 15, TRUE, 36, 80, 'over_6', 0, FALSE, TRUE,
  'A full-height door of small panes in a grid, hinged, usually in pairs.',
  'Counted as one pane. Fifteen lites per leaf, two leaves, is thirty pieces of glass with corners.',
  ARRAY['Patio', 'Dining room', 'Study']),

 ('patio_slider_2', 'Patio slider, 2-panel', 'door', 2, 2, FALSE, 72, 80, 'over_6', 1, TRUE, TRUE,
  'Two full-height panels, one slides past the other in a heavy bottom track.',
  'The track is skipped. A patio door track is the dirtiest track on the house.',
  ARRAY['Patio', 'Deck', 'Living room']),

 ('patio_slider_3', 'Patio slider, 3-panel', 'door', 3, 3, FALSE, 108, 80, 'over_6', 1, TRUE, TRUE,
  'Three full-height panels, a fixed centre or end panel with sliders beside it.',
  'Counted as two panels. There are three.',
  ARRAY['Patio', 'Great room']),

 ('entry_door_lite', 'Entry door, half lite', 'door', 1, 1, FALSE, 22, 64, 'over_4', 0, FALSE, TRUE,
  'One pane set into a solid door, often oval or rectangular with decorative leading.',
  'Leaded or bevelled glass treated as plain. It is slower and must not be scraped.',
  ARRAY['Front door', 'Entry']),

 ('entry_door_full', 'Entry door, full lite', 'door', 1, 1, FALSE, 34, 76, 'over_6', 0, FALSE, TRUE,
  'A door that is almost entirely one pane of glass.',
  'Counted with the sidelights as one unit. They are separate panes.',
  ARRAY['Front door', 'Back door']),

 ('garage_door_lite', 'Garage door lite', 'door', 1, 1, FALSE, 24, 14, 'under_4', 0, FALSE, FALSE,
  'A row of small panes across the top section of a garage door.',
  'Missed because the door is read as solid. Count the lites across the top row.',
  ARRAY['Garage', 'Carriage house']),

-- -- bay, bow and garden ----------------------------------------------
 ('bay_3', 'Bay, 3-section', 'specialty', 3, 3, FALSE, 96, 60, 'over_6', 2, TRUE, TRUE,
  'Three sections projecting from the wall at an angle — a large fixed centre with an operable unit each side.',
  'Counted as one window. It is three, and the angled sides are awkward from outside.',
  ARRAY['Living room', 'Dining room', 'Victorian home']),

 ('bow_5', 'Bow, 5-section', 'specialty', 5, 5, FALSE, 120, 60, 'over_6', 4, TRUE, TRUE,
  'A gentle curve of four to six equal sections projecting from the wall.',
  'Counted as a bay. A bow has more sections and they are equal in width.',
  ARRAY['Living room', 'Victorian home']),

 ('garden', 'Garden window', 'specialty', 5, 5, FALSE, 48, 48, 'under_4', 0, TRUE, TRUE,
  'A small glass box projecting from a wall, usually over a kitchen sink — glass on three sides and the top.',
  'Counted as one pane. There are typically five surfaces including the roof, and the inside is full of plants.',
  ARRAY['Kitchen', 'Over the sink']),

 ('greenhouse_panel', 'Sunroom or greenhouse panel', 'specialty', 1, 1, FALSE, 48, 96, 'over_6', 0, FALSE, FALSE,
  'A large panel in a glazed roof or wall of a sunroom, often sloped.',
  'Priced as a wall pane. Sloped glass holds dirt and water differently and the interior side is usually high.',
  ARRAY['Sunroom', 'Conservatory', 'Atrium']),

-- -- skylights --------------------------------------------------------
 ('skylight', 'Skylight', 'skylight', 1, 1, FALSE, 24, 48, 'under_4', 0, FALSE, FALSE,
  'A pane in the roof plane. The exterior side is roof work and the interior side is overhead work.',
  'Both sides assumed reachable from inside. The outside of a skylight needs roof access and that is a different job.',
  ARRAY['Hallway', 'Bathroom', 'Kitchen']),

 ('skylight_large', 'Skylight, large or vaulted', 'skylight', 1, 1, FALSE, 48, 72, 'over_4', 0, FALSE, FALSE,
  'A large roof pane, often over a stairwell or great room with a very high interior side.',
  'The interior reach is underestimated. A vaulted ceiling skylight can be twenty feet above the floor inside.',
  ARRAY['Great room', 'Stairwell', 'Atrium']),

 ('tubular_skylight', 'Tubular skylight dome', 'skylight', 1, 1, FALSE, 14, 14, 'under_4', 0, FALSE, FALSE,
  'A small acrylic dome on the roof with a diffuser in the ceiling below.',
  'Scraped or squeegeed like glass. The dome is acrylic and scratches.',
  ARRAY['Hallway', 'Closet', 'Bathroom']),

-- -- commercial -------------------------------------------------------
 ('storefront', 'Storefront panel', 'commercial', 1, 1, FALSE, 48, 84, 'over_6', 0, FALSE, FALSE,
  'A full-height pane in an aluminium frame at street level, usually in a run of identical bays.',
  'The run is counted as one window. Count the bays.',
  ARRAY['Retail', 'Restaurant', 'Office lobby']),

 ('curtain_wall', 'Curtain wall unit', 'commercial', 1, 1, FALSE, 60, 120, 'over_6', 0, FALSE, FALSE,
  'One bay of a glazed facade on a multi-storey building. Identical units repeating across and up.',
  'Priced at the ground-level rate. Above the second storey this is waterfed, lift or rope work and a different product.',
  ARRAY['Office tower', 'Hotel', 'Hospital']),

 ('partition', 'Interior partition glass', 'commercial', 1, 1, FALSE, 48, 96, 'over_6', 0, FALSE, FALSE,
  'A glass wall or door between interior spaces. Both faces are interior work.',
  'Counted once. A partition has two interior faces and both are cleaned.',
  ARRAY['Office', 'Conference room', 'Clinic']),

 ('vestibule', 'Vestibule glass', 'commercial', 1, 1, FALSE, 36, 84, 'over_6', 0, FALSE, TRUE,
  'The glass in an entry airlock — two sets of doors and side panels, so four faces in a small space.',
  'Counted as one entry. A vestibule has an outer and an inner set and all of it is fingerprinted.',
  ARRAY['Office lobby', 'Hospital', 'Retail']),

-- -- not glazing, but on the ticket -----------------------------------
 ('mirror', 'Mirror', 'specialty', 1, 1, FALSE, 36, 48, 'under_4', 0, FALSE, FALSE,
  'A silvered pane, interior only, one face.',
  'Cleaned with the same solution as glass. A mirror edge will de-silver if solution sits on it.',
  ARRAY['Bathroom', 'Gym', 'Retail']),

 ('shower_enclosure', 'Shower enclosure panel', 'specialty', 1, 1, FALSE, 28, 72, 'over_4', 0, TRUE, TRUE,
  'A glass shower door or fixed panel, interior, almost always with hard water scale.',
  'Billed as window cleaning. Scale removal and shower restoration are separate products and this is where they are sold.',
  ARRAY['Bathroom', 'Hotel', 'Gym']),

 ('solar_panel', 'Solar panel', 'specialty', 1, 1, FALSE, 39, 65, 'over_4', 0, FALSE, FALSE,
  'A roof-mounted photovoltaic panel. Cleaned as glass but on a roof and never walked on.',
  'Pressure washed or walked on. Both break panels and void the warranty.',
  ARRAY['Roof', 'Ground array', 'Carport'])

ON CONFLICT (type_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Scale references — turning a photograph into a height
-- ---------------------------------------------------------------------
-- Height drives which product is sold. HHH prices second-storey exterior work
-- as "Exterior WaterFed windows above 2 stories" at $7 and ladder work at $4
-- interior and $5 exterior, against $3 and $6 at ground level. Nothing in a
-- photograph says how high the glass is, so it is measured against something
-- in the frame whose size is known. These are those things.
CREATE TABLE IF NOT EXISTS public.window_scale_reference (
  id             SERIAL PRIMARY KEY,
  reference_code TEXT UNIQUE NOT NULL,
  reference_name TEXT NOT NULL,
  dimension_in   NUMERIC NOT NULL,
  -- height | width | course | diameter
  dimension_of   TEXT NOT NULL,
  reliability    TEXT,      -- high | medium | low
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.window_scale_reference ENABLE ROW LEVEL SECURITY;
DO $do$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY read_window_scale_reference ON public.window_scale_reference
               FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$do$;

INSERT INTO public.window_scale_reference
  (reference_code, reference_name, dimension_in, dimension_of, reliability, notes) VALUES
 ('entry_door', 'Entry door leaf', 80, 'height', 'high',
  'Residential doors are 6ft 8in almost without exception. The single most reliable thing in any photograph of a house.'),
 ('interior_door', 'Interior door leaf', 80, 'height', 'high',
  'Same 6ft 8in as an entry door. Useful for interior reach and for ceiling height.'),
 ('brick_course', 'Brick course, brick plus mortar', 2.67, 'course', 'high',
  'A modular brick is 2 1/4in plus a 3/8in bed joint. Count courses from grade to the sill — nine courses is two feet. The most precise reference on a masonry wall.'),
 ('brick_length', 'Brick, face length', 8, 'width', 'high',
  'Nominal 8in including the head joint. Counts across a wall the way courses count up it.'),
 ('cmu_course', 'Concrete block course', 8, 'course', 'high',
  'A nominal 8x8x16 block course is 8in with the joint. Three courses is two feet.'),
 ('siding_lap_d4', 'Vinyl siding, double 4 panel', 8, 'course', 'medium',
  'A double 4 panel shows two 4in laps, so 8in per panel. Confirm by counting laps against a known door before relying on it.'),
 ('siding_lap_d5', 'Vinyl siding, double 5 panel', 10, 'course', 'medium',
  'Two 5in laps per panel. Double 4 and double 5 look alike at a distance, so check against a door or a window height.'),
 ('storey_resi', 'Storey, residential', 120, 'height', 'medium',
  'Floor to floor is about 10ft with an 8ft ceiling and the floor structure. A second-storey sill is usually 12 to 14ft above grade.'),
 ('storey_comm', 'Storey, commercial', 144, 'height', 'medium',
  'Floor to floor is 12 to 14ft in commercial construction. Count storeys off the glazing lines, never off the apparent height.'),
 ('garage_door_h', 'Garage door, single', 84, 'height', 'high',
  'Standard single garage door is 7ft high by 8 or 9ft wide. A double is the same height.'),
 ('step_riser', 'Stair riser', 7, 'height', 'medium',
  'Code riser is 7in or a little under. Counting the steps to a porch gives the sill height of anything beside the door.'),
 ('handrail', 'Guard or handrail height', 36, 'height', 'medium',
  'Residential guards are 36in, commercial are 42in. Useful on decks and balconies where no door is in frame.'),
 ('person', 'Adult standing', 68, 'height', 'low',
  'About 5ft 8in. Use only when nothing built is in frame — people vary and foreshortening is severe.'),
 ('sill_height', 'Window sill above floor', 30, 'height', 'low',
  'A typical sill sits 30in above the floor inside, which helps place an interior reach but varies a great deal.')
ON CONFLICT (reference_code) DO NOTHING;
