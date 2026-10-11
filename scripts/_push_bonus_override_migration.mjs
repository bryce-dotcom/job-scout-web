#!/usr/bin/env node
// Apply 20261010210000_bonus_override_reason.sql to the linked database.
//
// `supabase db push --linked` refuses on its own here: 25 local migration
// files sort BEFORE the remote's last applied migration and are not in its
// history ("Found local migration files to be inserted before the last
// migration on remote database"). They are old placeholders and migrations
// this database already has. --include-all would try to replay all 25, which
// is the thing never to do.
//
// So: hold those 25 aside, push the one new file, put them back. The restore
// runs in `finally`, so a failed push still leaves the repo as it found it.
//
//   node scripts/_push_bonus_override_migration.mjs          apply it
//   node scripts/_push_bonus_override_migration.mjs --dry    just show the plan
import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DRY = process.argv.includes('--dry')
const MIGRATIONS = 'supabase/migrations'
const HOLD = join('supabase', '.migration-hold')
const MINE = '20261010210000_bonus_override_reason.sql'

// Already on the remote, or deliberate no-op placeholders. Listed explicitly
// rather than computed, so this script can never move something new.
const HOLD_BACK = [
  '20260612171500_remote_applied_placeholder', '20260612210000_remote_history_placeholder',
  '20260615154949_vendor_is_internal', '20260722000000_trial_readonly_write_gate',
  '20260722000100_tmp_gate_debug', '20260722000200_remote_applied_placeholder',
  '20260722001000_rls_stage1_operational', '20260722002000_rls_stage2_financial',
  '20260722003000_rls_stage3_reference', '20260722004000_rls_stage5_remaining',
  '20260722005000_rls_employees', '20260819120000_remote_history_placeholder',
  '20260819160000_remote_history_placeholder', '20260819180000_remote_history_placeholder',
  '20260820170000_remote_history_placeholder', '20260820171000_shared_expense_categories_readable',
  '20260820172000_remote_history_placeholder', '20260820173000_remote_history_placeholder',
  '20260820174000_remote_history_placeholder', '20260911120000_utility_shortfall',
  '20260911150000_job_diagnoses', '20260914160000_arnie_brief_subscriptions',
  '20260914200000_leads_geocode_on_save', '20260915190000_arnie_nudges',
  '20260916200000_arnie_memories',
].map(n => `${n}.sql`)

if (!existsSync(join(MIGRATIONS, MINE))) {
  console.error(`cannot find ${MINE} — run this from the worktree that has it`)
  process.exit(1)
}
console.log(`will hold back ${HOLD_BACK.length} already-applied files, then push ${MINE}`)
if (DRY) { console.log('(dry run — nothing moved, nothing pushed)'); process.exit(0) }

mkdirSync(HOLD, { recursive: true })
const moved = []
try {
  for (const f of HOLD_BACK) {
    const from = join(MIGRATIONS, f)
    if (!existsSync(from)) continue
    renameSync(from, join(HOLD, f))
    moved.push(f)
  }
  console.log(`held back ${moved.length}; pushing…`)
  execFileSync('npx', ['supabase', 'db', 'push', '--linked'], { stdio: 'inherit', shell: true })
  console.log('\npush finished')
} finally {
  for (const f of moved) {
    const from = join(HOLD, f)
    if (existsSync(from)) renameSync(from, join(MIGRATIONS, f))
  }
  console.log(`restored ${moved.length} file(s)`)
  if (existsSync(HOLD) && readdirSync(HOLD).length === 0) {
    try { renameSync(HOLD, HOLD + '-empty') } catch { /* leave it */ }
  }
}
