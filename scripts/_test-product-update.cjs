// Simulate exactly what handleSaveProduct sends to update a product.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // Pick a real HHH product
  const p = (await s.from('products_services').select('*').eq('company_id', 3).eq('active', true).limit(1).single()).data
  console.log('Test product:', { id: p.id, name: p.name })

  // Replicate handleSaveProduct payload
  const payload = {
    company_id: 3,
    name: p.name,
    description: p.description || null,
    type: p.type || null,
    unit_price: p.unit_price || null,
    cost: p.cost || null,
    markup_percent: p.markup_percent || null,
    taxable: p.taxable,
    active: p.active,
    image_url: p.image_url || null,
    allotted_time_hours: p.allotted_time_hours || null,
    group_id: p.group_id,
    labor_rate_id: p.labor_rate_id || null,
    manufacturer: p.manufacturer || null,
    model_number: p.model_number || null,
    product_category: p.product_category || null,
    dlc_listed: p.dlc_listed,
    dlc_listing_number: p.dlc_listing_number || null,
    warranty_years: p.warranty_years || null,
    spec_sheet_url: p.spec_sheet_url || null,
    install_guide_url: p.install_guide_url || null,
    dlc_document_url: p.dlc_document_url || null,
    datasheet_json: p.datasheet_json || {},
    in_utility_scope: !!p.in_utility_scope,
    floor_price: p.floor_price === '' ? null : p.floor_price,
    ceiling_price: p.ceiling_price === '' ? null : p.ceiling_price,
    suggest_in_lenard: !!p.suggest_in_lenard,
    updated_at: new Date().toISOString(),
  }
  const r = await s.from('products_services').update(payload).eq('id', p.id).eq('company_id', 3)
  console.log('Update result:', { error: r.error, status: r.status })
})()
