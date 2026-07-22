// Per-rep sales funnel: Meetings set → Takeoffs (estimates) → Closed (approved).
//
// Attribution notes (from the real data):
//  - Appointments carry salesperson_id (the rep the meeting is for) reliably.
//  - Quotes almost never carry salesperson_id, so a quote is attributed to its
//    lead's owner: lead.salesperson_id || lead.lead_owner_id.
//  - "Closed" = a quote in status 'Approved' (the lead's Won status is
//    under-set, so counting approved quotes is the accurate close signal).

export function computeSalesFunnel({ appointments = [], quotes = [], leads = [], employees = [] } = {}, { sinceIso = null } = {}) {
  const inRange = (d) => !sinceIso || (!!d && String(d) >= sinceIso)
  const empName = new Map((employees || []).map((e) => [e.id, e.name]))
  const leadRep = new Map((leads || []).map((l) => [l.id, l.salesperson_id || l.lead_owner_id || null]))

  const rows = new Map()
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { repId: id, repName: empName.get(id) || `#${id}`, meetings: 0, takeoffs: 0, closed: 0, closedValue: 0 })
    return rows.get(id)
  }

  for (const a of appointments || []) {
    if (!a || !a.salesperson_id) continue
    if (a.appointment_type === 'Block') continue // blocked time isn't a meeting
    if (!inRange(a.start_time || a.created_at)) continue
    row(a.salesperson_id).meetings++
  }

  for (const q of quotes || []) {
    if (!q) continue
    const rep = q.salesperson_id || leadRep.get(q.lead_id) || null
    if (!rep) continue
    if (!inRange(q.created_at)) continue
    const r = row(rep)
    r.takeoffs++
    if (q.status === 'Approved') { r.closed++; r.closedValue += Number(q.quote_amount) || 0 }
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      // close rate = approved / estimates written
      closeRate: r.takeoffs ? Math.round((r.closed / r.takeoffs) * 100) : 0,
      // set→takeoff = did the meeting produce an estimate (capped at 100%)
      takeoffRate: r.meetings ? Math.min(100, Math.round((r.takeoffs / r.meetings) * 100)) : 0,
    }))
    .sort((a, b) => b.closed - a.closed || b.takeoffs - a.takeoffs || b.meetings - a.meetings)
}

export function funnelTotals(rows) {
  const t = (rows || []).reduce((s, r) => ({ meetings: s.meetings + r.meetings, takeoffs: s.takeoffs + r.takeoffs, closed: s.closed + r.closed }), { meetings: 0, takeoffs: 0, closed: 0 })
  return { ...t, closeRate: t.takeoffs ? Math.round((t.closed / t.takeoffs) * 100) : 0 }
}

// Cutoff ISO for a named window, or null for "all time".
export function funnelSince(range) {
  const now = new Date()
  if (range === 'mtd') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  if (range === 'ytd') return new Date(now.getFullYear(), 0, 1).toISOString()
  if (range === 'last90') { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString() }
  return null
}
