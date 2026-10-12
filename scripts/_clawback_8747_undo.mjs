// Pull the clawback deduction created earlier today. Bryce, 2026-10-11.
//
// Deducting from wages needs the employee's written authorization, so the
// recovery is paused rather than cancelled. The bonus row keeps the finding —
// 181.2 hours allotted, none clocked, released by override with no reason —
// because that is true whatever is decided about the money.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3, ADJ = 28, BONUS_ID = 20281

const { data: adj, error } = await sb.from('payroll_adjustments').select('*').eq('id', ADJ).eq('company_id', C).maybeSingle()
if (error) throw error
if (!adj) { console.log(`adjustment ${ADJ} is already gone — nothing to pull`); process.exit(0) }
if (adj.employee_id !== 19 || Math.abs(Number(adj.amount) - 4235.28) > 0.01 || adj.type !== 'deduction') {
  throw new Error('row is not the clawback this script was written for — stopping')
}
// Has a payroll run already consumed it? Then deleting it would silently
// disagree with a cheque that already went out.
const { data: runs } = await sb.from('payroll_runs').select('id, period_start, period_end, status')
  .eq('company_id', C).lte('period_start', adj.pay_period_end).gte('period_end', adj.pay_period_start)
if (runs?.length) {
  console.log('a payroll run covers this period already — not deleting:', JSON.stringify(runs))
  process.exit(1)
}
console.log(`pulling: $${Number(adj.amount).toFixed(2)} deduction, employee ${adj.employee_id}, period ${adj.pay_period_start}..${adj.pay_period_end}`)
const { error: e1 } = await sb.from('payroll_adjustments').delete().eq('id', ADJ).eq('company_id', C)
if (e1) throw e1
console.log('deduction deleted')

const note = 'FLAGGED 2026-10-11, not recovered. $4,235.28 was released on this job by admin override on 2026-08-20 with no reason recorded; '
  + 'the job is allotted 181.2 hours and has none clocked against it. A payroll deduction was raised and then pulled the same day: '
  + 'deducting from wages needs the employee\'s written authorization first. Open decision for Bryce.'
const { error: e2 } = await sb.from('job_bonuses').update({ override_reason: note, updated_at: new Date().toISOString() })
  .eq('id', BONUS_ID).eq('company_id', C)
if (e2) throw e2
console.log('bonus note corrected — it no longer claims a recovery')
