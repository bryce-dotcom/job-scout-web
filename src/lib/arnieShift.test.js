import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const shift = read('../../supabase/functions/_shared/arnieShift.ts')
const records = read('../../supabase/functions/_shared/arnieRecords.ts')
const propose = read('../../supabase/functions/_shared/arnieRecordPropose.ts')
const payroll = read('../pages/Payroll.jsx')
const timeclock = read('../pages/TimeClock.jsx')

const proposeFn = shift.slice(shift.indexOf('export async function proposeShiftClose'), shift.indexOf('export async function applyShiftClose'))
const applyFn = shift.slice(shift.indexOf('export async function applyShiftClose'), shift.indexOf('export async function rollbackShiftClose'))
const rollbackFn = shift.slice(shift.indexOf('export async function rollbackShiftClose'))

describe('closing a shift writes what the Payroll page writes', () => {
  it('clock_out, hours, and the adjustment trail', () => {
    for (const col of ['clock_out', 'total_hours', 'adjusted_by', 'adjusted_at', 'adjustment_reason']) {
      expect(applyFn, col).toContain(col)
      expect(payroll, col).toContain(col)
    }
  })

  it('keeps the originals on the first adjustment, as the page does', () => {
    expect(applyFn).toMatch(/if \(!row\.original_clock_in\) \{ patch\.original_clock_in = row\.clock_in/)
    expect(payroll).toMatch(/if \(!original\.original_clock_in\)/)
  })

  it('hours are clock-in to clock-out less lunch — the same rule as the clock-out button', () => {
    expect(shift).toMatch(/if \(row\.lunch_start && row\.lunch_end\) h -= /)
    expect(timeclock).toMatch(/if \(entry\.lunch_start && entry\.lunch_end\)/)
  })

  it('a shift someone else closed first is refused as stale', () => {
    expect(applyFn).toMatch(/if \(row\.clock_out\) return \{ ok: false, stale: true/)
  })
})

describe('who may close whose shift', () => {
  it('own shift: anyone; someone else\'s: admin, the Payroll page\'s rule', () => {
    expect(proposeFn).toMatch(/caller\.level < 3\) return \{ error: 'You can close your own open shift; someone else\\'s needs an admin\.' \}/)
    expect(shift).toMatch(/if \(caller\.level < 3\) return \{ error: `You can close your own open shift\. Closing \$\{other\.name\}'s needs an admin/)
    expect(payroll).toMatch(/\{isAdmin && \(/)
  })

  it('the registry says admin, and ownerOf lets a person through for their own row at decision time', () => {
    expect(records).toMatch(/shift_close: \{[\s\S]*minLevel: 3[\s\S]*ownerOf: async/)
    expect(propose).toMatch(/if \(target\.ownerOf && rowId != null\)/)
    expect(propose).toMatch(/String\(owner\) === String\(caller\.employeeId\)\) return \{ ok: true \}/)
  })
})

describe('the time is checked, never assumed', () => {
  it('must be after the clock-in, not in the future, and not a 16-hour shift', () => {
    expect(proposeFn).toMatch(/is before the clock-in at/)
    expect(proposeFn).toMatch(/is in the future/)
    expect(proposeFn).toMatch(/if \(hours > 16\) return/)
  })

  it('is read in the caller\'s zone, with "now" as the only shortcut', () => {
    // As SAID, looking back: "5:30 yesterday", "Thursday at 6pm" — the server does the calendar (resolveWhenSaid).
    expect(proposeFn).toMatch(/const said = v === 'now' \|\| v === '' \? null : resolveWhenSaid\(input\.value, tz, 'back'\)/)
    expect(proposeFn).toMatch(/const out = said \? localToUtc\(`\$\{said\.date\} \$\{said\.time\}`, tz\) : new Date\(\)/)
  })

  it('more than one open shift is a choice, none is a plain answer', () => {
    expect(proposeFn).toMatch(/if \(open\.length > 1\) \{\s*return \{ needs_choice:/)
    expect(proposeFn).toMatch(/no open shift — nothing to close/)
  })

  it('renders as a record card: (still open) → the time and the hours', () => {
    expect(proposeFn).toMatch(/kind: 'record', label: 'shift clock-out'/)
    expect(proposeFn).toMatch(/before: '\(still open\)', after: `\$\{fmt\(out, tz\)\} · \$\{hours\} h`/)
  })
})

describe('reopening', () => {
  it('clears clock_out, hours and the trail; refuses if the row moved since', () => {
    expect(rollbackFn).toMatch(/clock_out: null, total_hours: null, adjusted_by: null, adjusted_at: null, adjustment_reason: null/)
    expect(rollbackFn).toMatch(/has been changed since/)
  })
})
