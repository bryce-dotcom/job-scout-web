// Give a locked-out account its access back.
//
// company_can_write() refuses every write for 'trial_expired' and 'canceled',
// which is how Antonino Lawn Care sat read-only from 2026-06-08 — and, until
// today, could not even send feedback to say so.
//
// Reopening matches how beta-signup creates an account in the first place:
// billing_status 'trialing' with a fresh window. Not 'grandfathered' — that is
// only used for HHH's own companies (3 and 4) and means free forever, which is
// a different decision from extending a beta.
//
//   npx vite-node scripts/reopen-trial.mjs 9
//   npx vite-node scripts/reopen-trial.mjs 9 --days 45 --approve

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { READ_ONLY_STATUSES } from '../src/lib/billingMessages.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const args = process.argv.slice(2)
const companyId = Number(args.find(a => /^\d+$/.test(a)))
const APPROVE = args.includes('--approve')
const daysArg = args.indexOf('--days')
const DAYS = daysArg >= 0 ? Number(args[daysArg + 1]) || 30 : 30

if (!companyId) {
  console.log('\n  usage: reopen-trial.mjs <companyId> [--days 30] [--approve]\n')
  process.exit(1)
}

const { data: co, error } = await sb.from('companies')
  .select('id, company_name, billing_status, trial_ends_at, subscription_tier, active')
  .eq('id', companyId).single()
if (error) throw new Error(`companies: ${error.message}`)

const { data: people } = await sb.from('employees')
  .select('name, email, active').eq('company_id', companyId)
const activePeople = (people || []).filter(p => p.active)

const wasLocked = READ_ONLY_STATUSES.includes(co.billing_status)
console.log(`\n  ${co.company_name}  (company ${co.id})`)
console.log(`    billing_status  ${co.billing_status}${wasLocked ? '   <- read-only, every write refused' : ''}`)
console.log(`    trial_ends_at   ${co.trial_ends_at || '-'}`)
console.log(`    tier            ${co.subscription_tier}   active=${co.active}`)
console.log(`    people          ${activePeople.length} active: ${activePeople.map(p => p.name || p.email).join(', ')}`)

// Three cases, not two. Reopening a locked account and extending one that is
// already running are the same edit to the same two fields — refusing the
// second just means doing it by hand later.
const onTrial = co.billing_status === 'trialing'
if (!wasLocked && !onTrial) {
  console.log(`\n  ${co.billing_status} — not on a trial, so there is no window to set.\n`)
  process.exit(0)
}
const verb = wasLocked ? 'reopen' : 'extend'

// Same shape beta-signup writes for a new account.
const endsAt = new Date(Date.now() + DAYS * 86400 * 1000).toISOString()

if (!APPROVE) {
  console.log(`\n  would ${verb}: billing_status 'trialing', trial_ends_at ${endsAt.slice(0, 10)} (${DAYS} days from today)`)
  console.log(`  re-run with --approve to apply.\n`)
  process.exit(0)
}

const { error: ue } = await sb.from('companies')
  .update({ billing_status: 'trialing', trial_ends_at: endsAt })
  .eq('id', companyId)
if (ue) throw new Error(`update: ${ue.message}`)

const { data: after } = await sb.from('companies')
  .select('billing_status, trial_ends_at').eq('id', companyId).single()
const stillLocked = READ_ONLY_STATUSES.includes(after.billing_status)
const daysLeft = Math.round((new Date(after.trial_ends_at) - Date.now()) / 86400000)
console.log(`\n  now: ${after.billing_status}, ends ${String(after.trial_ends_at).slice(0, 10)} (${daysLeft} days)`)
console.log(`  writes allowed: ${stillLocked ? 'NO — something else is wrong' : 'yes'}`)
console.log(`  ${activePeople.length} active ${activePeople.length === 1 ? 'person' : 'people'} unaffected by the gate.\n`)
