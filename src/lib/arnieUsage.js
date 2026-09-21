// Arnie at work — what he did for the company, by the numbers.
//
// The owner's question is "is this thing earning its keep?" and the
// answer is in four tables nobody looks at: ai_sessions/ai_messages (the
// conversations), arnie_proposals (every card he drew and what happened to
// it), ai_usage (what he cost). This turns those rows into one screen.
// Pure — rows in, a summary out — so the numbers are pinned by tests.

// The audit-trail names → what a person calls them.
export const TARGET_LABELS = {
  lead: 'lead', diagnosis: 'diagnosis', ticket: 'ticket', appointment: 'appointment', quote: 'quote', followup: 'follow-up',
  payment: 'payment', memory: 'memory', expense: 'expense', company_setup: 'company setup', employee: 'employee', price_book: 'price book', won: 'estimate won', schedule: 'schedule',
  job_status: 'job status', job_note: 'job note', job_schedule: 'job date', lead_status: 'lead status', lead_note: 'lead note',
  shift_close: 'clock-out', shift_open: 'clock-in', lead_merge: 'lead merge', section_assign: 'dispatch',
  business_units: 'business units', lead_sources: 'lead sources', service_types: 'service types', upsells: 'upsells',
}
export const targetLabel = (t) => TARGET_LABELS[t] || String(t || '').replace(/_/g, ' ')

const STATUS = { applied: 'approved', rolled_back: 'rolled back', rejected: 'rejected', pending: 'waiting' }
export const statusLabel = (s) => STATUS[s] || s

/**
 * @param {object} rows
 * @param {any[]} rows.proposals   arnie_proposals: created_by, target, status, created_at, decided_at, request_text
 * @param {any[]} rows.sessions    ai_sessions (module arnie): session_id (text — what ai_messages joins on), user_email, started
 * @param {any[]} rows.messages    ai_messages: session_id, role
 * @param {any[]} rows.usage       ai_usage (feature arnie-chat): est_cost_usd, success
 * @param {any[]} rows.employees   id, name, email
 * @param {Date}  [now]
 * @param {number} days            the window
 */
export function summarizeArnie({ proposals = [], sessions = [], messages = [], usage = [], employees = [] }, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 86400000)
  const inWindow = (iso) => iso && new Date(iso) >= since
  const nameOf = (email) => {
    const e = String(email || '').toLowerCase()
    const emp = employees.find((x) => String(x.email || '').toLowerCase() === e)
    return emp?.name || (e ? e.split('@')[0] : 'unknown')
  }

  const ses = sessions.filter((s) => inWindow(s.started || s.created_at))
  const sessionIds = new Set(ses.map((s) => s.session_id ?? s.id))
  const asked = messages.filter((m) => m.role === 'user' && sessionIds.has(m.session_id)).length
  const people = new Map()
  for (const s of ses) { const k = nameOf(s.user_email); people.set(k, (people.get(k) || 0) + 1) }

  const props = proposals.filter((p) => inWindow(p.created_at))
  const byStatus = { applied: 0, rolled_back: 0, rejected: 0, pending: 0 }
  const byKind = new Map()
  const byPerson = new Map()
  for (const p of props) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1
    const k = targetLabel(p.target)
    const kind = byKind.get(k) || { kind: k, drafted: 0, approved: 0 }
    kind.drafted += 1; if (p.status === 'applied') kind.approved += 1
    byKind.set(k, kind)
    const who = nameOf(p.created_by)
    const person = byPerson.get(who) || { name: who, drafted: 0, approved: 0, conversations: people.get(who) || 0 }
    person.drafted += 1; if (p.status === 'applied') person.approved += 1
    byPerson.set(who, person)
  }
  for (const [name, conversations] of people) if (!byPerson.has(name)) byPerson.set(name, { name, drafted: 0, approved: 0, conversations })

  const use = usage.filter((u) => inWindow(u.created_at))
  const cost = Math.round(use.reduce((s, u) => s + (Number(u.est_cost_usd) || 0), 0) * 100) / 100
  const failed = use.filter((u) => u.success === false).length

  const recent = [...props].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12)
    .map((p) => ({ id: p.id, when: p.created_at, who: nameOf(p.created_by), kind: targetLabel(p.target), status: statusLabel(p.status), asked: String(p.request_text || p.summary || '').slice(0, 140) }))

  return {
    days,
    conversations: ses.length, asked, people: people.size,
    drafted: props.length, approved: byStatus.applied, rolledBack: byStatus.rolled_back, rejected: byStatus.rejected, pending: byStatus.pending,
    approvalRate: props.length ? Math.round((byStatus.applied / props.length) * 100) : null,
    kinds: [...byKind.values()].sort((a, b) => b.drafted - a.drafted),
    persons: [...byPerson.values()].sort((a, b) => b.drafted - a.drafted || b.conversations - a.conversations),
    calls: use.length, failed, cost,
    recent,
  }
}
