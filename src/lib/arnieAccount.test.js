import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { summarizeArnie } from './arnieUsage.js'

// "What's the history with Halifax?" — one read that answers what four
// screens used to. These hold the two things that matter: the money gate
// (a tech gets the work, an admin gets the balance) and the balance rule
// (what the CUSTOMER owes, never the gross — an invoice the utility
// settled is not money on the books).
//
// And the eval-hygiene half: a draft the nightly harness made is not a
// person using Arnie, and must not land on the owner's screen.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/arnieAccount.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const evalSrc = read('../../scripts/arnie-eval.mjs')
const panel = read('../pages/agents/arnie/ArnieAtWork.jsx')
const migration = read('../../supabase/migrations/20260922120000_arnie_proposals_source.sql')

const load = (s, deps) => { const m = { exports: {} }; new Function('module', 'exports', 'require', transformSync(s, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, (p) => deps[p]); return m.exports }
const pay = load(read('../../supabase/functions/_shared/arniePayment.ts'), { './arnieRest.ts': { readRecordList: async () => [] }, './arnieConfig.ts': {}, './auth.ts': {}, './arnieSend.ts': {}, './arnieTime.ts': {} })

const CUST = { id: 7, name: 'Ben Rowe', business_name: 'Halifax Flooring', email: 'ben@x.example', phone: '801-555-0177', address: '12 Mill St', created_at: '2026-01-04T00:00:00Z' }
const rows = (over = {}) => ({
  'jobs?select=id,job_id,job_title,status': [
    { id: 1, job_id: 'JOB-1', job_title: 'Shop lighting', status: 'Completed', start_date: '2026-06-01', completed_at: '2026-06-09', job_total: 12000 },
    { id: 2, job_id: 'JOB-2', job_title: 'Quarterly service', status: 'Scheduled', start_date: '2026-10-02', completed_at: null, job_total: 800 },
  ],
  'quotes?select=id,quote_id,estimate_name': [
    { id: 5, quote_id: 'EST-5', estimate_name: 'Parking lot', status: 'Sent', quote_amount: 4000, sent_date: '2026-09-10', job_id: null },
    { id: 6, quote_id: 'EST-6', estimate_name: 'Old one', status: 'Sent', quote_amount: 900, sent_date: '2026-02-01', job_id: 2 },
  ],
  'appointments?select=id,title,start_time,status': [{ id: 9, title: 'Walkthrough', start_time: '2099-01-01T17:00:00Z', status: 'Scheduled' }],
  'communications_log?select=type,trigger,sent_date': [{ type: 'email', trigger: 'invoice', sent_date: '2026-09-15', recipient: 'ben@x.example', status: 'sent' }],
  'invoices?select=id,invoice_id,amount,customer_owes': [
    { id: 11, invoice_id: 'INV-1', amount: 12000, customer_owes: 12000, utility_owes: 0, utility_paid_at: null, credit_card_fee: 0, payment_status: 'Paid', invoice_type: 'standard', due_date: '2026-06-20' },
    { id: 12, invoice_id: 'INV-2', amount: 800, customer_owes: 800, utility_owes: 0, utility_paid_at: null, credit_card_fee: 0, payment_status: 'Pending', invoice_type: 'standard', due_date: '2026-01-01' },
    // The utility settled this one: the customer never owed a cent, so it is not a balance.
    { id: 13, invoice_id: 'INV-3', amount: 5000, customer_owes: 0, utility_owes: 5000, utility_paid_at: '2026-08-01', credit_card_fee: 0, payment_status: 'Paid', invoice_type: 'standard', due_date: '2026-07-01' },
  ],
  'payments?select=id,invoice_id,amount,date': [
    { id: 21, invoice_id: 11, amount: 12000, date: '2026-06-18', method: 'ACH', paid_by: 'customer' },
    { id: 22, invoice_id: 13, amount: 5000, date: '2026-08-01', method: 'Check', paid_by: 'utility' },
  ],
  'customers?select=id,name,business_name': [CUST],
  ...over,
})
const rest = (answers) => ({ readRecordList: async (_r, path) => { for (const [k, v] of Object.entries(answers)) if (path.startsWith(k)) return typeof v === 'function' ? v(path) : v; return [] } })
const mod = (answers) => load(src, { './arnieRest.ts': rest(answers), './arniePayment.ts': pay, './arnieConfig.ts': {}, './auth.ts': {} })

describe('the account, for someone who may see money', () => {
  it('jobs open and last, open estimates only, the NEXT appointment, the LAST contact (never a future booking)', async () => {
    const { customerAccount } = mod(rows())
    const a = await customerAccount({}, 25, CUST, { money: true })
    expect(a.customer).toMatchObject({ name: 'Halifax Flooring', contact: 'Ben Rowe', since: '2026-01-04' })
    expect(a.jobs).toMatchObject({ total: 2, open: 1 })
    expect(a.jobs.open_list[0]).toMatchObject({ job: 'JOB-2', status: 'Scheduled' })
    expect(a.jobs.last).toMatchObject({ job: 'JOB-1', on: '2026-06-09' })
    expect(a.quotes.open).toBe(1)                      // EST-6 became a job; not open
    expect(a.quotes.open_list[0]).toMatchObject({ quote: 'EST-5', amount: 4000 })
    expect(a.next_appointment.title).toBe('Walkthrough')
    expect(a.last_contact.on).toBe('2026-09-15')
  })
  it('the balance is what the CUSTOMER owes: the utility-settled invoice is not money owed, and its payment is not lifetime value', async () => {
    const { customerAccount } = mod(rows())
    const m = (await customerAccount({}, 25, CUST, { money: true })).money
    expect(m.balance).toBe('$800.00')
    expect(m.overdue).toBe('$800.00')                  // due 2026-01-01
    expect(m.open_invoices.map((i) => i.invoice)).toEqual(['INV-2'])
    expect(m.lifetime_paid).toBe('$12,000.00')         // the utility's $5,000 is not the customer's
    expect(m.last_payment).toMatchObject({ amount: '$12,000.00', method: 'ACH' })
  })
  it('a part payment leaves the remainder, and a fully paid account reads zero', async () => {
    const part = mod(rows({ 'payments?select=id,invoice_id,amount,date': [{ id: 21, invoice_id: 11, amount: 12000, date: '2026-06-18', method: 'ACH', paid_by: 'customer' }, { id: 23, invoice_id: 12, amount: 300, date: '2026-09-01', method: 'Cash', paid_by: 'customer' }] }))
    const m = (await part.customerAccount({}, 25, CUST, { money: true })).money
    expect(m.balance).toBe('$500.00')
    expect(m.open_invoices[0]).toMatchObject({ invoice: 'INV-2', balance: '$500.00', status: 'Partially Paid' })
    const clear = mod(rows({ 'invoices?select=id,invoice_id,amount,customer_owes': [] }))
    const z = (await clear.customerAccount({}, 25, CUST, { money: true })).money
    expect(z).toMatchObject({ balance: '$0.00', overdue: null, open_invoices: [], lifetime_paid: '$0.00', last_payment: null })
  })
})

describe('the money gate', () => {
  it('a tech gets the work and a sentence, and no figure anywhere', async () => {
    const { customerAccount } = mod(rows())
    const a = await customerAccount({}, 25, CUST, { money: false })
    expect(a.money).toMatch(/admin access/)
    expect(a.jobs.total).toBe(2)
    expect(a.quotes.open_list[0].amount).toBeUndefined()
    expect(JSON.stringify(a)).not.toMatch(/\$\d|lifetime|owes/i)   // no figure, and no money word but the one refusal sentence
  })
  it('the tool hands the gate the same line every other read draws, and the prompt never guesses a balance', () => {
    expect(chat).toMatch(/return await accountSummary\(\{ url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY \}, caller, input, isAdmin\)/)
    expect(chat).toMatch(/name: 'query_account'/)
    expect(engine).toMatch(/## "What's the history with Halifax\?"/)
    expect(engine).toMatch(/never guess a balance/)
  })
  it('one match answers, several ask, none points at leads', async () => {
    const { accountSummary } = mod(rows())
    expect((await accountSummary({}, { companyId: 25 }, { customer: 'Halifax' }, true)).customer.name).toBe('Halifax Flooring')
    const many = mod(rows({ 'customers?select=id,name,business_name': [CUST, { id: 8, name: 'Halifax Roofing', business_name: 'Halifax Roofing' }] }))
    const ask = await many.accountSummary({}, { companyId: 25 }, { customer: 'Halifax' }, true)
    expect(ask.needs_choice.map((c) => c.id)).toEqual([7, 8])
    const none = mod(rows({ 'customers?select=id,name,business_name': [] }))
    expect((await none.accountSummary({}, { companyId: 25 }, { customer: 'Nobody Ltd' }, true)).error).toMatch(/may still be a lead/)
  })
})

describe('the nightly eval is not a person using Arnie', () => {
  const now = new Date('2026-09-22T20:00:00Z')
  const ago = (d) => new Date(now.getTime() - d * 86400000).toISOString()
  it('summarizeArnie drops source=eval rows from every count', () => {
    const proposals = [
      { id: 1, created_by: 'a@x', target: 'won', status: 'applied', created_at: ago(1) },
      { id: 2, created_by: 'a@x', target: 'lead', status: 'rolled_back', created_at: ago(1), source: 'eval' },
      { id: 3, created_by: 'a@x', target: 'lead', status: 'rejected', created_at: ago(1), source: 'eval' },
    ]
    const s = summarizeArnie({ proposals }, 30, now)
    expect(s.drafted).toBe(1); expect(s.approved).toBe(1); expect(s.approvalRate).toBe(100)
    expect(s.kinds).toEqual([{ kind: 'estimate won', drafted: 1, approved: 1 }])
  })
  it('the panel asks the server for real drafts only, and the harness stamps what it made', () => {
    expect(panel).toMatch(/\.is\('source', null\)/)
    expect(evalSrc).toMatch(/const RUN_STARTED = new Date\(\)\.toISOString\(\)/)
    expect(evalSrc).toMatch(/async function stampEvalProposals\(\)/)
    expect(evalSrc).toMatch(/created_at=gte\.\$\{RUN_STARTED\}/)
    expect(evalSrc).toMatch(/JSON\.stringify\(\{ source: 'eval' \}\)/)
    expect(evalSrc).toMatch(/await unseed\(\)\n  await stampEvalProposals\(\)/)
    expect(migration).toMatch(/add column if not exists source text/)
  })
})
