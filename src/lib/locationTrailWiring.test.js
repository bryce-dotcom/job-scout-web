import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Bryce, 23 Oct 2026: "the location trail is not showing anything… it wont
// open." The View-location-trail button sits on the punches inside the
// employee detail view, which is its own early `return`; the modal was
// rendered only by the main view after it. The click set state that nothing
// drew. Every view that offers the button has to render the modal.
describe('the location trail opens from where its button is', () => {
  const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'src/pages/Payroll.jsx'), 'utf8')
  const detailStart = page.indexOf('if (selectedEmployee) {')
  const mainStart = page.indexOf('\n  return (', detailStart + 1)

  it('the button and the modal are both in the employee detail view', () => {
    const detail = page.slice(detailStart, mainStart)
    expect(detail).toMatch(/setLocationTrailEntry\(entry\)/)
    expect(detail).toMatch(/<LocationTrailModal/)
  })

  it('and the main view still renders it for its own buttons', () => {
    expect(page.slice(mainStart)).toMatch(/<LocationTrailModal/)
  })
})
