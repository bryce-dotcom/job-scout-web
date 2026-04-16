require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cole reported "cannot find 100 watt relocate wall packs" — the existing
// SMBE multi-wattage entry (50W/60W/80W/100W Relocated, id=1444) does
// cover 100W but doesn't surface in a "100W relocate wall pack" search.
// Adding standalone single-wattage SKUs that match Cole's mental model.
//
// Pricing tiers from existing catalog:
//   Base AWP (id=1204):                    $181.14
//   SMBE branded AWP (id=1441):            $301.14
//   SMBE relocate (id=1444):               $508.64  (= +$207 over branded base)
//   Lift premium (~$120 from canopy line)
//
// Adding a 100W variant in each tier so the catalog is complete.

const sku = (extra = {}) => ({
  company_id: 3,
  type: 'Electrical',
  description: 'Parts & Labor\nAdjustable, Cut Off, Regular specify in the notes',
  active: true,
  dlc_listed: true,
  manufacturer: 'LEDOne',
  model_number: 'LOC-AWP-MW(100)MCCT(30/40/50)D',
  ...extra,
});

const newSkus = [
  sku({ name: '100W Wall Pack',                    unit_price: 181.14 }),
  sku({ name: '100W Wall Pack Relocate',           unit_price: 388.64 }),
  sku({ name: '100W Wall Pack w/ Lift',            unit_price: 231.14 }),
  sku({ name: '100W Wall Pack Relocate w/ Lift',   unit_price: 458.64 }),
  sku({ name: 'SBE 100W Wall Pack',                unit_price: 301.14 }),
  sku({ name: 'SBE 100W Wall Pack Relocate',       unit_price: 508.64 }),
  sku({ name: 'SBE 100W Wall Pack Relocate w/ Lift', unit_price: 623.00 }),
];

(async () => {
  // Skip any that already exist by name
  const names = newSkus.map(s => s.name);
  const existing = await supabase.from('products_services').select('name').eq('company_id', 3).in('name', names);
  const existingNames = new Set((existing.data || []).map(r => r.name));
  const toInsert = newSkus.filter(s => !existingNames.has(s.name));
  if (toInsert.length === 0) {
    console.log('All SKUs already exist. Nothing to insert.');
    return;
  }
  const { data, error } = await supabase.from('products_services').insert(toInsert).select('id, name, unit_price');
  if (error) { console.log('ERR:', error.message); return; }
  console.log('Inserted', data.length, 'SKUs:');
  data.forEach(p => console.log(' id=' + p.id, '|', p.name, '| $' + p.unit_price));
})();
