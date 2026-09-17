// "Log this receipt." — a photo, and Arnie reads it.
//
// The Expenses page writes an expense from a form; Field Scout's receipt
// capture writes one with amount 0 and "edit amounts in Expenses". This is
// the version where the paper gets read: the model looks at the photo,
// pulls the merchant, the date and the total, and the card shows exactly
// what it read so the person can catch a 8 that was a 3. Nothing is
// written until they approve.
//
// The receipt file itself never passes through the model's tool call or
// the proposal row: when they approve, the client uploads the photo it
// already holds to project-documents (the same path the Expenses page
// uses) and hands the URL to arnie-config, which puts it on the row. A
// receipt with no photo behind it is still an expense — just one with no
// receipt attached, and the card says so.
//
// Who: anyone. A tech logging their own fuel is the point.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { findJob } from './arnieShift.ts'
import { resolveDayWord } from './arnieTime.ts'

// The Expenses page's list (src/lib/schema.js EXPENSE_CATEGORIES). A test
// pins the two together; a category Arnie writes must be one the page shows.
export const EXPENSE_CATEGORIES = [
  'Cost of Sale', 'Materials', 'Labor', 'Equipment Rental', 'Permits', 'Travel', 'Fuel', 'Meals',
  'Subcontractor', 'Office Supplies', 'Marketing', 'Insurance', 'Utilities', 'Other',
]

const usd = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amountOf = (s: string) => { const n = Number(String(s || '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN }
const jobLine = (j: any) => [j.job_id, j.job_title, j.customer_name || j.business_name].filter(Boolean).join(' — ') || `Job #${j.id}`

/** "fuel", "gas", "diesel" → Fuel; "lowes", "home depot" → Materials; else the page's list, exactly. */
function categoryOf(said: string, merchant: string): string | null {
  const s = String(said || '').trim().toLowerCase()
  const exact = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === s)
  if (exact) return exact
  const m = `${s} ${String(merchant || '').toLowerCase()}`
  if (/\b(fuel|gas|gasoline|diesel|chevron|shell|maverik|sinclair|exxon|conoco|pilot|flying j)\b/.test(m)) return 'Fuel'
  if (/\b(material|materials|lowe'?s|home depot|graybar|ferguson|platt|supply|electrical|plumbing|hardware)\b/.test(m)) return 'Materials'
  if (/\b(meal|meals|lunch|dinner|breakfast|coffee|restaurant|food)\b/.test(m)) return 'Meals'
  if (/\b(rental|rent|sunbelt|united rentals|lift|scissor)\b/.test(m)) return 'Equipment Rental'
  if (/\b(permit|permits|inspection fee)\b/.test(m)) return 'Permits'
  if (/\b(hotel|flight|airfare|parking|toll|mileage|uber|lyft)\b/.test(m)) return 'Travel'
  if (/\b(office|staples|paper|toner|printer)\b/.test(m)) return 'Office Supplies'
  if (/\b(sub|subcontractor)\b/.test(m)) return 'Subcontractor'
  return null
}

export async function prepareExpense(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  const amount = amountOf(f.amount)
  if (!(amount > 0)) return { ok: false as const, error: `I need the total — I read "${f.amount || ''}" and that is not an amount. If the receipt is hard to read, tell me the number.` }
  if (amount > 50000) return { ok: false as const, error: `${usd(amount)} on one receipt? Say the number again so I know it is not a misread.` }
  const merchant = String(f.merchant || '').trim().replace(/\s+/g, ' ').slice(0, 80)
  if (merchant.length < 2) return { ok: false as const, error: 'Who was it paid to? The merchant is on the top of the receipt.' }
  const tz = f.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(f.timezone) ? f.timezone : 'America/Denver'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const date = f.date ? resolveDayWord(String(f.date).trim(), tz) : today
  if (!date) return { ok: false as const, error: `Which day? I can take the date off the receipt as YYYY-MM-DD, "yesterday", or a weekday — I got "${f.date}".` }
  if (date > today) return { ok: false as const, error: `${date} is in the future. Read the date off the receipt again.` }
  const category = categoryOf(f.category || '', merchant)
  if (!category) return { ok: false as const, error: `Which category? One of: ${EXPENSE_CATEGORIES.join(', ')}.` }

  // The job, if one was named — the same lookup every other rail uses.
  let job: any = null
  if (f.job && !/\b(none|no job|general|overhead)\b/i.test(f.job)) {
    const found = await findJob(r, companyId, f.job)
    if (!found.rows.length) return { ok: false as const, error: `I do not find an open job for "${f.job}". Name the customer or the job number, or say "no job" for overhead.` }
    if (found.rows.length > 1) return { needs_choice: found.rows.slice(0, 6).map((j: any) => ({ id: j.id, label: `${jobLine(j)} · ${j.status}` })), message: 'More than one job matches. Ask which, then call again naming it as listed.' }
    job = found.rows[0]
  }

  // Twice is the classic receipt mistake: the same paper photographed on
  // Friday and again on Monday.
  const dupes = await readRecordList(r, `expenses?select=id,description&company_id=eq.${companyId}&amount=eq.${amount}&date=gte.${date}T00:00:00&date=lt.${date}T23:59:59.999&limit=5`)
  const same = dupes.find((d: any) => String(d.description || '').toLowerCase().includes(merchant.toLowerCase().slice(0, 12)))
  if (same) return { ok: false as const, error: `${usd(amount)} at ${merchant} on ${date} is already on the books (expense #${same.id}). Same receipt twice? If it really is a second purchase, say so.` }

  const description = [merchant, String(f.description || '').trim()].filter(Boolean).join(' — ').slice(0, 200)
  const hasReceipt = /^(yes|true|attached|1)$/i.test(String(f.receipt || '').trim())
  return {
    ok: true as const,
    columns: {
      merchant, category, date, amount, description, job_id: job?.id ?? null,
      status: 'Pending', source: 'arnie', notes: `Logged via Arnie by ${caller.email}${f.notes ? ' — ' + String(f.notes).slice(0, 200) : ''}`,
    },
    display: [
      { label: 'Amount', value: usd(amount) },
      { label: 'Merchant', value: merchant },
      { label: 'Date', value: date },
      { label: 'Category', value: category },
      ...(job ? [{ label: 'Job', value: jobLine(job) }] : [{ label: 'Job', value: 'none — overhead' }]),
      { label: 'Receipt', value: hasReceipt ? 'the photo from this chat, attached on approve' : 'none — add one later on Expenses' },
    ],
  }
}
