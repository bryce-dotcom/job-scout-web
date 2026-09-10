#!/usr/bin/env node
// npm run check:utility-split — do the utility invoices add up?
//
// Step one of retiring the separate utility invoice. Before any of that money
// moves into a payer split on the customer invoice, the rows it comes FROM
// have to be internally consistent, because migrating a wrong number is how
// it becomes permanent.
//
// Each utility_invoices row carries three figures that must agree:
//
//   project_cost      the in-scope work
//   incentive_amount  what the utility owes         (= amount, what we bill them)
//   net_cost          the customer's out-of-pocket on that same in-scope work
//
//   project_cost = incentive_amount + net_cost
//
// Per row that held on every sample checked by hand; across all 28 rows the
// aggregate was out by about $21,000, so some rows disagree. This names them.
//
// Reports only. It never writes — the fix is a judgement about real money on a
// real job, and a script guessing which of the three figures is the wrong one
// would be exactly the wrong kind of help.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const num = (v) => Number(v) || 0
const usd = (n) => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CENT = 0.01

const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('utility_invoices')
    .select('id, company_id, job_id, utility_invoice_id, utility_name, amount, incentive_amount, project_cost, net_cost, payment_status, invoice_id')
    .range(from, from + 999)
  if (error) { console.error('utility_invoices:', error.message); process.exit(1) }
  rows.push(...data)
  if (data.length < 1000) break
}

console.log(`\n  ${rows.length} utility invoice(s)\n`)

const problems = []
for (const r of rows) {
  const why = []
  const project = num(r.project_cost)
  const incentive = num(r.incentive_amount)
  const net = num(r.net_cost)

  // The equation alone is not enough. Row 42 satisfied it with
  // project $0 = incentive $29,697.75 + net −$29,697.75, and an earlier
  // version of this check called that clean. A negative share is not a
  // share, and three zeroes is not a reconciled invoice — both have to fail
  // before anything migrates them.
  if (project < 0 || incentive < 0 || net < 0) {
    why.push(`negative figure: project ${usd(project)}, incentive ${usd(incentive)}, net ${usd(net)}`)
  } else if (project === 0 && incentive === 0 && net === 0) {
    why.push('all three figures are zero — an empty row, not a reconciled one')
  } else if (Math.abs(project - (incentive + net)) > CENT) {
    why.push(`project ${usd(project)} != incentive ${usd(incentive)} + net ${usd(net)} (off by ${usd(project - incentive - net)})`)
  }
  // What we bill the utility should be what we say they owe.
  if (Math.abs(num(r.amount) - incentive) > CENT) {
    why.push(`billed ${usd(r.amount)} != incentive ${usd(incentive)}`)
  }
  if (!r.project_cost) why.push('no project_cost')
  if (!r.incentive_amount) why.push('no incentive_amount')
  // The whole point of the rebuild: the books must name the utility.
  const named = String(r.utility_name || '').trim()
  if (!named || named.toLowerCase() === 'utility') why.push(`utility not named (utility_name = ${JSON.stringify(r.utility_name)})`)
  if (!r.job_id) why.push('not linked to a job')

  if (why.length) problems.push({ r, why })
}

const money = (f) => rows.reduce((s, r) => s + num(r[f]), 0)
console.log('  TOTALS')
console.log(`    project_cost      ${usd(money('project_cost'))}`)
console.log(`    incentive_amount  ${usd(money('incentive_amount'))}   <- utility owes`)
console.log(`    net_cost          ${usd(money('net_cost'))}   <- customer out-of-pocket`)
const gap = money('project_cost') - money('incentive_amount') - money('net_cost')
console.log(`    reconciliation    ${Math.abs(gap) < CENT ? 'balanced' : usd(gap) + ' OUT'}`)

const BAD = (w) => w.includes('!=') || w.startsWith('negative figure') || w.startsWith('all three figures')
const arithmetic = problems.filter((p) => p.why.some(BAD))
const naming = problems.filter((p) => p.why.some((w) => w.startsWith('utility not named')))

console.log(`\n  rows with an arithmetic problem : ${arithmetic.length}`)
console.log(`  rows that do not name the utility: ${naming.length}`)

if (arithmetic.length) {
  console.log('\n  THESE MUST BE CORRECTED BEFORE MIGRATING\n')
  for (const { r, why } of arithmetic) {
    console.log(`    utility invoice ${r.id} · job ${r.job_id} · ${r.utility_invoice_id || '(no number)'} · ${r.payment_status}`)
    for (const w of why.filter(BAD)) console.log(`        ${w}`)
  }
}

if (naming.length === rows.length && rows.length > 0) {
  console.log(`\n  Every row names the utility as "${rows[0].utility_name}". The books cannot`)
  console.log('  say which utility owes the money until that is set. It cannot be derived:')
  console.log('  jobs.utility_name and jobs.audit_id are both null on these jobs.')
}

console.log(`\n  ${arithmetic.length === 0 ? 'Arithmetic is clean — safe to migrate the money.' : 'Do not migrate yet.'}\n`)
process.exit(arithmetic.length === 0 ? 0 : 1)
