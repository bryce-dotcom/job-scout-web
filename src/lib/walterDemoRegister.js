// The demo glass review, as data.
//
// Imported by two things that must not disagree: scripts/seed-walter-demo.mjs,
// which writes it into the demo company, and walterRows.test.js, which prices
// it and pins what the screen should show. Keeping the register in one place
// means the test is testing the thing that actually gets seeded.
//
// Deliberately free of imports, so a plain `node` script can read it.
//
// Modelled on the only worked example anyone here has — the AGR bid
// transcribed in WALTER_AGR_FACTS.md — but it is NOT that job. The building is
// renamed, and the money comes from the engine's own documented seeds plus
// this company's crew cost, never from AGR's price list.

/**
 * One entry per real MARK. `dupes` is how many EXTRA photographs of the same
 * mark were logged; each becomes its own row carrying duplicate_of.
 *
 * That is the register's whole point: 68 rows that are really 23 marks. AGR's
 * own register had exactly this problem, and bidding the 68 would have roughly
 * tripled the tech days. A register that quietly dropped its duplicates could
 * never show a customer why.
 *
 * Five marks carry a reason they will not be touched. Roughly a quarter of
 * what gets reported on a job like this turns out to be the manufacturer's
 * rather than the trades', which is a warranty claim and not a bid line.
 */
export const DEMO_REGISTER = [
  { code: 'A01', location: 'Great room, south elevation', lite_id: 'GR-1', face: 'out', severity: 'L0', edge: false, dupes: 3 },
  { code: 'A02', location: 'Great room, south elevation', lite_id: 'GR-2', face: 'out', severity: 'L0', edge: false, dupes: 2 },
  { code: 'A03', location: 'Dining, west elevation',      lite_id: 'DN-1', face: 'out', severity: 'L0', edge: false, dupes: 1 },
  { code: 'A04', location: 'Kitchen, south elevation',    lite_id: 'KT-1', face: 'in',  severity: 'L0', edge: false, dupes: 2 },
  { code: 'A05', location: 'Great room, south elevation', lite_id: 'GR-1', face: 'out', severity: 'L1', edge: false, dupes: 3 },
  { code: 'A06', location: 'Great room, south elevation', lite_id: 'GR-2', face: 'out', severity: 'L1', edge: false, dupes: 2 },
  { code: 'A07', location: 'Great room, south elevation', lite_id: 'GR-3', face: 'out', severity: 'L1', edge: false, dupes: 2 },
  { code: 'A08', location: 'Dining, west elevation',      lite_id: 'DN-1', face: 'out', severity: 'L1', edge: false, dupes: 1 },
  { code: 'A09', location: 'Dining, west elevation',      lite_id: 'DN-2', face: 'in',  severity: 'L1', edge: false, dupes: 2 },
  { code: 'A10', location: 'Primary suite, east',         lite_id: 'PS-1', face: 'out', severity: 'L1', edge: false, dupes: 3 },
  { code: 'A11', location: 'Primary suite, east',         lite_id: 'PS-2', face: 'out', severity: 'L1', edge: false, dupes: 2 },
  { code: 'A12', location: 'Stairwell, north',            lite_id: 'ST-1', face: 'out', severity: 'L1', edge: false, dupes: 1 },
  { code: 'A13', location: 'Great room, south elevation', lite_id: 'GR-3', face: 'out', severity: 'L2', edge: true,  dupes: 3 },
  { code: 'A14', location: 'Great room, south elevation', lite_id: 'GR-4', face: 'out', severity: 'L2', edge: false, dupes: 2 },
  { code: 'A15', location: 'Dining, west elevation',      lite_id: 'DN-2', face: 'out', severity: 'L2', edge: true,  dupes: 2 },
  { code: 'A16', location: 'Primary suite, east',         lite_id: 'PS-3', face: 'in',  severity: 'L2', edge: false, dupes: 1 },
  { code: 'A17', location: 'Stairwell, north',            lite_id: 'ST-2', face: 'out', severity: 'L2', edge: true,  dupes: 2 },
  { code: 'A18', location: 'Kitchen, south elevation',    lite_id: 'KT-2', face: 'out', severity: 'L2', edge: false, dupes: 3 },
  { code: 'A19', location: 'Primary suite, east',         lite_id: 'PS-1', face: 'in',  severity: 'L2', edge: false, dupes: 1, not_restorable_reason: 'coated_surface' },
  { code: 'A20', location: 'Kitchen, south elevation',    lite_id: 'KT-1', face: 'in',  severity: 'L1', edge: false, dupes: 2, not_restorable_reason: 'factory_defect' },
  { code: 'A21', location: 'Stairwell, north',            lite_id: 'ST-1', face: 'in',  severity: 'L1', edge: false, dupes: 2, not_restorable_reason: 'factory_defect' },
  { code: 'A22', location: 'Dining, west elevation',      lite_id: 'DN-1', face: 'in',  severity: 'L2', edge: false, dupes: 2, not_restorable_reason: 'factory_defect' },
  { code: 'A23', location: 'Great room, south elevation', lite_id: 'GR-4', face: 'out', severity: 'L2', edge: false, dupes: 1, not_restorable_reason: 'through_crack' },
]

const PRICE_NOTE = {
  L0: 'Try cleaning first — this may be residue, not a scratch',
  L1: 'Light abrasion; single resurfacing pass',
  L2: 'Deep, or close to an edge — slower and riskier',
}

/**
 * The register as glass_damage_items rows, duplicates expanded.
 *
 * Returns rows WITHOUT company_id or assessment_id — the caller owns those,
 * because only it knows which tenant and which assessment this is for.
 */
export function expandRegister(register = DEMO_REGISTER) {
  const out = []
  for (const m of register) {
    const base = {
      location: m.location,
      lite_id: m.lite_id,
      face: m.face,
      severity: m.severity,
      edge: !!m.edge,
      not_restorable_reason: m.not_restorable_reason || null,
    }
    out.push({
      ...base,
      code: m.code,
      duplicate_of: null,
      price_note: m.not_restorable_reason ? 'Excluded — see reason' : PRICE_NOTE[m.severity],
    })
    for (let i = 0; i < (m.dupes || 0); i++) {
      out.push({
        ...base,
        code: `${m.code}-${String.fromCharCode(98 + i)}`,
        duplicate_of: m.code,
        price_note: `Another angle on ${m.code}`,
      })
    }
  }
  return out
}

/**
 * The assessment the register belongs to, without a company_id.
 *
 * `pricing` carries only what a company knows about itself — what its own
 * crew costs per hour. Everything else falls through to the engine's
 * documented seeds, so the demo shows the product's defaults.
 */
export const DEMO_ASSESSMENT = {
  site_name: 'Eden Ridge — post-construction glass review',
  address: '1420 Eden Ridge Dr',
  city: 'Huntsville',
  state: 'UT',
  zip: '84317',
  vertical: 'both',
  status: 'draft',
  // AGR excluded lift and scaffold; a ladder is what this one actually takes.
  access: 'ladder',
  condition: 'post_construction',
  glass_make: 'Sierra Pacific',
  glass_product: 'Cardinal LoE³-366',
  // i89 and Neat are on the room side and cannot be abraded.
  coatings: ['i89', 'Neat'],
  panes: 180,
  faces: 2,
  tracks: 60,
  screens: 0,
  pricing: { crew_cost_per_hour: 30 },
  replacement_cost_low: 45000,
  replacement_cost_high: 110000,
  notes:
    'Builder reported scratches across the south and west glass after stucco. ' +
    '23 marks found, photographed from several angles. Coatings on the room ' +
    'side cannot be abraded; a handful of marks look like factory defects and ' +
    'belong in a warranty claim, not this bid.',
}
