// THE RECEIPT (Bryce, 2026-10-21: "how do we fix it so we dont have to keep
// taking the team down a rabbit hole"). One line under every reply, written
// HERE from the tool calls the turn actually made — never by the model — so a
// person can see at a glance whether "you have 17 leads in Negotiation" came
// from a lookup or from nowhere.
//
// It is also his memory of what he did. The app saves the line with the reply
// (behind RECEIPT_MARK) and sends it back as history, so on the next turn an
// earlier answer that says "No lookups" reads as unverified to him too. Cole's
// invented lead list was emailed a turn later because nothing in the history
// said it had never been looked up.

/** Marks the receipt inside a saved reply. The model's own text is stripped of these brackets. */
export const RECEIPT_MARK = '⟦receipt⟧'

const WORDS: Record<string, string> = {
  query_jobs: 'jobs', query_leads: 'leads', query_customers: 'customers', query_invoices: 'invoices',
  query_payments: 'payments', query_revenue: 'revenue', query_quotes: 'estimates', query_closed: 'closed deals',
  query_products: 'price book', query_lighting_products: 'lighting products', query_lighting_swap: 'lighting playbook',
  query_inventory: 'inventory', query_expenses: 'expenses', query_appointments: 'appointments',
  query_employees: 'employees', query_crew: 'crew', query_time_clock: 'time clock', query_payroll: 'payroll',
  query_my_pay: 'your pay', query_purchase_orders: 'purchase orders', query_eos: 'EOS', query_account: 'account',
  query_daily_brief: 'daily brief', query_jobscout_refresh: 'JobScout refresh', query_rep_goals: 'rep goals',
  query_past_fixes: 'past fixes', where_i_am: 'your location', analyse_fixture_photo: 'the photo',
  query_material_receipts: 'material receipts', query_inbox: 'inbox',
}
const CARD_TOOLS = new Set(['propose_change', 'propose_record_change', 'propose_bulk_change', 'propose_create', 'set_rep_goals'])

/** How many rows a lookup came back with, when it says. */
function countOf(result: any): number | null {
  if (!result || typeof result !== 'object') return null
  for (const k of ['total_jobs', 'found', 'count', 'total', 'totalPayments', 'total_count', 'receipts']) {
    const v = result[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  for (const k of ['rows', 'leads', 'jobs', 'results', 'items', 'products', 'deals', 'invoices']) {
    if (Array.isArray(result[k])) return result[k].length
  }
  return null
}

export type ReceiptCall = { name: string; result: any }

/** The one line for this turn, from what really ran. */
export function receiptFor(calls: ReceiptCall[]): string {
  // Each lookup's own count, never a sum: two reads of the same 18 open jobs
  // showed as "jobs (36)" — a number nobody had (live test, 2026-10-21).
  const looked = new Map<string, { n: number; rows: number[]; failed: boolean }>()
  let cards = 0, refused = 0, asked = 0, steps = 0
  const extra: string[] = []
  for (const { name, result } of calls) {
    if (CARD_TOOLS.has(name)) {
      if (result?.proposal) cards++
      else if (result?.needs_choice) asked++
      else refused++
      continue
    }
    if (name === 'email_me') { extra.push(result?.sent ? 'Emailed you' : 'Email NOT sent'); continue }
    if (name === 'use_my_computer') { steps++; continue }
    const word = WORDS[name] || name.replace(/^query_/, '').replace(/_/g, ' ')
    const was = looked.get(word) || { n: 0, rows: [], failed: false }
    const rows = countOf(result)
    was.n++
    if (rows != null) was.rows.push(rows)
    if (result?.error || result?.restricted) was.failed = true
    looked.set(word, was)
  }
  const parts: string[] = []
  if (looked.size) {
    parts.push('Looked up: ' + [...looked.entries()].map(([w, x]) => {
      if (x.failed && !x.rows.length) return `${w} (failed)`
      if (!x.rows.length) return x.n > 1 ? `${w} ×${x.n}` : w
      const shown = x.rows.length > 3 ? [...x.rows.slice(0, 3), '…'] : x.rows
      return `${w} (${shown.join(', ')})`
    }).join(', '))
  }
  if (steps) parts.push(`${steps} step${steps === 1 ? '' : 's'} on your computer`)
  if (cards) parts.push(`Drafted ${cards} card${cards === 1 ? '' : 's'}`)
  if (asked) parts.push('Asked which one')
  if (refused) parts.push(`${refused} card${refused === 1 ? '' : 's'} refused`)
  parts.push(...extra)
  return parts.length ? parts.join(' · ') : 'No lookups this reply'
}

/** The model may not write a receipt of its own. One that copies the style
 *  ("⟦receipt⟧ Looked up: leads (1), email sent" — Sonnet 4.5, live test) is
 *  dropped whole; a stray bracket left by a split stream chunk is dropped too. */
export const unmarked = (s: string) => String(s ?? '').replace(/\n*⟦receipt⟧[^\n]*/g, '').replace(/[⟦⟧]/g, '')
