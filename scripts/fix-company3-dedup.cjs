/**
 * fix-company3-dedup.cjs — Remove test data, unknown leads, and deduplicate
 *
 * Rules:
 * - Delete leads with "test", "teat test", "Test Test" names (none have quotes)
 * - Delete leads named "Unknown"
 * - For duplicate leads (same customer_name): keep the one with quote_id, delete others
 *   If none have quote_id, keep the one with customer_id, then oldest
 * - Delete test customers (but NOT "Frank Montestere" — that's a real name)
 * - For duplicate customers: keep the one referenced by most jobs/quotes/leads
 * - Remap any foreign keys from deleted dupes to the kept record
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 3

async function getAll(table, select = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(select).eq('company_id', CID).range(from, from + 999)
    if (error || !data || !data.length) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

async function deleteBatch(table, ids) {
  if (!ids.length) return 0
  let deleted = 0
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { error } = await sb.from(table).delete().in('id', batch)
    if (error) console.error('  Delete error ' + table + ':', error.message)
    else deleted += batch.length
  }
  return deleted
}

async function run() {
  console.log('═══ Dedup & Cleanup Company 3 ═══\n')

  const leads = await getAll('leads', 'id,customer_name,quote_id,customer_id,status,created_at')
  const customers = await getAll('customers', 'id,name,email')
  console.log('Starting: ' + leads.length + ' leads, ' + customers.length + ' customers')

  // ── STEP 1: Delete test leads ──────────────────────────────
  console.log('\n1. DELETING TEST LEADS')
  const testNames = ['test', 'test test', 'teat test']
  const testLeads = leads.filter(l => {
    const name = (l.customer_name || '').toLowerCase().trim()
    return testNames.includes(name)
  })
  console.log('  Test leads found: ' + testLeads.length)

  // First unlink any quotes/jobs pointing to these leads
  for (const l of testLeads) {
    await sb.from('quotes').update({ lead_id: null }).eq('lead_id', l.id)
    await sb.from('jobs').update({ lead_id: null }).eq('lead_id', l.id)
  }
  const testDeleted = await deleteBatch('leads', testLeads.map(l => l.id))
  console.log('  Deleted: ' + testDeleted)

  // ── STEP 2: Delete "Unknown" leads ─────────────────────────
  console.log('\n2. DELETING UNKNOWN LEADS')
  const unknownLeads = leads.filter(l => {
    const name = (l.customer_name || '').toLowerCase().trim()
    return name === 'unknown' || name === ''
  })
  // Only delete if they have no quote attached
  const safeUnknowns = unknownLeads.filter(l => !l.quote_id)
  console.log('  Unknown/empty leads: ' + unknownLeads.length + ' (safe to delete: ' + safeUnknowns.length + ')')

  for (const l of safeUnknowns) {
    await sb.from('quotes').update({ lead_id: null }).eq('lead_id', l.id)
    await sb.from('jobs').update({ lead_id: null }).eq('lead_id', l.id)
  }
  const unknownDeleted = await deleteBatch('leads', safeUnknowns.map(l => l.id))
  console.log('  Deleted: ' + unknownDeleted)

  // ── STEP 3: Deduplicate leads ──────────────────────────────
  console.log('\n3. DEDUPLICATING LEADS')

  // Refresh leads after deletions
  const freshLeads = await getAll('leads', 'id,customer_name,quote_id,customer_id,status,created_at')

  // Group by normalized customer_name
  const leadGroups = {}
  freshLeads.forEach(l => {
    const name = (l.customer_name || '').toLowerCase().trim()
    if (!name) return
    if (!leadGroups[name]) leadGroups[name] = []
    leadGroups[name].push(l)
  })

  const dupeGroups = Object.entries(leadGroups).filter(([, group]) => group.length > 1)
  console.log('  Duplicate name groups: ' + dupeGroups.length)

  const leadIdsToDelete = []
  let remapped = 0

  for (const [name, group] of dupeGroups) {
    // Sort: prefer leads with quote_id, then customer_id, then oldest
    group.sort((a, b) => {
      if (a.quote_id && !b.quote_id) return -1
      if (!a.quote_id && b.quote_id) return 1
      if (a.customer_id && !b.customer_id) return -1
      if (!a.customer_id && b.customer_id) return 1
      return new Date(a.created_at) - new Date(b.created_at) // oldest first
    })

    const keeper = group[0]
    const dupes = group.slice(1)

    for (const dupe of dupes) {
      // Remap any quotes pointing to dupe → keeper
      await sb.from('quotes').update({ lead_id: keeper.id }).eq('lead_id', dupe.id)
      // Remap any jobs pointing to dupe → keeper
      await sb.from('jobs').update({ lead_id: keeper.id }).eq('lead_id', dupe.id)

      // If dupe has quote_id or customer_id that keeper lacks, transfer them
      if (dupe.quote_id && !keeper.quote_id) {
        await sb.from('leads').update({ quote_id: dupe.quote_id, quote_generated: true }).eq('id', keeper.id)
        keeper.quote_id = dupe.quote_id
      }
      if (dupe.customer_id && !keeper.customer_id) {
        await sb.from('leads').update({ customer_id: dupe.customer_id }).eq('id', keeper.id)
        keeper.customer_id = dupe.customer_id
      }

      leadIdsToDelete.push(dupe.id)
      remapped++
    }
  }

  const dupeLeadsDeleted = await deleteBatch('leads', leadIdsToDelete)
  console.log('  Leads deduplicated: ' + dupeLeadsDeleted + ' removed, ' + remapped + ' remapped')

  // ── STEP 4: Delete test customers ──────────────────────────
  console.log('\n4. DELETING TEST CUSTOMERS')
  const testCustNames = ['test', 'test test', 'teat test']
  const testCustomers = customers.filter(c => {
    const name = (c.name || '').toLowerCase().trim()
    return testCustNames.includes(name)
  })
  console.log('  Test customers found: ' + testCustomers.length)

  // Unlink references first
  for (const c of testCustomers) {
    await sb.from('leads').update({ customer_id: null }).eq('customer_id', c.id)
    await sb.from('quotes').update({ customer_id: null }).eq('customer_id', c.id)
    await sb.from('jobs').update({ customer_id: null }).eq('customer_id', c.id)
    await sb.from('invoices').update({ customer_id: null }).eq('customer_id', c.id)
  }
  const testCustDeleted = await deleteBatch('customers', testCustomers.map(c => c.id))
  console.log('  Deleted: ' + testCustDeleted)

  // ── STEP 5: Deduplicate customers ──────────────────────────
  console.log('\n5. DEDUPLICATING CUSTOMERS')

  const freshCusts = await getAll('customers', 'id,name,email')

  // Count references for each customer to pick the best one
  const allQuotes = await getAll('quotes', 'customer_id')
  const allJobs = await getAll('jobs', 'customer_id')
  const allInvoices = await getAll('invoices', 'customer_id')
  const allLeadsNow = await getAll('leads', 'customer_id')

  const custRefCount = {}
  allQuotes.forEach(q => { if (q.customer_id) custRefCount[q.customer_id] = (custRefCount[q.customer_id] || 0) + 1 })
  allJobs.forEach(j => { if (j.customer_id) custRefCount[j.customer_id] = (custRefCount[j.customer_id] || 0) + 1 })
  allInvoices.forEach(i => { if (i.customer_id) custRefCount[i.customer_id] = (custRefCount[i.customer_id] || 0) + 1 })
  allLeadsNow.forEach(l => { if (l.customer_id) custRefCount[l.customer_id] = (custRefCount[l.customer_id] || 0) + 1 })

  // Group by normalized name
  const custGroups = {}
  freshCusts.forEach(c => {
    const name = (c.name || '').toLowerCase().trim()
    if (!name) return
    if (!custGroups[name]) custGroups[name] = []
    custGroups[name].push(c)
  })

  const custDupeGroups = Object.entries(custGroups).filter(([, g]) => g.length > 1)
  console.log('  Duplicate customer groups: ' + custDupeGroups.length)

  const custIdsToDelete = []

  for (const [name, group] of custDupeGroups) {
    // Sort by reference count (most referenced first), then by id (oldest)
    group.sort((a, b) => {
      const refsA = custRefCount[a.id] || 0
      const refsB = custRefCount[b.id] || 0
      if (refsA !== refsB) return refsB - refsA
      return a.id - b.id
    })

    const keeper = group[0]
    const dupes = group.slice(1)

    for (const dupe of dupes) {
      // Remap all references
      await sb.from('leads').update({ customer_id: keeper.id }).eq('customer_id', dupe.id).eq('company_id', CID)
      await sb.from('quotes').update({ customer_id: keeper.id }).eq('customer_id', dupe.id).eq('company_id', CID)
      await sb.from('jobs').update({ customer_id: keeper.id }).eq('customer_id', dupe.id).eq('company_id', CID)
      await sb.from('invoices').update({ customer_id: keeper.id }).eq('customer_id', dupe.id).eq('company_id', CID)
      await sb.from('payments').update({ customer_id: keeper.id }).eq('customer_id', dupe.id).eq('company_id', CID)
      custIdsToDelete.push(dupe.id)
    }
  }

  const custDupesDeleted = await deleteBatch('customers', custIdsToDelete)
  console.log('  Customers deduplicated: ' + custDupesDeleted + ' removed')

  // ── VERIFICATION ──────────────────────────────────────────
  console.log('\n═══ VERIFICATION ═══')
  const finalLeads = await getAll('leads', 'id,customer_name,quote_id')
  const finalCusts = await getAll('customers', 'id,name')
  console.log('Final leads: ' + finalLeads.length)
  console.log('Final customers: ' + finalCusts.length)

  // Check remaining dupes
  const finalNameCounts = {}
  finalLeads.forEach(l => { const n = (l.customer_name || '').toLowerCase().trim(); if (n) finalNameCounts[n] = (finalNameCounts[n] || 0) + 1 })
  const remaining = Object.entries(finalNameCounts).filter(([, c]) => c > 1)
  console.log('Remaining lead dupes: ' + remaining.length + ' (should be 0)')
  if (remaining.length > 0) remaining.slice(0, 5).forEach(([n, c]) => console.log('  "' + n + '": ' + c))

  const finalCustCounts = {}
  finalCusts.forEach(c => { const n = (c.name || '').toLowerCase().trim(); if (n) finalCustCounts[n] = (finalCustCounts[n] || 0) + 1 })
  const custRemaining = Object.entries(finalCustCounts).filter(([, c]) => c > 1)
  console.log('Remaining customer dupes: ' + custRemaining.length + ' (should be 0)')

  // Test data check
  const testRemaining = finalLeads.filter(l => {
    const n = (l.customer_name || '').toLowerCase().trim()
    return ['test', 'test test', 'teat test', 'unknown'].includes(n)
  })
  console.log('Remaining test/unknown leads: ' + testRemaining.length + ' (should be 0)')

  console.log('\n═══ DONE ═══')
}

run().catch(e => { console.error('FATAL:', e); process.exit(1) })
