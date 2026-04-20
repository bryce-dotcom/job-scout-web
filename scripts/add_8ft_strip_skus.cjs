require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cole reported "Nigggg i cant find 8fts" on estimate 4208 (Green River Merc)
// where he typed a line item "8ft @ 90 watt with control" × 58. The catalog
// only has 8ft *lamps* (bulbs), not 8ft fixtures. Adding 8ft LED strip
// fixture SKUs scaled from the existing 4ft pricing tiers.
//
// Reference 4ft pricing (same 60W/70W/90W class, LEDONE branded):
//   LEDONE Strip Light 48W/68W/90W   $173.04
//   LEDONE Strip Light 60W/70W/80W   $140.00
//   Foldable Linear Highbay 70W/90W/110W w/ Control    $252.14
//   Foldable Linear Highbay 70W/90W/110W Adj CCT Relocated  $522.14
//   LIFT Foldable Linear Highbay 70W/90W/110W Adj CCT  $462.14
//
// Scaling 4ft → 8ft: typically ~1.8× fixture + flat adders for control
// ($60), relocate ($200), lift ($100). Prices flagged TBD in the
// description so admins confirm before sending a proposal.
//
// Naming matches the existing LEDONE Strip Light convention so search
// for "8ft" / "strip" / "90W" / "control" all surface these rows.

const base = {
  company_id: 3,
  type: 'Electrical',
  description: 'Parts & Labor · 8ft LED strip fixture · Adjustable, Cut Off, Regular specify in notes · PRICING TBD — confirm before sending proposal',
  active: true,
  dlc_listed: true,
  manufacturer: 'LEDOne',
  model_number: 'LOC-STR-8FT-MW(90)',
};

// Flat adders over base 8ft strip light
const BASE_PRICE = 285.00;   // ~1.9× 4ft LEDONE Strip Light 60W/70W/80W
const CONTROL_ADDER = 62.50; // same delta as highbay with/without control
const RELOCATE_ADDER = 200;
const LIFT_ADDER = 100;

const sku = (name, price) => ({ ...base, name, unit_price: price });

const newSkus = [
  sku('LEDONE 8ft Strip Light 60W/70W/90W',                                 BASE_PRICE),
  sku('LEDONE 8ft Strip Light 60W/70W/90W w/ Control',                      BASE_PRICE + CONTROL_ADDER),
  sku('LEDONE 8ft Strip Light 60W/70W/90W Relocate',                        BASE_PRICE + RELOCATE_ADDER),
  sku('LEDONE 8ft Strip Light 60W/70W/90W Relocate w/ Control',             BASE_PRICE + RELOCATE_ADDER + CONTROL_ADDER),
  sku('LEDONE 8ft Strip Light 60W/70W/90W w/ Lift',                         BASE_PRICE + LIFT_ADDER),
  sku('LEDONE 8ft Strip Light 60W/70W/90W w/ Lift & Control',               BASE_PRICE + LIFT_ADDER + CONTROL_ADDER),
  sku('LEDONE 8ft Strip Light 60W/70W/90W Relocate w/ Lift',                BASE_PRICE + RELOCATE_ADDER + LIFT_ADDER),
  sku('LEDONE 8ft Strip Light 60W/70W/90W Relocate w/ Lift & Control',      BASE_PRICE + RELOCATE_ADDER + LIFT_ADDER + CONTROL_ADDER),
];

(async () => {
  const names = newSkus.map(s => s.name);
  const existing = await supabase.from('products_services').select('name').eq('company_id', 3).in('name', names);
  const existingNames = new Set((existing.data || []).map(r => r.name));
  const toInsert = newSkus.filter(s => !existingNames.has(s.name));
  if (toInsert.length === 0) {
    console.log('All 8ft strip SKUs already exist. Nothing to insert.');
    return;
  }
  const { data, error } = await supabase.from('products_services').insert(toInsert).select('id, name, unit_price');
  if (error) { console.log('ERR:', error.message); return; }
  console.log('Inserted', data.length, '8ft strip SKUs:');
  data.forEach(p => console.log(' id=' + p.id, '|', p.name, '| $' + p.unit_price));
})();
