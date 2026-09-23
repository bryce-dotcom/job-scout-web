// Does the dated AR agree with the AR every other screen shows today?
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { arAsOf, totalCustomerAR, totalUtilityAR, paymentsByInvoiceIndex } from '../src/lib/arHelpers.js'
import { calendarDay } from '../src/lib/localDate.js'
import { getWeekRange } from '../src/lib/eosWeek.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t) {
  let out = [], from = 0
  for (;;) { const { data, error } = await sb.from(t).select('*').eq('company_id', C).order('id').range(from, from + 999); if (error) { console.log('ERR', error.message); break } out = out.concat(data || []); if (!data || data.length < 1000) break; from += 1000 }
  return out
}
const [invoices, payments, utilityInvoices] = await Promise.all([page('invoices'), page('payments'), page('utility_invoices')])
const idx = paymentsByInvoiceIndex(payments)
const liveCustomer = totalCustomerAR(invoices, idx)
const liveUtility = totalUtilityAR(utilityInvoices, invoices)
const today = calendarDay(new Date())
const asOfToday = arAsOf(today, { invoices, utilityInvoices, payments })
const money = n => '$' + Math.round(n).toLocaleString()
console.log('TODAY', today)
console.log('  live  (Books / Dashboard / Frankie):', money(liveCustomer), 'customer +', money(liveUtility), 'utility =', money(liveCustomer + liveUtility))
console.log('  arAsOf(today)                      :', money(asOfToday.customer), 'customer +', money(asOfToday.utility), 'utility =', money(asOfToday.total))
const gap = asOfToday.total - (liveCustomer + liveUtility)
console.log('  difference:', money(gap), Math.abs(gap) < 1 ? 'MATCH' : '<-- investigate')

console.log('\nAR at the end of each of the last 8 weeks:')
let prev = null
for (let w = 8; w >= 1; w--) {
  const r = getWeekRange(w)
  const v = arAsOf(r.endDate, { invoices, utilityInvoices, payments })
  const delta = prev == null ? '' : ` (${v.total - prev >= 0 ? '+' : ''}${money(v.total - prev)})`
  console.log(`  wk ending ${r.endDate}: ${money(v.total).padStart(10)}  = ${money(v.customer)} customer + ${money(v.utility)} utility${delta}`)
  prev = v.total
}
