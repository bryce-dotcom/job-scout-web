// Import Antonino Lawn Care customers + recurring jobs + service history
// from Zack's three Google Docs (saved as .txt in C:\Users\bwest\Downloads).
//
// Source of truth for customer list + price + mow day = "Second Coming"
// Service history line items = "Mowing Extras"
// Route ordering (informational) = "Days Of The Land"
//
// Usage:
//   node scripts/import-zack-customers.cjs --dry    # parse only, print plan
//   node scripts/import-zack-customers.cjs --apply  # actually insert
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const COMPANY_ID = 9 // Antonino lawn care
const DOWNLOADS = 'C:\\Users\\bwest\\Downloads'
const SECOND_COMING = path.join(DOWNLOADS, 'Second Coming .txt')
const MOWING_EXTRAS = path.join(DOWNLOADS, 'Mowing Extras .txt')

const APPLY = process.argv.includes('--apply')

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── Parse Second Coming → customers with price + mow_day ─────────────
function parseSecondComing() {
  const text = fs.readFileSync(SECOND_COMING, 'utf-8')
  const lines = text.split('\n')
  let currentDay = null
  const customers = []
  const dayMap = { MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday' }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw) continue
    const dayMatch = raw.match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY)$/i)
    if (dayMatch) {
      currentDay = dayMap[dayMatch[1].toUpperCase()]
      continue
    }
    if (!raw.startsWith('*')) continue
    if (!currentDay) continue
    // Example: "* Ted 249S aspen way vineyard $40"
    //          "* Wes $65 214 N. 600 W. Biweekly"
    //          "* Yanni 788 N 500 E, Spanish Fork UT 84660 $55 Biweekly"
    let body = raw.replace(/^\*\s*/, '').trim()
    if (!body) continue
    // Skip property-group headers like "Walker properties" — they appear after Thursday section
    if (/^(walker|travis)\s+propert/i.test(body)) continue
    // Extract price
    const priceMatch = body.match(/\$(\d+(?:\.\d+)?)/)
    const price = priceMatch ? parseFloat(priceMatch[1]) : null
    // Extract frequency
    const biweekly = /biweekly/i.test(body)
    // Strip price + biweekly + pay code (WP/MP/NP)
    let nameAddr = body
      .replace(/\$\d+(?:\.\d+)?/g, '')
      .replace(/\b(WP|MP|NP|Biweekly)\b/gi, '')
      .replace(/\bStarted\s+\d+\/\d+\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!nameAddr) continue
    // Heuristic: name is letters-and-spaces (with optional #N suffix like "Jessica #2"),
    // address starts at the first standalone digit (street number).
    const m = nameAddr.match(/^([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*)*(?:\s+#\d+)?)\s+(\d.*)$/)
    let name, address
    if (m) {
      name = m[1].trim()
      address = m[2].trim()
    } else {
      name = nameAddr
      address = null
    }
    if (!name) continue
    customers.push({
      name,
      address,
      price,
      mow_day: currentDay,
      frequency: biweekly ? 'biweekly' : 'weekly',
      raw: body,
    })
  }
  return customers
}

// ─── Parse Mowing Extras → per-customer service line items ────────────
function parseMowingExtras() {
  const text = fs.readFileSync(MOWING_EXTRAS, 'utf-8')
  const lines = text.split('\n')
  const blocks = [] // [{ customer, items: [{desc, amount, date}] }]
  let current = null
  for (const raw of lines) {
    const ln = raw.trim()
    if (!ln) {
      if (current && current.items.length === 0) current = null
      continue
    }
    // Bullet starting line — could be customer header OR service item
    const bulleted = ln.match(/^[\*\-]\s+(.*)$/) || ln.match(/^\d+\.\s+(.*)$/)
    if (!bulleted) continue
    const body = bulleted[1].trim()
    // Service items typically contain "$" and a date like 4/27 or 5/6
    const hasPrice = /\$\d/.test(body)
    const hasDate = /\b\d{1,2}\/\d{1,2}\b/.test(body)
    const looksLikeService = hasPrice || hasDate
    if (!current || !looksLikeService) {
      // It's a new customer block
      current = { customer: body, items: [] }
      blocks.push(current)
    } else {
      // Service line for the current customer
      const priceM = body.match(/\$(\d+(?:,\d{3})*(?:\.\d+)?)/)
      const dateM = body.match(/\b(\d{1,2}\/\d{1,2})\b/)
      const amount = priceM ? parseFloat(priceM[1].replace(/,/g, '')) : null
      const date = dateM ? dateM[1] : null
      current.items.push({ desc: body, amount, date })
    }
  }
  return blocks.filter(b => b.items.length > 0)
}

// ─── Main ─────────────────────────────────────────────────────────────
;(async () => {
  const customers = parseSecondComing()
  const extras = parseMowingExtras()

  console.log(`Parsed ${customers.length} customers from Second Coming`)
  console.log(`Parsed ${extras.length} customer service-history blocks from Mowing Extras`)
  console.log(`\nMow day breakdown:`)
  const byDay = {}
  for (const c of customers) byDay[c.mow_day] = (byDay[c.mow_day] || 0) + 1
  console.log(JSON.stringify(byDay, null, 2))

  console.log(`\nFirst 10 customers parsed:`)
  for (const c of customers.slice(0, 10)) console.log(`  ${c.mow_day.padEnd(10)} ${c.name.padEnd(30)} $${c.price || '?'} ${c.frequency} :: ${c.address || '(no addr)'}`)

  let totalServiceItems = 0
  for (const b of extras) totalServiceItems += b.items.length
  console.log(`\nTotal service-history line items: ${totalServiceItems}`)
  console.log(`First 3 service blocks:`)
  for (const b of extras.slice(0, 3)) {
    console.log(`  [${b.customer}]`)
    for (const it of b.items) console.log(`    - ${it.desc}`)
  }

  if (!APPLY) {
    console.log(`\n[DRY RUN] Pass --apply to actually insert.`)
    return
  }

  // ─── INSERT customers ──────────────────────────────────────────────
  console.log(`\n=== Inserting ${customers.length} customers into company ${COMPANY_ID} ===`)
  const customerRows = customers.map(c => ({
    company_id: COMPANY_ID,
    name: c.name,
    address: c.address,
    status: 'Active',
    preferred_contact: 'Phone',
    notes: `Imported from ALC docs. Mow day: ${c.mow_day}. Price: $${c.price || '?'} ${c.frequency}.`,
    source_system: 'alc_import',
    source_id: c.raw.slice(0, 80),
  }))
  const { data: insertedCustomers, error: custErr } = await s.from('customers').insert(customerRows).select('id,name')
  if (custErr) { console.error('Customer insert failed:', custErr); process.exit(1) }
  console.log(`  ✓ Inserted ${insertedCustomers.length} customers`)

  // Map name → customer_id for next step
  const nameToCustId = {}
  for (const c of insertedCustomers) nameToCustId[c.name.toLowerCase().trim()] = c.id

  // ─── INSERT recurring jobs ─────────────────────────────────────────
  const dayOfWeekIdx = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4 }
  // Pick the next occurrence of that weekday from today, anchored at 8am MT
  function nextWeekday(targetIdx) {
    const today = new Date()
    const dow = today.getDay() // 0=Sun
    let diff = (targetIdx - dow + 7) % 7
    if (diff === 0) diff = 7
    const d = new Date(today)
    d.setDate(d.getDate() + diff)
    d.setHours(8, 0, 0, 0)
    return d.toISOString()
  }
  const jobRows = []
  for (const c of customers) {
    const custId = nameToCustId[c.name.toLowerCase().trim()]
    if (!custId) continue
    jobRows.push({
      company_id: COMPANY_ID,
      job_id: `JOB-ALC-${custId}-${Date.now().toString(36).slice(-4)}`,
      customer_id: custId,
      job_title: `Mow — ${c.name}`,
      status: 'Chillin',
      start_date: nextWeekday(dayOfWeekIdx[c.mow_day]),
      job_address: c.address,
      job_total: c.price,
      service_type: 'Mowing',
      recurrence: c.frequency === 'biweekly' ? 'biweekly' : 'weekly',
      notes: `Recurring ${c.frequency} mow on ${c.mow_day}s. Imported from ALC docs.`,
      source_system: 'alc_import',
    })
  }
  const { data: insertedJobs, error: jobErr } = await s.from('jobs').insert(jobRows).select('id,job_title')
  if (jobErr) { console.error('Job insert failed:', jobErr); process.exit(1) }
  console.log(`  ✓ Inserted ${insertedJobs.length} recurring jobs`)

  // ─── INSERT historical service jobs from Mowing Extras ─────────────
  // Match each block to a customer by name fuzzy
  function findCustomerId(blockHeader) {
    const head = blockHeader.toLowerCase().replace(/\$\d+/, '').trim()
    // first word = likely first name
    const firstWord = head.split(/\s+/)[0]
    // try exact name first
    if (nameToCustId[head]) return nameToCustId[head]
    // try first word matches
    for (const [name, id] of Object.entries(nameToCustId)) {
      if (name.startsWith(firstWord)) return id
    }
    return null
  }
  const histRows = []
  let matched = 0, unmatched = 0
  for (const b of extras) {
    const cid = findCustomerId(b.customer)
    if (!cid) { unmatched++; continue }
    matched++
    for (const it of b.items) {
      if (!it.amount && !it.date) continue
      histRows.push({
        company_id: COMPANY_ID,
        job_id: `JOB-ALC-HIST-${cid}-${Math.random().toString(36).slice(2, 6)}`,
        customer_id: cid,
        job_title: it.desc.slice(0, 80),
        status: 'Completed',
        start_date: it.date ? `2026-${it.date.split('/').map(p => p.padStart(2, '0')).join('-')}T14:00:00+00:00` : null,
        job_total: it.amount,
        service_type: 'Service / Extra',
        notes: `Historical service from ALC docs: ${it.desc}`,
        source_system: 'alc_import',
        completed_at: it.date ? `2026-${it.date.split('/').map(p => p.padStart(2, '0')).join('-')}T20:00:00+00:00` : null,
      })
    }
  }
  console.log(`  Mowing-Extras matching: ${matched} matched, ${unmatched} unmatched`)
  if (histRows.length) {
    const { data: insertedHist, error: histErr } = await s.from('jobs').insert(histRows).select('id')
    if (histErr) { console.error('Historical-job insert failed:', histErr); process.exit(1) }
    console.log(`  ✓ Inserted ${insertedHist.length} historical service jobs`)
  }

  console.log(`\n✅ Done. ${customers.length} customers + recurring jobs + ${histRows.length} historical services seeded into company ${COMPANY_ID}.`)
})().catch(err => { console.error('FAILED:', err); process.exit(1) })
