// Claw back the bonus released on job 8747 "Redman #2". Bryce, 2026-10-11.
//
// $4,235.28 paid to London Miller on 2026-08-20. The job is allotted 181.2
// hours and has ZERO hours clocked against it, so the "hours saved" the bonus
// was computed from is the whole allotment. The hold fired correctly and was
// cleared by an admin override (Alayda, employee 15) before a reason was
// required.
//
// The bonus row is left as 'paid'. It WAS paid, and only 'paid' rows are
// frozen against the ledger's recompute — voiding it would have the next sync
// recreate it as owed, since the job still shows 181.2 hours saved. The
// recovery is a payroll deduction, which is the mechanism the app actually
// runs on, and it is reversible by deleting the row until payroll runs.
//
//   node scripts/_clawback_8747.mjs --apply     (prints the plan without it)
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const C = 3
const BONUS_ID = 20281
const EMPLOYEE = 19          // London Miller
const PERIOD = { start: '2026-10-01', end: '2026-10-15' }  // next run after 09-30
const ORDERED_BY = 3         // Bryce, who asked for it

const { data: bonus, error } = await sb.from('job_bonuses').select('*').eq('id', BONUS_ID).eq('company_id', C).single()
if (error) throw error
if (bonus.employee_id !== EMPLOYEE || Math.abs(Number(bonus.amount) - 4235.28) > 0.01) {
  throw new Error('bonus row is not what this script was written for — stopping')
}
const amount = Number(bonus.amount)
const reason = 'Clawback of the efficiency bonus released on job 8747 (Redman #2). '
  + 'The job is allotted 181.2 hours and has no hours clocked against it, so the hours saved it was paid on were never worked. '
  + 'The verification hold fired and was cleared by an admin override on 2026-08-20 with no reason recorded. Reversal ordered by Bryce Westcott, 2026-10-11.'

const { data: already } = await sb.from('payroll_adjustments').select('id, amount, reason')
  .eq('company_id', C).eq('employee_id', EMPLOYEE).eq('type', 'deduction').ilike('reason', '%8747%')
if (already?.length) { console.log('a clawback for 8747 already exists:', JSON.stringify(already)); process.exit(0) }

console.log(`PLAN
  deduct      $${amount.toFixed(2)} from London Miller (employee ${EMPLOYEE})
  pay period  ${PERIOD.start} .. ${PERIOD.end}
  bonus row   ${BONUS_ID} stays 'paid' — it was paid, and 'paid' is what the ledger will not recompute
  reason      ${reason}`)
if (!APPLY) { console.log('\n(dry run — nothing written; pass --apply)'); process.exit(0) }

const { data: adj, error: e1 } = await sb.from('payroll_adjustments').insert({
  company_id: C, employee_id: EMPLOYEE, type: 'deduction', amount,
  reason, recurring: false,
  pay_period_start: PERIOD.start, pay_period_end: PERIOD.end,
  created_by: ORDERED_BY,
}).select('id').single()
if (e1) throw e1
console.log(`\ndeduction created: payroll_adjustments id ${adj.id}`)

// Put the story next to the bonus too, so the ledger explains itself.
const note = `CLAWED BACK 2026-10-11: ${amount.toFixed(2)} recovered by payroll deduction ${adj.id}. `
  + 'Released 2026-08-20 by admin override with no reason recorded; the job has 181.2 hours allotted and none clocked.'
const { error: e2 } = await sb.from('job_bonuses').update({ override_reason: note, updated_at: new Date().toISOString() })
  .eq('id', BONUS_ID).eq('company_id', C)
if (e2) throw e2
console.log('bonus row annotated with the clawback')
