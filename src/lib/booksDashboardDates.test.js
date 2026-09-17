import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const books = read('../pages/Books.jsx')
const dash = read('../pages/Dashboard.jsx')
const expenses = read('../pages/Expenses.jsx')
const reports = read('./reports.js')

// The audit of 2026-09-17: every money surface that groups or ranges by day
// goes through lib/localDate.js. A `new Date(x).getMonth()` on a date column
// or on expenses.date is the bug, wherever it appears.
describe('one date rule on every money surface', () => {
  it('Books: this month is a local calendar range, not getMonth() on an instant', () => {
    expect(books).toMatch(/const isThisMonth = \(dateStr\) => inLocalRange\(dateStr, firstOfMonth, firstOfNextMonth\)/)
    expect(books).not.toMatch(/d\.getMonth\(\) === currentMonth/)
  })
  it('Dashboard: today is the local day, and an appointment is on its local day', () => {
    expect(dash).toMatch(/const todayStr = localDateStr\(today\)/)
    expect(dash).not.toMatch(/todayStr = today\.toISOString\(\)/)
    expect(dash).toMatch(/calendarDay\(a\.start_time\) === todayStr/)
  })
  it('reports.js reads the rule from localDate.js rather than keeping a twin', () => {
    expect(reports).toMatch(/import \{ calendarDay \} from '\.\/localDate\.js'/)
    expect(reports).toMatch(/export \{ calendarDay \}/)
    expect(reports).not.toMatch(/const x = new Date\(d\)\s*\n\s*return `\$\{x\.getFullYear\(\)\}/)
  })
  it('the Expenses page shows the stored day', () => {
    expect(expenses).toMatch(/toLocaleDateString\('en-US', \{ timeZone: 'UTC' \}\)/)
  })
})
