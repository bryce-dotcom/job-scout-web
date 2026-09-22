import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const field = readFileSync(resolve(here, '../pages/FieldScout.jsx'), 'utf8')
const detail = readFileSync(resolve(here, '../pages/JobDetail.jsx'), 'utf8')

// job_sections.status is constrained in the database to exactly these four.
// Field Scout compared against 'Completed' and labelled empties 'Pending' —
// neither is a real value, so a finished section never read as finished, and
// writing one would have been refused outright (23514).
const ALLOWED = ['Not Started', 'In Progress', 'Complete', 'Verified']

describe('a job section speaks the database\'s vocabulary', () => {
  const sectionBlock = field.slice(field.indexOf('const toggleSection'), field.indexOf('const handleMarkComplete'))

  it('writes only a status the check constraint allows', () => {
    const written = [...sectionBlock.matchAll(/next = done \? '([^']+)' : '([^']+)'/g)].flatMap(m => [m[1], m[2]])
    expect(written.length).toBeGreaterThan(0)
    for (const v of written) expect(ALLOWED).toContain(v)
  })

  it('never uses the two values that do not exist', () => {
    expect(sectionBlock).not.toMatch(/'Completed'/)
    expect(sectionBlock).not.toMatch(/'Pending'/)
  })

  it('reads done the same way the job page counts it', () => {
    expect(field).toMatch(/sec\.status === 'Complete' \|\| sec\.status === 'Verified'/)
    expect(detail).toMatch(/s\.status === 'Complete' \|\| s\.status === 'Verified'/)
  })

  it('shows the section name — the column is name, not section_name', () => {
    expect(field).toMatch(/\{sec\.name \|\|/)
    expect(field).not.toMatch(/sec\.section_name/)
  })
})
