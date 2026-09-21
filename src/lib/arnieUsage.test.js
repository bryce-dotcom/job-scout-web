import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarizeArnie, targetLabel, TARGET_LABELS } from './arnieUsage.js'

// The owner's "is Arnie earning his keep" screen. Numbers from rows,
// nothing invented; a person is named from the roster, never shown an
// email; the window is honoured; a name exists for every target Arnie has.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const records = read('../../supabase/functions/_shared/arnieRecords.ts')
const panel = read('../pages/agents/arnie/ArnieAtWork.jsx')
const setup = read('../pages/agents/arnie/ArnieSetup.jsx')
const migration = read('../../supabase/migrations/20260920120000_ai_usage_admin_read_fix.sql')

const now = new Date('2026-09-20T20:00:00Z')
const ago = (d) => new Date(now.getTime() - d * 86400000).toISOString()
const employees = [{ id: 133, name: 'Mike Sullivan', email: 'demo@jobscout.app' }, { id: 137, name: 'Jordan Lee', email: 'jordan@summitfieldco.com' }]
const rows = () => ({
  proposals: [
    { id: 1, created_by: 'demo@jobscout.app', target: 'won', status: 'applied', created_at: ago(1), request_text: 'Halifax signed' },
    { id: 2, created_by: 'jordan@summitfieldco.com', target: 'shift_open', status: 'rolled_back', created_at: ago(2), request_text: 'clock me in' },
    { id: 3, created_by: 'jordan@summitfieldco.com', target: 'lead', status: 'rejected', created_at: ago(3) },
    { id: 4, created_by: 'demo@jobscout.app', target: 'won', status: 'pending', created_at: ago(40), request_text: 'old one' },
    { id: 5, created_by: 'nobody@else.example', target: 'ticket', status: 'applied', created_at: ago(5) },
  ],
  sessions: [{ id: 1, session_id: 'S1', user_email: 'demo@jobscout.app', started: ago(1) }, { id: 2, session_id: 'S2', user_email: 'demo@jobscout.app', started: ago(50) }, { id: 3, session_id: 'S3', user_email: 'jordan@summitfieldco.com', started: ago(4) }],
  messages: [{ session_id: 'S1', role: 'user' }, { session_id: 'S1', role: 'assistant' }, { session_id: 'S1', role: 'user' }, { session_id: 'S2', role: 'user' }, { session_id: 'S3', role: 'user' }],
  usage: [{ est_cost_usd: 0.031, success: true, created_at: ago(1) }, { est_cost_usd: 0.02, success: false, created_at: ago(2) }, { est_cost_usd: 5, success: true, created_at: ago(60) }],
  employees,
})

describe('summarizeArnie', () => {
  it('counts only the window, joins messages by session_id, names people from the roster', () => {
    const s = summarizeArnie(rows(), 30, now)
    expect(s.conversations).toBe(2); expect(s.asked).toBe(3); expect(s.people).toBe(2)
    expect(s.drafted).toBe(4); expect(s.approved).toBe(2); expect(s.rejected).toBe(1); expect(s.rolledBack).toBe(1); expect(s.pending).toBe(0)
    expect(s.approvalRate).toBe(50)
    expect(s.calls).toBe(2); expect(s.failed).toBe(1); expect(s.cost).toBe(0.05)
    expect(s.persons.map((p) => p.name)).toEqual(['Jordan Lee', 'Mike Sullivan', 'nobody'])
    expect(s.persons[1]).toEqual({ name: 'Mike Sullivan', drafted: 1, approved: 1, conversations: 1 })
    expect(s.kinds[0]).toEqual({ kind: 'estimate won', drafted: 1, approved: 1 })
    expect(s.recent[0]).toMatchObject({ who: 'Mike Sullivan', kind: 'estimate won', status: 'approved', asked: 'Halifax signed' })
    expect(JSON.stringify(s)).not.toMatch(/@/)   // no email address reaches the screen
  })
  it('a wider window takes more in; an empty company is zeros, not NaN', () => {
    expect(summarizeArnie(rows(), 90, now).drafted).toBe(5)
    expect(summarizeArnie(rows(), 90, now).cost).toBe(5.05)
    const z = summarizeArnie({}, 30, now)
    expect(z).toMatchObject({ conversations: 0, asked: 0, drafted: 0, approvalRate: null, cost: 0, calls: 0, kinds: [], persons: [], recent: [] })
  })
  it('every create and record target Arnie has carries a person\'s name', () => {
    const targets = [...create.matchAll(/^  ([a-z_]+): \{\n\s+label:/gm)].map((m) => m[1])
    const recordTargets = [...records.matchAll(/^  ([a-z_]+): \{/gm)].map((m) => m[1])
    expect(targets.length).toBeGreaterThanOrEqual(13)
    for (const t of [...targets, ...recordTargets]) expect(TARGET_LABELS[t], t).toBeTruthy()
    expect(targetLabel('something_new')).toBe('something new')
  })
})

describe('the panel', () => {
  it('is admin-only, reads counts not transcripts, pages ai_usage past 1000 rows, joins on session_id', () => {
    expect(setup).toMatch(/\{isAdmin && <ArnieAtWork \/>\}/)
    expect(panel).toMatch(/from\('ai_messages'\)\.select\('session_id,role'\)/)
    expect(panel).not.toMatch(/select\('[^']*content/)
    expect(panel).toMatch(/pageAll\(\(from, to\) => supabase\.from\('ai_usage'\)/)
    expect(panel).toMatch(/\.map\(\(x\) => x\.session_id\)/)
  })
  it('the ai_usage read policy no longer joins auth.users (every client read failed with "permission denied for table users")', () => {
    expect(migration).toMatch(/drop policy if exists "Admins can read ai_usage"/)
    expect(migration).toMatch(/public\.current_user_access_level\(\) >= 3/)
    expect(migration.slice(migration.indexOf('create policy'))).not.toMatch(/auth\.users/)
  })
})
