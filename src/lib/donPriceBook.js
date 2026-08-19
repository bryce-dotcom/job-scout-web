// Seed price-book packs, one per vertical toggle.
//
// Turning on a vertical in Don's settings installs its pack into dig_rates.
// These are STARTING NUMBERS, deliberately round, meant to be edited on day
// one — every market prices dirt differently and a price book you didn't
// write is a price book you don't trust. The point is that nobody lands in an
// empty app and has to invent thirty rows before their first bid.
//
// unit_price is what the customer pays; cost is what it costs us. kind feeds
// resolveMatLabSplit downstream, so anything bought by the ton is 'materials'
// and anything done by a machine is 'labor'.

export const VERTICALS = {
  trenching:     { label: 'Utility trenching', blurb: 'Water, sewer, storm, electric, gas', icon: 'Waves' },
  sitework:      { label: 'Site work & grading', blurb: 'Mass excavation, cut/fill, pads, road base', icon: 'Mountain' },
  foundation:    { label: 'Foundation & septic', blurb: 'Footings, basements, tanks, leach fields, driveways', icon: 'Home' },
  demolition:    { label: 'Demolition', blurb: 'Structure demo, concrete removal, haul-off', icon: 'Hammer' },
  land_clearing: { label: 'Land clearing', blurb: 'Clear & grub, stumps, brush', icon: 'Trees' },
}

export const PRICE_BOOK_PACKS = {
  trenching: [
    { code: 'TR-100', label: 'Trench excavation',        work_type: 'trench',      uom: 'LF',   unit_price: 28,   cost: 18,   kind: 'labor',     equipment: 'ex_160', min_charge: 950 },
    { code: 'TR-110', label: 'Rock trenching (adder)',   work_type: 'trench',      uom: 'CY',   unit_price: 145,  cost: 95,   kind: 'labor',     equipment: 'ex_320' },
    { code: 'TR-200', label: 'Pipe bedding — sand',      work_type: 'bedding',     uom: 'TON',  unit_price: 32,   cost: 23,   kind: 'materials' },
    { code: 'TR-300', label: 'Backfill & compact',       work_type: 'backfill',    uom: 'CY',   unit_price: 14,   cost: 9,    kind: 'labor',     equipment: 'skid_steer' },
    { code: 'TR-400', label: 'Haul off spoil',           work_type: 'haul_off',    uom: 'LOAD', unit_price: 275,  cost: 205,  kind: 'labor' },
    { code: 'TR-500', label: 'Trench box / shoring',     work_type: 'trench',      uom: 'DAY',  unit_price: 385,  cost: 250,  kind: 'labor' },
    { code: 'TR-600', label: 'Compaction testing',       work_type: 'backfill',    uom: 'EA',   unit_price: 195,  cost: 145,  kind: 'materials' },
    { code: 'TR-700', label: 'Private utility locate',   work_type: 'trench',      uom: 'EA',   unit_price: 450,  cost: 325,  kind: 'materials' },
  ],
  sitework: [
    { code: 'SW-100', label: 'Strip & stockpile topsoil', work_type: 'strip_topsoil', uom: 'CY',  unit_price: 6.5,  cost: 4.2,  kind: 'labor',     equipment: 'dozer_d6' },
    { code: 'SW-200', label: 'Mass excavation',           work_type: 'mass_ex',     uom: 'CY',   unit_price: 9.5,  cost: 6.2,  kind: 'labor',     equipment: 'ex_320' },
    { code: 'SW-210', label: 'Over-excavate unsuitable',  work_type: 'overex',      uom: 'CY',   unit_price: 12,   cost: 8,    kind: 'labor',     equipment: 'ex_320' },
    { code: 'SW-300', label: 'Import structural fill',    work_type: 'import_fill', uom: 'TON',  unit_price: 26,   cost: 19,   kind: 'materials' },
    { code: 'SW-400', label: 'Road base — placed',        work_type: 'road_base',   uom: 'TON',  unit_price: 34,   cost: 25,   kind: 'materials' },
    { code: 'SW-500', label: 'Fine grade',                work_type: 'fine_grade',  uom: 'SF',   unit_price: 0.35, cost: 0.22, kind: 'labor',     equipment: 'skid_steer' },
    { code: 'SW-600', label: 'Haul off',                  work_type: 'haul_off',    uom: 'LOAD', unit_price: 275,  cost: 205,  kind: 'labor' },
    { code: 'SW-700', label: 'Detention basin excavation',work_type: 'basin',       uom: 'CY',   unit_price: 10.5, cost: 7,    kind: 'labor',     equipment: 'ex_320' },
    { code: 'SW-800', label: 'Silt fence',                work_type: 'fine_grade',  uom: 'LF',   unit_price: 3.25, cost: 2.1,  kind: 'materials' },
  ],
  foundation: [
    { code: 'FD-100', label: 'Footing excavation',      work_type: 'footing',     uom: 'CY',   unit_price: 16,   cost: 10.5, kind: 'labor',     equipment: 'backhoe', min_charge: 850 },
    { code: 'FD-200', label: 'Basement excavation',     work_type: 'basement',    uom: 'CY',   unit_price: 12,   cost: 8,    kind: 'labor',     equipment: 'ex_160' },
    { code: 'FD-300', label: 'Septic tank excavation',  work_type: 'septic_tank', uom: 'EA',   unit_price: 1250, cost: 820,  kind: 'labor',     equipment: 'ex_160' },
    { code: 'FD-400', label: 'Leach field trenching',   work_type: 'leach_field', uom: 'LF',   unit_price: 22,   cost: 14,   kind: 'labor',     equipment: 'mini_ex' },
    { code: 'FD-500', label: 'Drain rock',              work_type: 'bedding',     uom: 'TON',  unit_price: 38,   cost: 28,   kind: 'materials' },
    { code: 'FD-600', label: 'Backfill & compact',      work_type: 'backfill',    uom: 'CY',   unit_price: 14,   cost: 9,    kind: 'labor',     equipment: 'skid_steer' },
    { code: 'FD-700', label: 'Driveway base — placed',  work_type: 'road_base',   uom: 'TON',  unit_price: 34,   cost: 25,   kind: 'materials' },
    { code: 'FD-800', label: 'Haul off',                work_type: 'haul_off',    uom: 'LOAD', unit_price: 275,  cost: 205,  kind: 'labor' },
  ],
  demolition: [
    { code: 'DM-100', label: 'Structure demolition',    work_type: 'mass_ex',     uom: 'SF',   unit_price: 6.5,  cost: 4.4,  kind: 'labor',     equipment: 'ex_320' },
    { code: 'DM-200', label: 'Concrete removal',        work_type: 'mass_ex',     uom: 'CY',   unit_price: 68,   cost: 46,   kind: 'labor',     equipment: 'ex_320' },
    { code: 'DM-300', label: 'Debris haul-off',         work_type: 'haul_off',    uom: 'LOAD', unit_price: 425,  cost: 310,  kind: 'labor' },
    { code: 'DM-400', label: 'Tipping fee',             work_type: 'haul_off',    uom: 'TON',  unit_price: 68,   cost: 55,   kind: 'materials' },
  ],
  land_clearing: [
    { code: 'LC-100', label: 'Clear & grub',            work_type: 'strip_topsoil', uom: 'SF', unit_price: 0.28, cost: 0.18, kind: 'labor',     equipment: 'dozer_d6' },
    { code: 'LC-200', label: 'Stump removal',           work_type: 'mass_ex',     uom: 'EA',   unit_price: 285,  cost: 190,  kind: 'labor',     equipment: 'ex_160' },
    { code: 'LC-300', label: 'Brush haul-off',          work_type: 'haul_off',    uom: 'LOAD', unit_price: 350,  cost: 255,  kind: 'labor' },
  ],
}

export const DEFAULT_VERTICALS = {
  trenching: true,
  sitework: true,
  foundation: true,
  demolition: false,
  land_clearing: false,
}

// Rows for the packs a company has turned on but not yet seeded.
export function packRowsFor(verticals, alreadySeeded = {}, companyId) {
  const rows = []
  Object.entries(verticals || {}).forEach(([key, on]) => {
    if (!on || alreadySeeded[key]) return
    ;(PRICE_BOOK_PACKS[key] || []).forEach((r, i) => {
      rows.push({ ...r, company_id: companyId, vertical: key, active: true, sort_order: i })
    })
  })
  return rows
}
