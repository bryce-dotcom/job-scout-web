// Walter's demo cleaning takeoff — the counted half of Eden Ridge.
//
// The sibling of walterDemoRegister.js, and here for the same reason: the seed
// script and the tests price the very same rows, so the demo on screen and the
// demo the suite pins cannot drift apart.
//
// Two things live here. DEMO_PRODUCTS is a window-cleaning price book for the
// DEMO tenant — Summit Field Co, company 25, which had thirteen products and
// not one of them glass, so a takeoff there priced every line at nothing.
// DEMO_TAKEOFF is the walk: what was counted, where, which side, how high.
//
// The product names are deliberately the ones HHH actually uses, down to the
// bracketed size bands and the trailing spaces they typed. The matcher scores
// NAMES, so a demo book with tidied-up names would exercise a matcher nobody
// has. The prices are theirs too, so the figures mean something to them.

/**
 * A window price book for the demo tenant.
 *
 * `type` is 'Window Cleaning' on every row because that, not the group name,
 * is what qualifies a product as glass work in HHH's real book — the add-on
 * services sit in a group called "Add on Services" with no glass word in it
 * and pass on their type alone.
 */
export const DEMO_PRODUCT_GROUPS = [
  { name: 'Residential Windows', service_type: 'Window Cleaning', sort_order: 1 },
  { name: 'Commercial Windows', service_type: 'Window Cleaning', sort_order: 2 },
  { name: 'Add on Services', service_type: 'Window Cleaning', sort_order: 3 },
]

export const DEMO_PRODUCTS = [
  // ── residential, the plain clean. Two products, not one doubled. ──────
  { group: 'Residential Windows', name: 'Residential Interior Windows', unit_price: 3, cost: 3 },
  { group: 'Residential Windows', name: 'Residential Exterior Windows', unit_price: 6, cost: 6 },
  { group: 'Residential Windows', name: 'Interior/Exterior Residential Window Cleaning', unit_price: 9, cost: 9 },
  // The membership twins. A tenth of the one-off price, told apart only by
  // the word in the name — there is no column that says which is which.
  { group: 'Residential Windows', name: 'Residential Interior Windows (Subscription)', unit_price: 0.12, cost: 0.12 },
  { group: 'Residential Windows', name: 'Residential Exterior Windows (Subscription)', unit_price: 0.17, cost: 0.17 },

  // ── post construction, priced three times by size ────────────────────
  // Not monotonic, and that is the tenant's own ladder: a 4ft pane is $6, a
  // bigger one is $4, and over 6ft jumps to $20 because it takes two people.
  { group: 'Residential Windows', name: 'Post Construction Window Cleaning (Less than 4ft wide/high)', unit_price: 6, cost: 6 },
  { group: 'Residential Windows', name: 'Post Construction Window Cleaning (More than 4ft wide/high)', unit_price: 4, cost: 4 },
  { group: 'Residential Windows', name: 'Post Construction Window Cleaning (More than 6ft wide/high', unit_price: 20, cost: 20 },
  { group: 'Residential Windows', name: 'Basic Tract Home Post Construction Window Cleaning', unit_price: 4, cost: 4 },

  // ── commercial, including the reach products ─────────────────────────
  { group: 'Commercial Windows', name: 'Commercial Interior Window Cleaning', unit_price: 2, cost: 2 },
  { group: 'Commercial Windows', name: 'Store Front/Commercial Exterior Window Cleaning', unit_price: 4, cost: 4 },
  { group: 'Commercial Windows', name: 'Interior/Exterior Cleaning of Commercial', unit_price: 7, cost: 7 },
  { group: 'Commercial Windows', name: 'Commercial Interior Ladder Windows', unit_price: 4, cost: 4 },
  { group: 'Commercial Windows', name: 'Commercial Exterior Ladder Windows', unit_price: 5, cost: 5 },
  { group: 'Commercial Windows', name: 'Exterior WaterFed windows above 2 stories', unit_price: 7, cost: 7 },
  { group: 'Commercial Windows', name: 'Partition Glass', unit_price: 3, cost: 3 },

  // ── what hangs off the glass ─────────────────────────────────────────
  { group: 'Add on Services', name: 'Screen Cleaning', unit_price: 1, cost: 1 },
  { group: 'Add on Services', name: 'Window Track Cleaning', unit_price: 5, cost: 5 },
  { group: 'Add on Services', name: 'Window Well Cleaning', unit_price: 7, cost: 7 },
  { group: 'Add on Services', name: 'Residential Hard Water Removal', unit_price: 2.5, cost: 2.5 },
  { group: 'Add on Services', name: 'Glass Protectant', unit_price: 3, cost: 3 },
  { group: 'Add on Services', name: 'Mirror Cleaning', unit_price: 3, cost: 3 },
  { group: 'Add on Services', name: 'Solar Panel Cleaning', unit_price: 8, cost: 8 },

  // ── the restoration trio, per damage zone ────────────────────────────
  { group: 'Residential Windows', name: 'Glass Restoration — Light Abrasion (L1)', unit_price: 225, cost: 15 },
  { group: 'Residential Windows', name: 'Glass Restoration — Deep or Edge (L2)', unit_price: 565, cost: 37 },
  { group: 'Residential Windows', name: 'Glass Restoration — Optical Finishing', unit_price: 80, cost: 7 },
]

/**
 * The walk at Eden Ridge — a new custom home, counted room by room.
 *
 * Condition is mixed on purpose, because that is the real shape of a
 * post-construction job: the elevations the trades worked off are covered in
 * stucco and adhesive and get the post-construction product, while the glass
 * that stayed masked only needs a wipe and gets the plain clean. Pricing the
 * whole house as post-construction is the commonest way one of these gets
 * overbid, and pricing none of it that way is how a crew loses a day.
 *
 * Nothing here records a pane count. The TYPE carries it: eighteen
 * double-hungs is thirty-six panes, the four large sheets in the great room
 * are four, and the French doors are fifteen lites a leaf.
 */
export const DEMO_TAKEOFF = [
  // The south elevation the masons worked off — residue everywhere.
  {
    area_name: 'Great room, south elevation', type_code: 'picture_large', units: 4,
    face: 'both', segment: 'residential', floor: 1, condition: 'post_construction',
    notes: 'Mortar splatter on all four. Scrape before anything wet.',
  },
  {
    area_name: 'Great room, upper band', type_code: 'picture', units: 6,
    face: 'out', segment: 'residential', floor: 2, condition: 'post_construction',
    notes: 'Reached off the scaffold while it is still standing.',
  },
  {
    area_name: 'Stairwell clerestory', type_code: 'clerestory', units: 3,
    face: 'in', segment: 'residential', floor: 1, reach_in: 228,
    condition: 'post_construction',
    notes: 'Nineteen feet above the landing inside. Ladder, not a pole.',
  },

  // The west and north elevations were masked and came out clean.
  {
    area_name: 'Bedrooms, west elevation', type_code: 'double_hung', units: 10,
    face: 'both', segment: 'residential', floor: 2, condition: 'maintenance',
    notes: 'Masked through the build. A wipe and the tracks.',
  },
  {
    area_name: 'Kitchen and dining', type_code: 'casement', units: 8,
    face: 'both', segment: 'residential', floor: 1, condition: 'maintenance',
  },
  {
    area_name: 'Kitchen garden window', type_code: 'garden', units: 1,
    face: 'both', segment: 'residential', floor: 1, condition: 'maintenance',
    notes: 'Five surfaces counting the roof.',
  },

  // The entry, which is four different products in one doorway.
  {
    area_name: 'Entry door', type_code: 'entry_door_full', units: 1,
    face: 'both', segment: 'residential', floor: 1, condition: 'post_construction',
  },
  {
    area_name: 'Entry sidelights', type_code: 'sidelight', units: 2,
    face: 'both', segment: 'residential', floor: 1, condition: 'post_construction',
  },
  {
    area_name: 'Entry transom', type_code: 'transom', units: 1,
    face: 'both', segment: 'residential', floor: 1, condition: 'post_construction',
  },

  // Divided lites — the one place the lite count runs the bid.
  {
    area_name: 'Study, French doors', type_code: 'french_door', units: 2,
    face: 'both', segment: 'residential', floor: 1, condition: 'maintenance',
    notes: 'True muntins. Fifteen lites a leaf, and every corner by hand.',
  },

  // Doors and their tracks.
  {
    area_name: 'Patio sliders', type_code: 'patio_slider_2', units: 2,
    face: 'both', segment: 'residential', floor: 1, condition: 'post_construction',
    notes: 'Tracks are full of grout. Charge them.',
  },

  // Below grade, where the wells are the dirtier half.
  {
    area_name: 'Basement, window wells', type_code: 'basement_hopper', units: 6,
    face: 'both', segment: 'residential', floor: 1, condition: 'post_construction',
    addons: [{ work: 'window_well', qty: 6 }],
    notes: 'Six wells full of construction debris.',
  },

  // Roof glass, which is two different jobs on the two sides.
  {
    area_name: 'Hall skylights', type_code: 'skylight', units: 3,
    face: 'in', segment: 'residential', floor: 1, reach_in: 132,
    condition: 'maintenance',
    notes: 'Inside only — the outside needs roof access and is quoted apart.',
  },

  // Hard water, already, on brand new glass.
  {
    area_name: 'Primary bath, shower', type_code: 'shower_enclosure', units: 3,
    face: 'both', segment: 'residential', floor: 2, condition: 'hard_water',
    notes: 'Builder ran the irrigation before the softener was in.',
  },
]

/**
 * The catalogue rows this walk needs.
 *
 * A mirror, and labelled as one: window_types in the database is the source,
 * seeded by 20261024163000_window_reference_data.sql. A unit test cannot reach
 * the database, so the pinned demo figures need the rows in JavaScript — and a
 * mirror that drifts is worse than no mirror at all.
 *
 * So the seed script checks these against the live table every time it runs
 * and REFUSES if any of them disagrees. That closes the loop: the test pins
 * the arithmetic, the migration owns the data, and the seed is the thing that
 * notices when the two have parted company.
 */
export const DEMO_TYPES = [
  { type_code: 'basement_hopper', type_name: 'Basement hopper, below grade', family: 'operable', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 32, typical_height_in: 16, size_band: 'under_4', screens_per_unit: 1, has_track: false },
  { type_code: 'casement', type_name: 'Casement', family: 'operable', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 24, typical_height_in: 48, size_band: 'under_4', screens_per_unit: 1, has_track: false },
  { type_code: 'clerestory', type_name: 'Clerestory', family: 'fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 48, typical_height_in: 18, size_band: 'under_4', screens_per_unit: 0, has_track: false },
  { type_code: 'double_hung', type_name: 'Double-hung', family: 'operable', panes_per_unit: 2, lites_per_unit: 2, bill_lites: false, typical_width_in: 32, typical_height_in: 60, size_band: 'over_4', screens_per_unit: 1, has_track: true },
  { type_code: 'entry_door_full', type_name: 'Entry door, full lite', family: 'door', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 34, typical_height_in: 76, size_band: 'over_6', screens_per_unit: 0, has_track: false },
  { type_code: 'french_door', type_name: 'French door, 15-lite', family: 'door', panes_per_unit: 1, lites_per_unit: 15, bill_lites: true, typical_width_in: 36, typical_height_in: 80, size_band: 'over_6', screens_per_unit: 0, has_track: false },
  { type_code: 'garden', type_name: 'Garden window', family: 'specialty', panes_per_unit: 5, lites_per_unit: 5, bill_lites: false, typical_width_in: 48, typical_height_in: 48, size_band: 'under_4', screens_per_unit: 0, has_track: true },
  { type_code: 'patio_slider_2', type_name: 'Patio slider, 2-panel', family: 'door', panes_per_unit: 2, lites_per_unit: 2, bill_lites: false, typical_width_in: 72, typical_height_in: 80, size_band: 'over_6', screens_per_unit: 1, has_track: true },
  { type_code: 'picture', type_name: 'Picture / fixed', family: 'fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 60, typical_height_in: 48, size_band: 'over_4', screens_per_unit: 0, has_track: false },
  { type_code: 'picture_large', type_name: 'Picture, large format', family: 'fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 96, typical_height_in: 72, size_band: 'over_6', screens_per_unit: 0, has_track: false },
  { type_code: 'shower_enclosure', type_name: 'Shower enclosure panel', family: 'specialty', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 28, typical_height_in: 72, size_band: 'over_4', screens_per_unit: 0, has_track: true },
  { type_code: 'sidelight', type_name: 'Sidelight', family: 'fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 14, typical_height_in: 72, size_band: 'over_4', screens_per_unit: 0, has_track: false },
  { type_code: 'skylight', type_name: 'Skylight', family: 'skylight', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 24, typical_height_in: 48, size_band: 'under_4', screens_per_unit: 0, has_track: false },
  { type_code: 'transom', type_name: 'Transom', family: 'fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 36, typical_height_in: 18, size_band: 'under_4', screens_per_unit: 0, has_track: false },
]

/** The takeoff with its company and assessment stamped on, ready to insert. */
export function expandTakeoff(companyId, assessmentId) {
  return DEMO_TAKEOFF.map((r, i) => ({
    ...r,
    company_id: companyId,
    assessment_id: assessmentId,
    sort_order: i + 1,
  }))
}
