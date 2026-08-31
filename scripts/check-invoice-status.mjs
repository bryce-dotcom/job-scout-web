#!/usr/bin/env node
// npm run check:invoice-status  — does jobs.invoice_status still match reality?
//
// jobs.invoice_status is a cache of a fact that lives in the `invoices` table.
// A trigger (sync_job_invoice_status) keeps the two equal, and that trigger
// deliberately SWALLOWS its own errors: a display cache must never be able to
// roll back an invoice insert, because a stale badge is an annoyance and an
// invoice that will not save is a customer who cannot be billed.
//
// The cost of that choice is that drift can return silently. This is the
// check that would have caught it the first time. Before the trigger existed,
// the column was written by hand in five places, missed by every other route
// that creates an invoice, and was right about 33% of the time: 723 jobs had
// an invoice, 241 said so, and not one of the 444 fully-paid jobs was flagged
// 'Paid' even though 'Paid' is in the column's documented vocabulary.
//
// Reports only. Pass --fix to re-sync the rows that disagree.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const FIX = process.argv.includes('--fix')

const page = async (table, select, tweak = (q) => q) => {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tweak(sb.from(table).select(select)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// The same rule the SQL function implements. Kept here only so this check is
// independent of the thing it is checking — if they ever disagree, that is
// the finding.
const expected = (invoices) => {
  if (invoices.length === 0) return 'Not Invoiced'
  return invoices.every((i) => i.payment_status === 'Paid') ? 'Paid' : 'Invoiced'
}

const jobs = await page('jobs', 'id, company_id, job_id, invoice_status')
const invoices = await page('invoices', 'job_id, payment_status', (q) => q.not('job_id', 'is', null))

const byJob = new Map()
for (const inv of invoices) {
  const k = String(inv.job_id)
  if (!byJob.has(k)) byJob.set(k, [])
  byJob.get(k).push(inv)
}

const drift = []
for (const j of jobs) {
  const want = expected(byJob.get(String(j.id)) || [])
  if (j.invoice_status !== want) drift.push({ ...j, want })
}

console.log(`\n  ${jobs.length} jobs, ${invoices.length} invoices across ${byJob.size} jobs`)

if (drift.length === 0) {
  console.log(`  invoice_status agrees with the invoices table on every job.\n`)
  process.exit(0)
}

const buckets = {}
for (const d of drift) {
  const k = `${d.invoice_status ?? '(null)'} -> ${d.want}`
  buckets[k] = (buckets[k] || 0) + 1
}
console.log(`\n  ${drift.length} job(s) disagree:\n`)
for (const [k, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(5)}  ${k}`)
}
console.log(`\n  sample: ${drift.slice(0, 5).map((d) => `${d.job_id || d.id} (company ${d.company_id})`).join(', ')}`)

if (!FIX) {
  console.log(`\n  the trigger should have prevented this — check the Postgres log for`)
  console.log(`  "sync_job_invoice_status: job N not synced" warnings before re-syncing.`)
  console.log(`  re-sync with:  node scripts/check-invoice-status.mjs --fix\n`)
  process.exit(1)
}

let fixed = 0
for (const d of drift) {
  const { error } = await sb.from('jobs').update({ invoice_status: d.want }).eq('id', d.id)
  if (error) console.log(`    job ${d.id}: ${error.message}`)
  else fixed++
}
console.log(`\n  re-synced ${fixed} of ${drift.length} job(s).\n`)
process.exit(fixed === drift.length ? 0 : 1)
