const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'

async function hcpGet(path) {
  const res = await fetch(BASE + path, {
    headers: { 'Authorization': 'Token ' + KEY, 'Accept': 'application/json' }
  })
  return res.json()
}

async function run() {
  // 1. Get JobScout price book
  const { data: products, error } = await sb.from('products_services').select('*').eq('company_id', 3).order('name')
  if (error) { console.log('DB Error:', error); return }
  console.log('Loaded', products.length, 'products from JobScout')

  const smbe = products.filter(p => p.name.startsWith('SMBE') || p.name.startsWith('SBE'))
  const hasT = products.filter(p => /T[58]/.test(p.name))
  const other = products.filter(p => !p.name.startsWith('SMBE') && !p.name.startsWith('SBE') && !/T[58]/.test(p.name))

  console.log('=== JOBSCOUT PRICE BOOK ===')
  console.log('SMBE/SBE fixtures:', smbe.length)
  console.log('T8/T5 tubes:', hasT.length)
  console.log('Other:', other.length)
  console.log('Total:', products.length)

  console.log('\n=== SMBE/SBE FIXTURES ===')
  smbe.forEach(p => console.log('  ' + p.name + ' | cost: $' + (p.cost || 0)))

  console.log('\n=== OTHER ===')
  other.forEach(p => console.log('  ' + p.name + ' | type: ' + p.type + ' | cost: $' + (p.cost || 0)))

  // 2. Collect ALL unique HCP line item names from a bigger sample
  const hcpNames = new Map() // name -> { count, avgPrice, avgCost }

  // Sample 200 invoices for line item names
  for (let p = 1; p <= 5; p++) {
    const data = await hcpGet('/invoices?page=' + p + '&page_size=200')
    for (const inv of data.invoices) {
      for (const item of (inv.items || [])) {
        const entry = hcpNames.get(item.name) || { count: 0, totalPrice: 0, totalCost: 0 }
        entry.count++
        entry.totalPrice += item.unit_price || 0
        entry.totalCost += item.unit_cost || 0
        hcpNames.set(item.name, entry)
      }
    }
  }

  console.log('\n=== HCP LINE ITEM NAMES (from 1000 invoices) ===')
  const sorted = Array.from(hcpNames.entries()).sort((a, b) => b[1].count - a[1].count)
  for (const [name, info] of sorted) {
    const avgPrice = (info.totalPrice / info.count / 100).toFixed(2)
    const avgCost = (info.totalCost / info.count / 100).toFixed(2)

    // Try to match to price book
    const exactMatch = products.find(p => p.name === name)
    const partialMatch = !exactMatch ? products.find(p => {
      return name.indexOf(p.name) >= 0 || p.name.indexOf(name) >= 0
    }) : null

    const matchLabel = exactMatch ? ' ✓ EXACT' : (partialMatch ? ' ~ PARTIAL(' + partialMatch.name + ')' : ' ✗ NO MATCH')
    console.log('  [' + info.count + 'x] ' + name + ' | avgPrice: $' + avgPrice + ' | avgCost: $' + avgCost + matchLabel)
  }

  // Summary
  let matched = 0, unmatched = 0
  for (const [name] of sorted) {
    const found = products.find(p => p.name === name || name.indexOf(p.name) >= 0 || p.name.indexOf(name) >= 0)
    if (found) matched++
    else unmatched++
  }
  console.log('\n=== MATCH SUMMARY ===')
  console.log('Matched:', matched, '/', sorted.length)
  console.log('Unmatched:', unmatched, '/', sorted.length)
}

run().catch(console.error)
