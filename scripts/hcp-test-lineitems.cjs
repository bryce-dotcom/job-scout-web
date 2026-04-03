const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'

async function run() {
  // Get a sample job
  const res1 = await fetch(BASE + '/jobs?page=1&page_size=3', {
    headers: { 'Authorization': 'Token ' + KEY, 'Accept': 'application/json' }
  })
  const data = await res1.json()

  for (const job of data.jobs) {
    console.log('\nJob:', job.id, '|', job.invoice_number, '|', job.work_status)
    console.log('  Keys with "line" or "item":', Object.keys(job).filter(k => k.includes('line') || k.includes('item')))

    // Check if line items are embedded in job object
    if (job.line_items) {
      console.log('  EMBEDDED line_items:', JSON.stringify(job.line_items).slice(0, 300))
    }

    // Try the line_items endpoint
    const res2 = await fetch(BASE + '/jobs/' + job.id + '/line_items', {
      headers: { 'Authorization': 'Token ' + KEY, 'Accept': 'application/json' }
    })
    console.log('  /line_items status:', res2.status)
    const text = await res2.text()
    console.log('  /line_items response:', text.slice(0, 500))
  }

  // Also check an invoice to see embedded items
  const invRes = await fetch(BASE + '/invoices?page=1&page_size=1', {
    headers: { 'Authorization': 'Token ' + KEY, 'Accept': 'application/json' }
  })
  const invData = await invRes.json()
  const inv = invData.invoices[0]
  console.log('\n\nInvoice:', inv.id, '|', inv.status)
  console.log('  Has items?', (inv.items || []).length)
  if (inv.items && inv.items[0]) {
    console.log('  First item:', JSON.stringify(inv.items[0]))
  }
}

run().catch(console.error)
