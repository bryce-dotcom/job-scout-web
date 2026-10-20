// "Delete it and let's start again" — an estimate deleted through the card
// rail, with undo.
//
// Cole, 2026-10-20: "delete it and lets start again", and Jenny answered "I
// can't delete estimates" — but Cole can, from the estimate page (Delete →
// "This cannot be undone"). Bryce's rule: Arnie can do what the user can.
// Through a card it is BETTER than the page: the person approves it, and undo
// puts back exactly what was there — the estimate, its lines, its message
// thread, and every record that pointed at it.
//
// Refused when work has come of it: a job or a payment references the
// estimate (the database would refuse too — NO ACTION). Allowed for the
// estimate's own rep, or a manager and up.

// deno-lint-ignore-file no-explicit-any
import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import type { Prepared } from './arnieCreate.ts'
import { readRecordList } from './arnieRest.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const usd = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function findQuote(r: Rest, companyId: number, said: string) {
  const t = String(said || '').trim().replace(/[*,()]/g, '')
  const num = Number((t.match(/^#?(\d+)$/) || [])[1])
  const sel = 'id,quote_id,estimate_name,status,quote_amount,salesperson_id,lead_id,job_id,created_at'
  if (num) return readRecordList(r, `quotes?select=${sel}&company_id=eq.${companyId}&or=(id.eq.${num},quote_id.eq.${num})&limit=3`)
  return readRecordList(r, `quotes?select=${sel}&company_id=eq.${companyId}&or=(quote_id.ilike.*${encodeURIComponent(t)}*,estimate_name.ilike.*${encodeURIComponent(t)}*)&order=created_at.desc&limit=6`)
}

export async function prepareQuoteDelete(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const said = String(f.quote || '').trim()
  if (!said) return { ok: false, error: 'Which estimate? Give its number or name.' }
  const rows = await findQuote(r, companyId, said)
  if (!rows.length) return { ok: false, error: `No estimate matching "${said}".` }
  if (rows.length > 1) {
    return { needs_choice: rows.map((q: any) => ({ id: q.id, label: `${q.quote_id || '#' + q.id} — ${q.estimate_name || 'unnamed'} (${q.status}, ${usd(Number(q.quote_amount) || 0)})` })),
      message: 'More than one estimate matches. Ask which, then call again with its number.' }
  }
  const q = rows[0]
  const ref = q.quote_id || `#${q.id}`
  const mine = caller.employeeId != null && String(q.salesperson_id) === String(caller.employeeId)
  if (!mine && caller.level < 2) return { ok: false, error: `${ref} is not your estimate — its rep or a manager can delete it.` }
  const [job] = await readRecordList(r, `jobs?select=job_id,job_title&company_id=eq.${companyId}&quote_id=eq.${q.id}&limit=1`)
  if (q.job_id || job) return { ok: false, error: `${ref} became a job${job ? ` (${job.job_title || job.job_id})` : ''} — it cannot be deleted. Change or cancel the job instead.` }
  const [pay] = await readRecordList(r, `payments?select=id&company_id=eq.${companyId}&quote_id=eq.${q.id}&limit=1`)
  if (pay) return { ok: false, error: `${ref} has a payment recorded against it — it cannot be deleted.` }
  const lines = await readRecordList(r, `quote_lines?select=id&quote_id=eq.${q.id}&limit=500`)
  return {
    ok: true,
    columns: { quote_row_id: q.id, quote_ref: ref },
    display: [
      { label: 'Delete', value: `${ref} — ${q.estimate_name || 'unnamed'}` },
      { label: 'Status', value: String(q.status || '') },
      { label: 'Amount', value: usd(Number(q.quote_amount) || 0) },
      { label: 'Lines', value: `${lines.length} line${lines.length === 1 ? '' : 's'} go with it` },
      { label: 'Undo', value: 'Undo puts the estimate, its lines and its messages back exactly as they were' },
    ],
  }
}

export async function applyQuoteDelete(r: Rest, companyId: number, prop: any) {
  const id = Number(prop.payload?.columns?.quote_row_id)
  if (!id) return { ok: false as const, error: 'That draft is missing its estimate.' }
  const [quote] = await readRecordList(r, `quotes?select=*&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
  if (!quote) return { ok: false as const, stale: true, error: 'That estimate is already gone.' }
  if (quote.job_id) return { ok: false as const, stale: true, error: 'It became a job since I drafted this — not deleting it.' }
  // Everything undo needs, taken now — what CASCADEs, and what is set to null.
  const [lines, messages, submissions, expenses, attachments, bids] = await Promise.all([
    readRecordList(r, `quote_lines?select=*&quote_id=eq.${id}&limit=2000`),
    readRecordList(r, `estimate_messages?select=*&quote_id=eq.${id}&limit=2000`),
    readRecordList(r, `bid_submissions?select=*&quote_id=eq.${id}&limit=200`),
    readRecordList(r, `expenses?select=id&company_id=eq.${companyId}&quote_id=eq.${id}&limit=2000`),
    readRecordList(r, `file_attachments?select=id&quote_id=eq.${id}&limit=2000`),
    readRecordList(r, `bid_opportunities?select=id&quote_id=eq.${id}&limit=200`),
  ])
  const del = await fetch(`${r.url}/rest/v1/quotes?company_id=eq.${companyId}&id=eq.${id}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  if (!del.ok) return { ok: false as const, error: `Could not delete it: ${del.status} ${await del.text()}` }
  return {
    ok: true as const, id, label: `${prop.payload?.columns?.quote_ref || 'estimate'} deleted`,
    created: {
      snapshot: { quote, lines, messages, submissions },
      relinks: { expenses: expenses.map((x: any) => x.id), file_attachments: attachments.map((x: any) => x.id), bid_opportunities: bids.map((x: any) => x.id) },
    },
  }
}

export async function rollbackQuoteDelete(r: Rest, companyId: number, prop: any) {
  const snap = prop.payload?.created?.snapshot
  const relinks = prop.payload?.created?.relinks || {}
  if (!snap?.quote) return { ok: false as const, error: 'Nothing to put back.' }
  const post = async (table: string, rows: any[]) => {
    if (!rows?.length) return null
    const res = await fetch(`${r.url}/rest/v1/${table}`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
    return res.ok ? null : `${table}: ${res.status} ${await res.text()}`
  }
  const errQ = await post('quotes', [snap.quote])
  if (errQ) return { ok: false as const, error: `Could not restore the estimate: ${errQ}` }
  for (const [t, rows] of [['quote_lines', snap.lines], ['estimate_messages', snap.messages], ['bid_submissions', snap.submissions]] as const) {
    const e = await post(t, rows as any[]); if (e) return { ok: false as const, error: `Estimate restored, but ${e}` }
  }
  for (const [t, ids] of Object.entries(relinks) as [string, number[]][]) {
    if (!ids?.length) continue
    await fetch(`${r.url}/rest/v1/${t}?id=in.(${ids.join(',')})`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ quote_id: snap.quote.id }) })
  }
  return { ok: true as const, deleted: 0 }
}
