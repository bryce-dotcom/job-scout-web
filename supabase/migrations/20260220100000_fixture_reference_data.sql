-- ============================================================
-- Fixture Reference Data for Lenard Lighting AI
--
-- 4 GLOBAL reference tables (no company_id) since fixture
-- wattage physics are universal across all companies.
--
-- Tables:
--   1. fixture_categories  (~20 rows)
--   2. lamp_types           (~13 rows)
--   3. fixture_wattage_reference (~80 rows) — THE CRITICAL TABLE
--   4. visual_identification_guide (~25 rows)
--
-- All INSERTs use ON CONFLICT DO NOTHING for idempotency.
-- ============================================================

-- ============================================================
-- 1. FIXTURE CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS fixture_categories (
  id SERIAL PRIMARY KEY,
  category_code TEXT UNIQUE NOT NULL,
  category_name TEXT NOT NULL,
  description TEXT,
  typical_mounting TEXT,
  typical_ceiling_height TEXT,
  typical_applications TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fixture_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to fixture_categories" ON fixture_categories;
CREATE POLICY "Allow all access to fixture_categories" ON fixture_categories
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO fixture_categories (category_code, category_name, description, typical_mounting, typical_ceiling_height, typical_applications) VALUES
  ('TROFFER', 'Troffer', 'Recessed rectangular fixture that fits into drop ceiling grid', 'Recessed', '8-12 ft', ARRAY['Office', 'Retail', 'School', 'Healthcare']),
  ('HIGHBAY', 'High Bay', 'Fixture for high-ceiling industrial/commercial spaces', 'Suspended/Chain', '20-50 ft', ARRAY['Warehouse', 'Manufacturing', 'Gym', 'Arena']),
  ('LOWBAY', 'Low Bay', 'Fixture for lower ceiling industrial/commercial spaces', 'Suspended/Surface', '12-20 ft', ARRAY['Warehouse', 'Shop', 'Storage']),
  ('STRIP', 'Strip/Channel', 'Open strip fixture, often bare lamps', 'Surface/Suspended', '8-20 ft', ARRAY['Warehouse', 'Garage', 'Storage', 'Shop']),
  ('WRAP', 'Wraparound', 'Surface-mount fixture with wraparound acrylic lens', 'Surface', '8-12 ft', ARRAY['Hallway', 'Stairwell', 'Closet', 'Utility']),
  ('WALLPACK', 'Wall Pack', 'Exterior wall-mounted fixture for building perimeter', 'Wall', 'N/A', ARRAY['Parking lot', 'Building exterior', 'Loading dock']),
  ('CANOPY', 'Canopy', 'Surface-mounted for covered areas', 'Surface', '8-15 ft', ARRAY['Gas station', 'Drive-through', 'Covered walkway']),
  ('FLOOD', 'Floodlight', 'Directional exterior fixture', 'Pole/Wall/Ground', 'N/A', ARRAY['Parking lot', 'Sports field', 'Security', 'Signage']),
  ('AREA', 'Area/Parking Light', 'Pole-mounted exterior light for large areas', 'Pole', '15-40 ft', ARRAY['Parking lot', 'Roadway', 'Campus']),
  ('RECESSED_CAN', 'Recessed Can/Downlight', 'Circular recessed ceiling fixture', 'Recessed', '8-12 ft', ARRAY['Office', 'Retail', 'Lobby', 'Restaurant']),
  ('TRACK', 'Track Lighting', 'Adjustable fixtures mounted on a track', 'Track/Ceiling', '8-12 ft', ARRAY['Retail', 'Gallery', 'Showroom']),
  ('PENDANT', 'Pendant', 'Suspended decorative or task fixture', 'Suspended', '8-15 ft', ARRAY['Restaurant', 'Lobby', 'Conference room']),
  ('VANITY', 'Vanity/Bath', 'Wall-mounted bathroom fixture', 'Wall', '7-8 ft', ARRAY['Restroom', 'Hotel']),
  ('EXIT_EMERGENCY', 'Exit/Emergency', 'Exit sign or emergency lighting unit', 'Wall/Ceiling', 'N/A', ARRAY['All commercial buildings']),
  ('BOLLARD', 'Bollard', 'Short post-mounted exterior path light', 'Ground/Post', '3-4 ft', ARRAY['Walkway', 'Garden', 'Campus path']),
  ('POST_TOP', 'Post Top', 'Decorative pole-mounted exterior fixture', 'Pole', '10-15 ft', ARRAY['Campus', 'Park', 'Streetscape']),
  ('UNDER_CABINET', 'Under Cabinet', 'Small linear fixture mounted under cabinets', 'Surface', 'N/A', ARRAY['Kitchen', 'Lab', 'Display']),
  ('VAPOR_TIGHT', 'Vapor Tight', 'Sealed fixture for wet/dusty environments', 'Surface/Suspended', '8-20 ft', ARRAY['Car wash', 'Food processing', 'Parking garage', 'Cold storage']),
  ('PANEL', 'Flat Panel', 'Thin LED panel that replaces troffers', 'Recessed/Surface', '8-12 ft', ARRAY['Office', 'Retail', 'Healthcare']),
  ('CORN_COB', 'Corn Cob/Retrofit Lamp', 'LED retrofit lamp that fits existing HID sockets', 'Retrofit', 'Varies', ARRAY['Any HID fixture'])
ON CONFLICT (category_code) DO NOTHING;


-- ============================================================
-- 2. LAMP TYPES
-- ============================================================

CREATE TABLE IF NOT EXISTS lamp_types (
  id SERIAL PRIMARY KEY,
  lamp_code TEXT UNIQUE NOT NULL,
  lamp_name TEXT NOT NULL,
  technology TEXT NOT NULL,
  description TEXT,
  visual_characteristics TEXT,
  typical_life_hours INTEGER,
  warmup_time TEXT,
  dimmable BOOLEAN DEFAULT false,
  contains_mercury BOOLEAN DEFAULT false,
  ballast_required BOOLEAN DEFAULT false,
  ballast_type TEXT,
  being_phased_out BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lamp_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to lamp_types" ON lamp_types;
CREATE POLICY "Allow all access to lamp_types" ON lamp_types
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO lamp_types (lamp_code, lamp_name, technology, description, visual_characteristics, typical_life_hours, warmup_time, dimmable, contains_mercury, ballast_required, ballast_type, being_phased_out) VALUES
  ('T12', 'T12 Fluorescent', 'Fluorescent', '1.5" diameter tube, oldest fluorescent technology', 'Thick tube (1.5" / 38mm diameter), often yellowed with age, may flicker', 20000, 'Instant to 3 seconds', false, true, true, 'Magnetic', true),
  ('T8', 'T8 Fluorescent', 'Fluorescent', '1" diameter tube, most common commercial fluorescent', 'Medium tube (1" / 25mm diameter), bright white, runs on electronic ballast', 30000, 'Instant', false, true, true, 'Electronic', false),
  ('T5', 'T5 Fluorescent', 'Fluorescent', '5/8" diameter tube, compact high-efficiency fluorescent', 'Thin tube (5/8" / 16mm diameter), very bright, mini bi-pin ends', 30000, 'Instant', true, true, true, 'Electronic', false),
  ('T5HO', 'T5 High Output', 'Fluorescent', '5/8" diameter high-output tube for high/low bays', 'Thin tube like T5 but higher output, often in industrial reflectors', 25000, 'Instant', true, true, true, 'Electronic', false),
  ('CFL', 'Compact Fluorescent', 'Fluorescent', 'Compact folded/spiral fluorescent tube', 'Spiral or folded U-shape tube, screw base or plug-in', 10000, '1-3 minutes to full brightness', false, true, false, NULL, true),
  ('MH', 'Metal Halide', 'HID', 'High-intensity discharge, white/blue light', 'Bright white/blue light, arc tube inside outer glass envelope, takes 5-15 min to reach full output', 20000, '5-15 minutes', false, true, true, 'Magnetic HID', false),
  ('HPS', 'High Pressure Sodium', 'HID', 'High-intensity discharge, amber/orange light', 'Distinctive amber/orange/yellow light, arc tube visible, takes 5-10 min warmup', 24000, '5-10 minutes', false, true, true, 'Magnetic HID', false),
  ('MV', 'Mercury Vapor', 'HID', 'Oldest HID technology, bluish-green light', 'Bluish-green/white light, large bulbous shape, very old technology', 24000, '5-10 minutes', false, true, true, 'Magnetic HID', true),
  ('INCAND', 'Incandescent', 'Incandescent', 'Traditional glowing filament bulb', 'Warm yellow glow, visible filament, round bulb shape (A19/A21)', 1000, 'Instant', true, false, false, NULL, true),
  ('HAL', 'Halogen', 'Halogen', 'Improved incandescent with halogen gas', 'Bright white light, compact design, very hot to touch, various shapes (PAR, MR16, T-type)', 3000, 'Instant', true, false, false, NULL, true),
  ('LED_TUBE', 'LED Tube (Retrofit)', 'LED', 'LED tube that replaces fluorescent in existing fixture', 'Looks like fluorescent tube but solid-state, may bypass ballast', 50000, 'Instant', true, false, false, NULL, false),
  ('LED_FIXTURE', 'LED Integrated Fixture', 'LED', 'Purpose-built LED fixture, no replaceable lamp', 'Sleek modern design, thin profile, integrated heat sink', 50000, 'Instant', true, false, false, NULL, false),
  ('LED_RETROFIT', 'LED Retrofit Kit', 'LED', 'LED module that retrofits into existing fixture housing', 'Flat LED panel or module with driver, mounts inside existing housing', 50000, 'Instant', true, false, false, NULL, false)
ON CONFLICT (lamp_code) DO NOTHING;


-- ============================================================
-- 3. FIXTURE WATTAGE REFERENCE — THE CRITICAL TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS fixture_wattage_reference (
  id SERIAL PRIMARY KEY,
  fixture_id TEXT UNIQUE NOT NULL,
  category_code TEXT REFERENCES fixture_categories(category_code),
  lamp_code TEXT REFERENCES lamp_types(lamp_code),
  fixture_description TEXT NOT NULL,
  lamp_count INTEGER,
  lamp_length TEXT,
  system_wattage INTEGER NOT NULL,
  ballast_type TEXT,
  lumens_initial INTEGER,
  lumens_mean INTEGER,
  led_replacement_watts INTEGER NOT NULL,
  led_replacement_description TEXT,
  visual_identification TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixture_wattage_ref_category ON fixture_wattage_reference(category_code);
CREATE INDEX IF NOT EXISTS idx_fixture_wattage_ref_lamp ON fixture_wattage_reference(lamp_code);
CREATE INDEX IF NOT EXISTS idx_fixture_wattage_ref_wattage ON fixture_wattage_reference(system_wattage);

ALTER TABLE fixture_wattage_reference ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to fixture_wattage_reference" ON fixture_wattage_reference;
CREATE POLICY "Allow all access to fixture_wattage_reference" ON fixture_wattage_reference
  FOR ALL USING (true) WITH CHECK (true);

-- ---- T12 Fluorescent Troffers ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('T12-2FT-1L-MAG', 'TROFFER', 'T12', '2ft T12 Troffer, 1-lamp, Magnetic', 1, '2ft', 26, 'Magnetic', 1450, 1300, 12, '2ft LED Troffer or LED Tube', '2x2 ceiling tile, thick single tube, large magnetic ballast hum', 'Very old, likely pre-1990'),
  ('T12-4FT-1L-MAG', 'TROFFER', 'T12', '4ft T12 Troffer, 1-lamp, Magnetic', 1, '4ft', 46, 'Magnetic', 2650, 2400, 18, '4ft LED Troffer or LED Tube', '2x4 ceiling tile, single thick tube', 'Common in utility areas'),
  ('T12-4FT-2L-MAG', 'TROFFER', 'T12', '4ft T12 Troffer, 2-lamp, Magnetic', 2, '4ft', 86, 'Magnetic', 5300, 4800, 32, '4ft LED Troffer 2x4', '2x4 ceiling tile, two thick tubes, may have prismatic lens', 'Most common T12 troffer'),
  ('T12-4FT-2L-EE', 'TROFFER', 'T12', '4ft T12 Troffer, 2-lamp, EE Magnetic', 2, '4ft', 72, 'Energy-Efficient Magnetic', 5100, 4600, 32, '4ft LED Troffer 2x4', 'Same as standard T12 but lower wattage ballast', 'Energy-efficient magnetic ballast version'),
  ('T12-4FT-3L-MAG', 'TROFFER', 'T12', '4ft T12 Troffer, 3-lamp, Magnetic', 3, '4ft', 128, 'Magnetic', 7950, 7200, 40, '4ft LED Troffer 2x4', '2x4 ceiling tile, three thick tubes', 'Less common, higher output'),
  ('T12-4FT-4L-MAG', 'TROFFER', 'T12', '4ft T12 Troffer, 4-lamp, Magnetic', 4, '4ft', 172, 'Magnetic', 10600, 9600, 50, '4ft LED Troffer 2x4 High Output', '2x4 ceiling tile, four thick tubes, parabolic louver', 'High output office troffer'),
  ('T12-8FT-1L-MAG', 'STRIP', 'T12', '8ft T12 Strip, 1-lamp, Magnetic', 1, '8ft', 82, 'Magnetic', 5800, 5200, 36, '8ft LED Strip or 2x 4ft LED Tubes', 'Long single thick tube, bare strip channel', 'Common in old warehouses'),
  ('T12-8FT-2L-MAG', 'STRIP', 'T12', '8ft T12 Strip, 2-lamp, Magnetic', 2, '8ft', 158, 'Magnetic', 11600, 10400, 65, '8ft LED Strip or 2x 4ft LED Strip', 'Long double thick tubes, bare strip channel', 'Common in warehouses/garages'),
  ('T12-8FT-1L-HO', 'STRIP', 'T12', '8ft T12HO Strip, 1-lamp, Magnetic', 1, '8ft', 118, 'Magnetic HO', 8600, 7800, 44, '8ft LED Strip High Output', 'Single thick tube, larger than standard', 'High-output version'),
  ('T12-8FT-2L-HO', 'STRIP', 'T12', '8ft T12HO Strip, 2-lamp, Magnetic', 2, '8ft', 228, 'Magnetic HO', 17200, 15600, 80, '8ft LED Strip High Output', 'Two thick tubes, large ballast', 'High-output industrial')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- T8 Fluorescent Troffers/Strips ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('T8-2FT-1L', 'TROFFER', 'T8', '2ft T8 Troffer, 1-lamp', 1, '2ft', 20, 'Electronic', 1800, 1650, 10, '2ft LED Troffer or LED Tube', '2x2 ceiling tile, single medium tube', 'Small office/utility'),
  ('T8-2FT-2L', 'TROFFER', 'T8', '2ft T8 Troffer, 2-lamp', 2, '2ft', 36, 'Electronic', 3600, 3300, 20, '2ft LED Troffer 2x2', '2x2 ceiling tile, two medium tubes', 'Common 2x2 office troffer'),
  ('T8-2FT-3L-U', 'TROFFER', 'T8', '2ft T8 U-Bend Troffer, 3-lamp', 3, '2ft U-Bend', 93, 'Electronic', 8100, 7400, 35, '2x2 LED Troffer', '2x2 ceiling tile with U-shaped tubes', 'U-bend configuration'),
  ('T8-4FT-1L', 'TROFFER', 'T8', '4ft T8 Troffer, 1-lamp', 1, '4ft', 32, 'Electronic', 2800, 2600, 15, '4ft LED Troffer or LED Tube', '1x4 or 2x4 ceiling tile, single medium tube', 'Low-output areas'),
  ('T8-4FT-2L', 'TROFFER', 'T8', '4ft T8 Troffer, 2-lamp', 2, '4ft', 59, 'Electronic', 5600, 5200, 30, '4ft LED Troffer 2x4', '2x4 ceiling tile, two medium tubes, flat or prismatic lens', 'MOST COMMON commercial fixture in the US'),
  ('T8-4FT-3L', 'TROFFER', 'T8', '4ft T8 Troffer, 3-lamp', 3, '4ft', 85, 'Electronic', 8400, 7800, 40, '4ft LED Troffer 2x4', '2x4 ceiling tile, three medium tubes', 'Higher output offices'),
  ('T8-4FT-4L', 'TROFFER', 'T8', '4ft T8 Troffer, 4-lamp', 4, '4ft', 112, 'Electronic', 11200, 10400, 50, '4ft LED Troffer 2x4 High Output', '2x4 ceiling tile, four medium tubes, parabolic louver common', 'High output, common in open offices'),
  ('T8-4FT-2L-STRIP', 'STRIP', 'T8', '4ft T8 Strip, 2-lamp', 2, '4ft', 59, 'Electronic', 5600, 5200, 30, '4ft LED Strip', 'Bare channel with two medium tubes, no lens', 'Common in back-of-house areas'),
  ('T8-4FT-4L-STRIP', 'STRIP', 'T8', '4ft T8 Strip, 4-lamp', 4, '4ft', 112, 'Electronic', 11200, 10400, 44, '4ft LED Strip High Output', 'Bare channel with four medium tubes', 'Tandem wired strips'),
  ('T8-8FT-1L', 'STRIP', 'T8', '8ft T8 Strip, 1-lamp', 1, '8ft', 62, 'Electronic', 5400, 5000, 30, '8ft LED Strip or 2x 4ft LED', 'Long single medium tube, bare strip channel', 'Common in warehouses'),
  ('T8-8FT-2L', 'STRIP', 'T8', '8ft T8 Strip, 2-lamp', 2, '8ft', 118, 'Electronic', 10800, 10000, 55, '8ft LED Strip', 'Long double medium tubes, bare strip channel', 'Most common 8ft strip'),
  ('T8-4FT-2L-WRAP', 'WRAP', 'T8', '4ft T8 Wraparound, 2-lamp', 2, '4ft', 59, 'Electronic', 5600, 5200, 30, '4ft LED Wraparound', 'Surface mount with curved clear/frosted acrylic lens', 'Common in stairwells, corridors'),
  ('T8-4FT-2L-VAPOR', 'VAPOR_TIGHT', 'T8', '4ft T8 Vapor Tight, 2-lamp', 2, '4ft', 59, 'Electronic', 5600, 5200, 30, '4ft LED Vapor Tight', 'Sealed gasketed housing with clear lens', 'Car washes, parking garages, food processing')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- T5 / T5HO Fluorescent ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('T5-4FT-2L', 'TROFFER', 'T5', '4ft T5 Troffer, 2-lamp', 2, '4ft', 58, 'Electronic', 5700, 5300, 30, '4ft LED Troffer', '2x4 ceiling tile, two thin tubes, mini bi-pin ends', 'Less common than T8'),
  ('T5-4FT-3L', 'TROFFER', 'T5', '4ft T5 Troffer, 3-lamp', 3, '4ft', 84, 'Electronic', 8550, 7950, 40, '4ft LED Troffer', '2x4 ceiling tile, three thin tubes', 'Higher output T5'),
  ('T5HO-4FT-2L', 'HIGHBAY', 'T5HO', '4ft T5HO High Bay, 2-lamp', 2, '4ft', 118, 'Electronic', 10000, 9200, 55, 'LED High Bay 150W equivalent', 'Suspended fixture with reflector, two thin bright tubes', 'Common in 15-25ft ceilings'),
  ('T5HO-4FT-4L', 'HIGHBAY', 'T5HO', '4ft T5HO High Bay, 4-lamp', 4, '4ft', 234, 'Electronic', 20000, 18400, 100, 'LED High Bay 300W equivalent', 'Suspended fixture with reflector, four thin bright tubes', 'Most common T5HO high bay'),
  ('T5HO-4FT-6L', 'HIGHBAY', 'T5HO', '4ft T5HO High Bay, 6-lamp', 6, '4ft', 348, 'Electronic', 30000, 27600, 150, 'LED High Bay 500W equivalent', 'Large suspended fixture, six thin bright tubes', 'High-output industrial high bay'),
  ('T5HO-4FT-8L', 'HIGHBAY', 'T5HO', '4ft T5HO High Bay, 8-lamp', 8, '4ft', 464, 'Electronic', 40000, 36800, 200, 'LED High Bay 750W equivalent', 'Very large fixture, eight thin bright tubes, stacked', 'Maximum output T5HO, 25-40ft ceilings')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- Metal Halide (Indoor) ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('MH-70W-IND', 'RECESSED_CAN', 'MH', '70W Metal Halide, Indoor', 1, NULL, 85, 'Magnetic HID', 5600, 4000, 30, 'LED Recessed Downlight', 'Small HID downlight or track fixture', 'Retail/accent lighting'),
  ('MH-100W-IND', 'LOWBAY', 'MH', '100W Metal Halide, Indoor Low Bay', 1, NULL, 120, 'Magnetic HID', 8500, 6000, 50, 'LED Low Bay', 'Bell-shaped industrial fixture, 12-20ft ceiling', 'Small warehouse/shop'),
  ('MH-150W-IND', 'LOWBAY', 'MH', '150W Metal Halide, Indoor Low Bay', 1, NULL, 185, 'Magnetic HID', 13000, 9100, 65, 'LED Low Bay', 'Bell-shaped fixture, aluminum reflector', 'Medium warehouse'),
  ('MH-175W-IND', 'HIGHBAY', 'MH', '175W Metal Halide, Indoor High Bay', 1, NULL, 210, 'Magnetic HID', 14000, 9800, 80, 'LED High Bay', 'Bell-shaped fixture, chain-suspended', 'Older warehouse standard'),
  ('MH-250W-IND', 'HIGHBAY', 'MH', '250W Metal Halide, Indoor High Bay', 1, NULL, 290, 'Magnetic HID', 20500, 14350, 100, 'LED High Bay', 'Large bell fixture, 20-30ft ceiling', 'Common warehouse high bay'),
  ('MH-400W-IND', 'HIGHBAY', 'MH', '400W Metal Halide, Indoor High Bay', 1, NULL, 455, 'Magnetic HID', 36000, 25200, 150, 'LED High Bay', 'Large bell or open reflector, 25-40ft', 'MOST COMMON HID high bay'),
  ('MH-1000W-IND', 'HIGHBAY', 'MH', '1000W Metal Halide, Indoor High Bay', 1, NULL, 1080, 'Magnetic HID', 110000, 77000, 400, 'LED High Bay 1000W equiv', 'Very large fixture, 35-50ft ceiling, sports venues', 'Large arenas and factories'),
  ('MH-1500W-IND', 'HIGHBAY', 'MH', '1500W Metal Halide, Indoor High Bay', 1, NULL, 1610, 'Magnetic HID', 155000, 108500, 600, 'LED High Bay 1500W equiv', 'Massive fixture, 40-60ft ceiling', 'Stadiums and very large facilities')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- Metal Halide (Outdoor) ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('MH-100W-WP', 'WALLPACK', 'MH', '100W Metal Halide Wall Pack', 1, NULL, 120, 'Magnetic HID', 8500, 6000, 40, 'LED Wall Pack', 'Box-shaped wall-mount fixture, glass refractor lens', 'Building perimeter'),
  ('MH-150W-WP', 'WALLPACK', 'MH', '150W Metal Halide Wall Pack', 1, NULL, 185, 'Magnetic HID', 13000, 9100, 50, 'LED Wall Pack', 'Medium box-shaped wall fixture', 'Loading dock areas'),
  ('MH-175W-FLOOD', 'FLOOD', 'MH', '175W Metal Halide Flood', 1, NULL, 210, 'Magnetic HID', 14000, 9800, 70, 'LED Flood', 'Rectangular flood fixture', 'Sign lighting, small areas'),
  ('MH-250W-FLOOD', 'FLOOD', 'MH', '250W Metal Halide Flood', 1, NULL, 290, 'Magnetic HID', 20500, 14350, 100, 'LED Flood', 'Large rectangular flood fixture', 'Parking areas, sports'),
  ('MH-400W-FLOOD', 'FLOOD', 'MH', '400W Metal Halide Flood', 1, NULL, 455, 'Magnetic HID', 36000, 25200, 150, 'LED Flood', 'Large flood, often on pole or wall bracket', 'Parking lots, fields'),
  ('MH-400W-AREA', 'AREA', 'MH', '400W Metal Halide Area/Parking', 1, NULL, 455, 'Magnetic HID', 36000, 25200, 150, 'LED Area Light', 'Shoebox-style on pole, flat glass lens', 'Parking lot standard'),
  ('MH-1000W-FLOOD', 'FLOOD', 'MH', '1000W Metal Halide Flood', 1, NULL, 1080, 'Magnetic HID', 110000, 77000, 400, 'LED Flood High Power', 'Very large flood on tall pole or structure', 'Sports fields, large lots'),
  ('MH-1000W-AREA', 'AREA', 'MH', '1000W Metal Halide Area Light', 1, NULL, 1080, 'Magnetic HID', 110000, 77000, 400, 'LED Area Light High Power', 'Large shoebox on 30-40ft pole', 'Highway, large parking')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- High Pressure Sodium ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('HPS-70W-IND', 'LOWBAY', 'HPS', '70W HPS Indoor Low Bay', 1, NULL, 85, 'Magnetic HID', 6300, 5700, 30, 'LED Low Bay', 'Small HPS fixture, amber light', 'Stairwells, utility areas'),
  ('HPS-100W-WP', 'WALLPACK', 'HPS', '100W HPS Wall Pack', 1, NULL, 120, 'Magnetic HID', 9500, 8550, 40, 'LED Wall Pack', 'Wall-mount box fixture, amber glow', 'Building perimeter'),
  ('HPS-150W-WP', 'WALLPACK', 'HPS', '150W HPS Wall Pack', 1, NULL, 185, 'Magnetic HID', 16000, 14400, 50, 'LED Wall Pack', 'Medium wall pack, amber light', 'Loading docks, alleys'),
  ('HPS-150W-FLOOD', 'FLOOD', 'HPS', '150W HPS Flood', 1, NULL, 185, 'Magnetic HID', 16000, 14400, 50, 'LED Flood', 'Rectangular flood, amber output', 'Security lighting'),
  ('HPS-200W-AREA', 'AREA', 'HPS', '200W HPS Area Light', 1, NULL, 240, 'Magnetic HID', 22000, 19800, 80, 'LED Area Light', 'Shoebox on pole, amber light', 'Parking lots, roadways'),
  ('HPS-250W-IND', 'HIGHBAY', 'HPS', '250W HPS Indoor High Bay', 1, NULL, 295, 'Magnetic HID', 27500, 24750, 100, 'LED High Bay', 'Bell fixture, amber light, industrial', 'Warehouse where color is not critical'),
  ('HPS-250W-AREA', 'AREA', 'HPS', '250W HPS Area Light', 1, NULL, 295, 'Magnetic HID', 27500, 24750, 100, 'LED Area Light', 'Shoebox on pole, amber light', 'Standard parking lot'),
  ('HPS-400W-IND', 'HIGHBAY', 'HPS', '400W HPS Indoor High Bay', 1, NULL, 465, 'Magnetic HID', 50000, 45000, 150, 'LED High Bay', 'Large bell fixture, amber light', 'Large warehouses'),
  ('HPS-400W-AREA', 'AREA', 'HPS', '400W HPS Area Light', 1, NULL, 465, 'Magnetic HID', 50000, 45000, 150, 'LED Area Light', 'Large shoebox on pole', 'Major parking lots'),
  ('HPS-1000W-FLOOD', 'FLOOD', 'HPS', '1000W HPS Flood', 1, NULL, 1100, 'Magnetic HID', 140000, 126000, 400, 'LED Flood High Power', 'Very large flood, amber light', 'Sports fields, industrial yards')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- Mercury Vapor ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('MV-175W', 'AREA', 'MV', '175W Mercury Vapor Area Light', 1, NULL, 200, 'Magnetic HID', 8600, 6900, 50, 'LED Area Light', 'Old cobra head or post top, bluish-green light', 'Very old, should always be replaced'),
  ('MV-250W', 'AREA', 'MV', '250W Mercury Vapor Area Light', 1, NULL, 290, 'Magnetic HID', 12100, 9700, 80, 'LED Area Light', 'Old cobra head, bluish-green light', 'Being phased out, highly inefficient'),
  ('MV-400W', 'HIGHBAY', 'MV', '400W Mercury Vapor High Bay', 1, NULL, 455, 'Magnetic HID', 22600, 18100, 120, 'LED High Bay', 'Old industrial bell fixture, bluish light', 'Very old warehouses, should replace'),
  ('MV-1000W', 'HIGHBAY', 'MV', '1000W Mercury Vapor High Bay', 1, NULL, 1075, 'Magnetic HID', 57000, 45600, 300, 'LED High Bay High Power', 'Massive old fixture, bluish light', 'Very rare, old arenas')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- Incandescent / Halogen ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('INCAND-40W', 'RECESSED_CAN', 'INCAND', '40W Incandescent', 1, NULL, 40, NULL, 450, 400, 5, 'LED A19 or Downlight', 'Standard bulb shape, warm yellow glow', 'Very inefficient'),
  ('INCAND-60W', 'RECESSED_CAN', 'INCAND', '60W Incandescent', 1, NULL, 60, NULL, 840, 750, 8, 'LED A19 or Downlight', 'Standard bulb shape, warm yellow glow', 'Most common household bulb'),
  ('INCAND-75W', 'RECESSED_CAN', 'INCAND', '75W Incandescent', 1, NULL, 75, NULL, 1170, 1050, 10, 'LED A19/A21 or Downlight', 'Standard or slightly larger bulb', 'Common in older commercial'),
  ('INCAND-100W', 'RECESSED_CAN', 'INCAND', '100W Incandescent', 1, NULL, 100, NULL, 1690, 1500, 14, 'LED A21 or Downlight', 'Slightly larger bulb, brighter yellow glow', 'Phased out in many markets'),
  ('INCAND-150W', 'RECESSED_CAN', 'INCAND', '150W Incandescent', 1, NULL, 150, NULL, 2680, 2400, 18, 'LED Downlight or Retrofit', 'Large A21 bulb, very bright warm light', 'Utility/industrial use'),
  ('HAL-50W-MR16', 'TRACK', 'HAL', '50W Halogen MR16', 1, NULL, 50, NULL, 950, 850, 7, 'LED MR16', 'Small reflector lamp, two-pin base, very hot', 'Track lighting, accent'),
  ('HAL-75W-PAR30', 'RECESSED_CAN', 'HAL', '75W Halogen PAR30', 1, NULL, 75, NULL, 1030, 920, 11, 'LED PAR30', 'Parabolic reflector, medium screw base', 'Recessed downlights, retail'),
  ('HAL-90W-PAR38', 'FLOOD', 'HAL', '90W Halogen PAR38', 1, NULL, 90, NULL, 1350, 1200, 14, 'LED PAR38', 'Large parabolic reflector', 'Exterior floods, accents'),
  ('HAL-150W-PAR38', 'FLOOD', 'HAL', '150W Halogen PAR38', 1, NULL, 150, NULL, 2600, 2300, 18, 'LED PAR38 High Output', 'Large reflector, very hot', 'Outdoor floods, display'),
  ('HAL-300W-T3', 'FLOOD', 'HAL', '300W Halogen T3 Double-Ended', 1, NULL, 300, NULL, 5000, 4500, 30, 'LED Flood', 'Linear quartz tube, double-ended', 'Security floods, work lights'),
  ('HAL-500W-T3', 'FLOOD', 'HAL', '500W Halogen T3 Double-Ended', 1, NULL, 500, NULL, 9500, 8500, 50, 'LED Flood', 'Linear quartz tube, very hot', 'Construction/security floods')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- CFL ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('CFL-13W', 'RECESSED_CAN', 'CFL', '13W CFL (equiv 60W incandescent)', 1, NULL, 13, NULL, 825, 740, 8, 'LED A19 or Downlight', 'Spiral or twin-tube, screw or plug-in base', 'Common retrofit for incandescent'),
  ('CFL-18W', 'RECESSED_CAN', 'CFL', '18W CFL (equiv 75W incandescent)', 1, NULL, 18, NULL, 1100, 990, 10, 'LED A19/A21 or Downlight', 'Larger spiral or quad-tube', 'Commercial downlights'),
  ('CFL-26W', 'RECESSED_CAN', 'CFL', '26W CFL (equiv 100W incandescent)', 1, NULL, 26, NULL, 1700, 1530, 14, 'LED Downlight or Retrofit', 'Large spiral or triple-tube, plug-in', 'Common in 6-inch recessed cans'),
  ('CFL-32W', 'RECESSED_CAN', 'CFL', '32W CFL (equiv 125W incandescent)', 1, NULL, 32, NULL, 2100, 1890, 18, 'LED Downlight or Retrofit', 'Very large CFL, often plug-in quad', 'High-output downlights'),
  ('CFL-42W', 'RECESSED_CAN', 'CFL', '42W CFL (equiv 150W incandescent)', 1, NULL, 42, NULL, 3200, 2880, 22, 'LED Downlight High Output', 'Largest CFL, triple or quad tube', '8-inch recessed cans')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- Canopy Fixtures ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('MH-150W-CAN', 'CANOPY', 'MH', '150W Metal Halide Canopy', 1, NULL, 185, 'Magnetic HID', 13000, 9100, 50, 'LED Canopy', 'Flat surface-mount under canopy, white light', 'Gas station, drive-through'),
  ('MH-250W-CAN', 'CANOPY', 'MH', '250W Metal Halide Canopy', 1, NULL, 290, 'Magnetic HID', 20500, 14350, 90, 'LED Canopy', 'Medium canopy fixture', 'Large canopy areas'),
  ('HPS-150W-CAN', 'CANOPY', 'HPS', '150W HPS Canopy', 1, NULL, 185, 'Magnetic HID', 16000, 14400, 50, 'LED Canopy', 'Flat surface-mount, amber light', 'Older gas stations'),
  ('HPS-250W-CAN', 'CANOPY', 'HPS', '250W HPS Canopy', 1, NULL, 295, 'Magnetic HID', 27500, 24750, 90, 'LED Canopy', 'Medium canopy fixture, amber light', 'Large older canopies')
ON CONFLICT (fixture_id) DO NOTHING;

-- ---- Exit Signs ----
INSERT INTO fixture_wattage_reference (fixture_id, category_code, lamp_code, fixture_description, lamp_count, lamp_length, system_wattage, ballast_type, lumens_initial, lumens_mean, led_replacement_watts, led_replacement_description, visual_identification, notes) VALUES
  ('EXIT-INCAND', 'EXIT_EMERGENCY', 'INCAND', 'Incandescent Exit Sign', 2, NULL, 40, NULL, 450, 400, 2, 'LED Exit Sign', 'Red or green EXIT letters, two small incandescent lamps inside', 'Very old, 40W typical (two 20W lamps)'),
  ('EXIT-CFL', 'EXIT_EMERGENCY', 'CFL', 'CFL Exit Sign', 2, NULL, 14, NULL, 400, 360, 2, 'LED Exit Sign', 'Red or green EXIT letters with CFL lamps', 'Intermediate technology'),
  ('EXIT-LED', 'EXIT_EMERGENCY', 'LED_FIXTURE', 'LED Exit Sign', 1, NULL, 2, NULL, 100, 100, 2, 'Already LED', 'Thin LED exit sign', 'Already efficient, no action needed')
ON CONFLICT (fixture_id) DO NOTHING;


-- ============================================================
-- 4. VISUAL IDENTIFICATION GUIDE
-- ============================================================

CREATE TABLE IF NOT EXISTS visual_identification_guide (
  id SERIAL PRIMARY KEY,
  category_code TEXT REFERENCES fixture_categories(category_code),
  feature_name TEXT NOT NULL,
  feature_description TEXT,
  identification_tips TEXT,
  common_mistakes TEXT,
  photo_clues TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visual_guide_category ON visual_identification_guide(category_code);

ALTER TABLE visual_identification_guide ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to visual_identification_guide" ON visual_identification_guide;
CREATE POLICY "Allow all access to visual_identification_guide" ON visual_identification_guide
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO visual_identification_guide (category_code, feature_name, feature_description, identification_tips, common_mistakes, photo_clues) VALUES
  ('TROFFER', 'Lens Type - Prismatic', 'Textured plastic lens that diffuses light in a grid pattern', 'Look for patterned plastic cover over the entire fixture opening. Prismatic lenses have small pyramid or cone shapes stamped into the plastic.', 'Confusing prismatic with frosted. Prismatic has a geometric pattern; frosted is smooth but translucent.', ARRAY['Patterned plastic cover', 'Grid-like texture visible', 'Light diffused evenly']),
  ('TROFFER', 'Lens Type - Parabolic', 'Grid of small reflective cells/louvers creating a "waffle" look', 'Parabolic troffers have a metallic grid insert (usually silver/aluminum) with individual cells. Often called "deep cell parabolic" or "18-cell."', 'Confusing with egg-crate diffuser. Parabolic has reflective metal cells; egg-crate is flat white plastic grid.', ARRAY['Metallic grid visible', 'Individual reflective cells', 'Silver or aluminum color', 'You can see individual lamps through cells']),
  ('TROFFER', 'Lens Type - Flat/Smooth', 'Smooth flat white or frosted acrylic panel', 'Modern look with a flat white panel covering the entire opening. Common in renovated spaces or LED upgrades.', 'May already be an LED panel. Check if the surface is uniformly lit (LED) vs showing lamp shadows (fluorescent behind flat lens).', ARRAY['Flat white surface', 'Uniform light output', 'Clean modern appearance']),
  ('TROFFER', 'Size - 2x4', '2ft wide by 4ft long, fits standard ceiling grid', 'Most common troffer size. Measures 2 feet wide by 4 feet long. Count ceiling tiles: takes up one tile width, two tiles long.', 'Confusing with 1x4 (which is narrower). Count the grid squares it occupies.', ARRAY['Rectangular shape', 'Spans 2 ceiling tiles in length', '1 ceiling tile wide', 'This is the most common size']),
  ('TROFFER', 'Size - 2x2', '2ft by 2ft square, fits in one ceiling tile', 'Square fixture that occupies exactly one ceiling tile space. May have U-bend lamps or short lamps.', 'Confusing with a light panel. 2x2 troffers are thicker than flat panels.', ARRAY['Square shape', 'Fits one ceiling tile', 'Thicker than flat panel']),
  ('TROFFER', 'Size - 1x4', '1ft wide by 4ft long, narrower profile', 'Narrower troffer, only about 1 foot wide but 4 feet long. Often used in corridors or between ceiling tiles.', 'Confusing with a strip light. 1x4 troffers are recessed; strips are surface-mounted.', ARRAY['Narrow rectangular', 'Recessed in ceiling grid', 'About half the width of a 2x4']),
  ('TROFFER', 'T12 vs T8 Identification', 'Distinguishing T12 from T8 lamps in troffers', 'T12 tubes are 1.5 inches (38mm) diameter — about the width of a quarter. T8 tubes are 1 inch (25mm) — about the width of a nickel. T12 fixtures usually have magnetic ballasts (heavier, may hum).', 'Most people cannot distinguish T12 from T8 by sight alone. Look for lamp markings (F40T12 vs F32T8), check ballast sticker, or note fixture age (pre-2000 often T12).', ARRAY['Tube diameter comparison to a coin', 'Lamp markings on tube end', 'Ballast type label (magnetic vs electronic)', 'Age of building/fixture']),
  ('TROFFER', 'T5 Identification', 'Identifying T5 or T5HO lamps in fixtures', 'T5 tubes are thin — only 5/8 inch (16mm) diameter. They have mini bi-pin connectors (not the medium bi-pin of T8/T12). The fixture will be noticeably thinner.', 'T5 lamps are NOT interchangeable with T8/T12. If tubes look very thin and fixture is modern/slim, likely T5.', ARRAY['Very thin tubes', 'Mini bi-pin ends', 'Slim modern fixture housing', 'Often found in newer construction']),
  ('TROFFER', 'Lamp Count', 'Counting number of lamps per fixture', 'Look through the lens or from the side. Count individual tubes visible. Common counts: 1-lamp (low output), 2-lamp (standard), 3-lamp (high output), 4-lamp (maximum output).', 'Some lamps may be burned out and hard to see. Dark spots or missing tubes indicate burned-out lamps. Count lamp slots, not just lit lamps.', ARRAY['Count tubes visible through lens', 'Look for lamp shadows on lens', 'Check both ends of fixture for socket count']),
  ('HIGHBAY', 'Bell/Round High Bay', 'Traditional round/bell-shaped high bay fixture', 'Round reflector housing, often aluminum or industrial gray, suspended by chains or rods. May have glass or open bottom. Usually contains one HID lamp.', 'Confusing wattage — same bell shape used for 100W to 1000W MH. Need to check lamp or ballast label for actual wattage.', ARRAY['Round/bell shape', 'Chain or rod suspension', 'Aluminum reflector', 'Single lamp visible when looking up']),
  ('HIGHBAY', 'Linear High Bay', 'Rectangular/linear fluorescent high bay', 'Long rectangular fixture suspended from ceiling, usually with T5HO or T8 lamps. Has metal reflector housing. Multiple tubes visible.', 'May look similar to a strip light but is purpose-built for high-ceiling suspension with proper reflector optics.', ARRAY['Rectangular shape', 'Multiple tubes visible', 'Suspended from chains/rods', 'Metal reflector housing']),
  ('HIGHBAY', 'UFO LED High Bay', 'Round flat LED high bay (already LED)', 'Thin round disc shape, often black or gray housing. LED chips visible through clear/frosted lens on bottom. Already LED — no retrofit needed.', 'These are already LED! Do not recommend LED replacement. Only note if they need higher/lower output units.', ARRAY['Thin disc shape', 'Flat profile', 'LED chips visible', 'Black/gray housing']),
  ('WALLPACK', 'Full Cutoff', 'Wall pack designed to minimize uplight', 'Box-shaped with flat glass lens, light directed downward only. No light escapes above horizontal plane. Modern dark-sky compliant.', 'May contain HPS (amber) or MH (white). Check light color to determine lamp type. Amber = HPS, White = MH.', ARRAY['Box shape on wall', 'Flat glass lens', 'Light directed downward', 'No visible uplight']),
  ('WALLPACK', 'Semi-Cutoff/Traditional', 'Traditional wall pack with some uplight', 'Box shape with curved or angled refractor lens, some light spills upward. Older design, not dark-sky compliant.', 'More light loss means higher wattage lamp may be needed for same area. Factor in uplight waste when calculating savings.', ARRAY['Curved refractor lens', 'Light visible above fixture', 'Older box design']),
  ('AREA', 'Shoebox Style', 'Flat rectangular area light for poles', 'Flat rectangular fixture mounted on pole arm. Called "shoebox" because of its flat box shape. Most common parking lot fixture.', 'Wattage varies widely (100W to 1000W HID). Must identify lamp type (HPS=amber, MH=white) and check label.', ARRAY['Flat rectangular box', 'Mounted on pole arm', 'Flat glass or prismatic lens on bottom']),
  ('AREA', 'Cobra Head', 'Curved-arm street/area light', 'Distinctive curved arm mounting. Traditional street light shape. Usually HPS (amber) in older installations.', 'Very commonly HPS. If light is amber/orange, almost certainly HPS. If white, could be MH or already LED.', ARRAY['Curved arm mount', 'Traditional street light shape', 'Usually amber light color']),
  ('STRIP', 'Open Strip vs Enclosed', 'Distinguishing strip types', 'Open strips have bare visible lamps with no lens cover. Enclosed strips have a clear, frosted, or wire-guard cover. Both mount to surface or hang from chains.', 'Open strips are NOT vapor tight. If you see gaskets and sealed cover, it is a vapor tight fixture, not a strip.', ARRAY['Bare lamps visible (open)', 'No lens cover (open)', 'Simple channel housing', 'Surface or chain mounted']),
  ('RECESSED_CAN', 'Can Size', 'Identifying recessed can diameter', 'Common sizes: 4-inch, 5-inch, 6-inch, 8-inch. Measure the opening diameter. 6-inch is most common commercial. Size determines LED retrofit kit size.', 'The visible trim ring may be larger than the actual can size. Measure the inner opening, not the trim.', ARRAY['Circular ceiling opening', 'Visible trim ring', 'Measure opening diameter']),
  ('RECESSED_CAN', 'Lamp Type in Can', 'Identifying what lamp is inside a recessed can', 'Look inside the can: Incandescent = visible filament bulb; CFL = spiral or folded tube; Halogen = small bright reflector; LED = flat disc or module.', 'Cannot always see lamp type without removing trim. Age of building helps: pre-1990 likely incandescent, 1990-2010 likely CFL, post-2010 may already be LED.', ARRAY['Look up into the can', 'Visible lamp shape inside', 'Light color helps identify', 'Warm yellow = incandescent, Cool white = CFL']),
  ('CANOPY', 'Canopy Fixture', 'Identifying gas station / covered area canopy lights', 'Flat rectangular or square fixture mounted flush to underside of canopy structure. Usually has flat glass or prismatic lens.', 'Can contain MH (white light), HPS (amber), or already be LED. Check light color and look for ballast housing.', ARRAY['Mounted to underside of canopy', 'Flat rectangular shape', 'Flush mount', 'Look for ballast box on top of canopy']),
  ('VAPOR_TIGHT', 'Vapor Tight Fixture', 'Identifying sealed/gasketed fixtures', 'Sealed fixture with gasket between housing and clear lens. Water/dust-proof rating (IP65+). Often in car washes, parking garages, food plants.', 'Not the same as a strip light with a cover. Vapor tight has GASKETS and is rated for wet locations.', ARRAY['Sealed housing', 'Visible gasket', 'Clear lens cover', 'Used in wet/dusty areas']),
  ('EXIT_EMERGENCY', 'Exit Sign Type', 'Identifying exit sign lamp technology', 'LED exit signs: very thin, uniform light, cool to touch, 1-5W. Incandescent: thick housing, visible bulbs through back plate, hot, 20-40W. CFL: medium thickness, 7-14W.', 'LED exit signs are already efficient (1-5W). Only incandescent (40W) and CFL (14W) exit signs benefit from LED upgrade.', ARRAY['Check thickness of housing', 'Feel for heat (incandescent = hot)', 'Look at back for visible bulbs', 'Check label for wattage']),
  ('PENDANT', 'Pendant Fixture', 'Identifying suspended decorative fixtures', 'Hangs from ceiling by cord, chain, or rod. Decorative design. May contain incandescent, halogen, CFL, or LED lamp. Common in restaurants, lobbies.', 'Focus on the LAMP inside, not the fixture. The pendant is just the housing — identify what lamp type it uses.', ARRAY['Suspended from ceiling', 'Decorative housing', 'Single or multiple lamp', 'Check lamp type inside']),
  ('TRACK', 'Track Lighting', 'Identifying track-mounted fixtures', 'Multiple adjustable fixture heads mounted on a ceiling track. Each head can be aimed. Common with halogen MR16 or PAR lamps.', 'Count the NUMBER of track heads — each is a separate fixture for calculation purposes. A 6-head track is 6 fixtures.', ARRAY['Track rail on ceiling', 'Adjustable fixture heads', 'Multiple fixtures per track', 'Small reflector lamps visible']),
  ('CORN_COB', 'Corn Cob LED Retrofit', 'Recognizing corn cob LED retrofit lamps', 'An LED lamp shaped like a corn cob with many small LED chips. Screws into existing HID socket. The fixture still looks like HID but contains an LED lamp.', 'If you see a corn cob lamp, the fixture has ALREADY been retrofitted to LED. Note the corn cob wattage, do not recommend further retrofit.', ARRAY['LED chips visible on lamp surface', 'Corn-cob shape', 'Fits in HID fixture body', 'Much brighter than original at same angle'])
ON CONFLICT DO NOTHING;
