// THE REAL REBATE, WRITTEN BACK — the JobScout half of the SRP step.
//
// Cole's flow, the part after the estimate: "Then she goes into SRP's tool and
// builds the same thing there, gets the incentive from the tool, and adds it
// to the Job Scout quote." The estimate was built with an ESTIMATED rebate
// (or none); TrakSmart gives the real one, and with it the GMs change — more
// room means mounts and lift hours the customer still pays $0 for, less room
// means fewer.
//
// This card takes the real figure (from the computer agent reading TrakSmart,
// or from Cole saying it) and, by the same playbook that built the estimate:
//   - leaves every fixture line exactly as it is (JobScout is right)
//   - replaces the GM lines with the ones the real rebate allows
//   - sets the incentive to the lower of the rebate and the new subtotal
//   - records the annual savings TrakSmart reports, when given
// It only touches a Draft that has not been sent, and undo puts back exactly
// what was there.

// deno-lint-ignore-file no-explicit-any
import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import type { Prepared } from './arnieCreate.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import { parseTakeoff, planEstimate, playbookFor } from './lightingPlaybook.ts'

type Any = any
const money = (n: number) => Math.round(n * 100) / 100
const usd = (n: number) => '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (s: unknown) => { const n = Number(String(s ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : NaN }

/** A GM line, by what it is — the mount items and the lift item. */
export function isGmLine(l: { item_name?: string | null }): boolean {
  const n = String(l.item_name || '').trim()
  return /^MES Cobra Head Mount - /i.test(n) || /^ES LIFT$/i.test(n) || /^lift gm$/i.test(n)
}

const LINE_COLS = 'id,item_id,item_name,quantity,price,line_total,description,in_utility_scope,sort_order,notes,kind'

export async function prepareSrpRebate(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const rebate = num(f.rebate)
  if (!(rebate > 0)) return { ok: false, error: 'What is the SRP rebate TrakSmart gave? I need the dollar figure.' }
  const savings = f.annual_savings ? num(f.annual_savings) : null
  if (savings != null && !(savings >= 0)) return { ok: false, error: `"${f.annual_savings}" is not an annual savings figure.` }

  const t = String(f.quote || '').trim()
  if (!t) return { ok: false, error: 'Which estimate is the rebate for?' }
  const idNum = Number((t.match(/^#?(\d+)$/) || [])[1])
  const sel = 'id,quote_id,estimate_name,status,last_sent_at,job_id,takeoff,quote_amount,utility_incentive,manual_annual_savings'
  const rows = idNum
    ? await readRecordList(r, `quotes?select=${sel}&company_id=eq.${companyId}&id=eq.${idNum}&limit=1`)
    : await readRecordList(r, `quotes?select=${sel}&company_id=eq.${companyId}&or=(quote_id.ilike.*${encodeURIComponent(t)}*,estimate_name.ilike.*${encodeURIComponent(t)}*)&order=created_at.desc&limit=6`)
  if (!rows.length) return { ok: false, error: `No estimate matching "${t}".` }
  if (rows.length > 1) return { needs_choice: rows.map((q: Any) => ({ id: q.id, label: `${q.quote_id || '#' + q.id} — ${q.estimate_name || 'unnamed'} (${q.status})` })), message: 'More than one estimate matches. Ask which, then call again with its number.' }
  const q = rows[0]
  const ref = q.quote_id || `#${q.id}`
  if (q.status !== 'Draft' || q.last_sent_at || q.job_id) return { ok: false, error: `${ref} is ${q.status}${q.last_sent_at ? ' and has been sent' : ''} — I only redo the GMs on a draft nobody has sent. Change it on the Estimates page.` }
  const tk = q.takeoff
  const playbook = playbookFor(tk?.playbook)
  if (!tk || !playbook) return { ok: false, error: `${ref} was not built from a takeoff, so I do not know which fixtures are on a lift or how they mount. Set the GMs on the Estimates page, or ask me to rebuild it from the takeoff.` }
  const items = parseTakeoff(tk.items, playbook)
  if (typeof items === 'string') return { ok: false, error: `The takeoff saved on ${ref} no longer reads: ${items}` }

  const lines = await readRecordList(r, `quote_lines?select=${LINE_COLS}&company_id=eq.${companyId}&quote_id=eq.${q.id}&order=sort_order.asc&limit=500`)
  const oldGms = lines.filter(isGmLine)
  const fixtures = lines.filter((l: Any) => !isGmLine(l))
  const fixtureSubtotal = money(fixtures.reduce((s: number, l: Any) => s + (Number(l.line_total) || (Number(l.quantity) || 0) * (Number(l.price) || 0)), 0))

  const catalog = await readRecordList(r, `products_services?select=id,name,unit_price,type&company_id=eq.${companyId}&active=eq.true&type=eq.${encodeURIComponent(playbook.catalog_type)}&limit=3000`)
  const plan = planEstimate(items, catalog, { rebateGiven: rebate, state: tk.state || null, fixtureSubtotal, playbook })
  if (!plan.ok) return { ok: false, error: plan.error }
  const newGms = plan.lines.filter((l) => l.role !== 'fixture')

  const oldTotal = money(Number(q.quote_amount) || 0)
  const show = (ls: Any[]) => ls.length ? ls.map((l) => `${l.quantity} × ${String(l.item_name).trim()} @ ${usd(Number(l.price))}`).join('; ') : 'none'
  return {
    ok: true,
    columns: {
      quote_id: q.id, quote_ref: ref,
      fixture_ids: fixtures.map((l: Any) => l.id), fixture_subtotal: fixtureSubtotal,
      old_gms: oldGms, new_gms: newGms.map((l) => ({ item_id: l.item_id, item_name: l.item_name.trim(), quantity: l.quantity, price: l.price, description: l.description })),
      before: { quote_amount: q.quote_amount, utility_incentive: q.utility_incentive, manual_annual_savings: q.manual_annual_savings },
      after: { quote_amount: plan.subtotal, utility_incentive: plan.incentive, ...(savings != null ? { manual_annual_savings: money(savings) } : {}) },
    },
    display: [
      { label: 'Estimate', value: `${ref} — ${q.estimate_name || ''}`.trim() },
      { label: 'SRP rebate (TrakSmart)', value: usd(rebate) },
      { label: 'Fixtures', value: `${usd(fixtureSubtotal)} — unchanged` },
      { label: 'GMs now', value: show(oldGms) },
      { label: 'GMs after', value: show(newGms) },
      { label: 'Total', value: `${usd(oldTotal)} → ${usd(plan.subtotal)}` },
      { label: 'Incentive', value: `${usd(Number(q.utility_incentive) || 0)} → ${usd(plan.incentive)}` },
      { label: 'Customer pays', value: usd(plan.out_of_pocket) },
      ...(savings != null ? [{ label: 'Annual savings', value: usd(savings) }] : []),
      { label: 'GMs', value: plan.gm_note },
      { label: 'Status', value: 'Still a Draft — nothing is sent' },
    ],
  }
}

export async function applySrpRebate(r: Rest, companyId: number, prop: Any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string; stale?: boolean }> {
  const c = prop.payload?.columns || {}
  const id = Number(c.quote_id)
  if (!id) return { ok: false, error: 'That draft is missing its estimate.' }
  const [q] = await readRecordList(r, `quotes?select=id,status,last_sent_at,job_id&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
  if (!q) return { ok: false, error: 'That estimate is no longer there.' }
  if (q.status !== 'Draft' || q.last_sent_at || q.job_id) return { ok: false, stale: true, error: `It is ${q.status} now — not changing it.` }
  // The fixture lines must be the ones the card was drafted against.
  const lines = await readRecordList(r, `quote_lines?select=${LINE_COLS}&company_id=eq.${companyId}&quote_id=eq.${id}&order=sort_order.asc&limit=500`)
  const fixtures = lines.filter((l: Any) => !isGmLine(l))
  const sum = money(fixtures.reduce((s: number, l: Any) => s + (Number(l.line_total) || 0), 0))
  const same = fixtures.length === (c.fixture_ids || []).length && fixtures.every((l: Any) => (c.fixture_ids || []).includes(l.id)) && sum === money(Number(c.fixture_subtotal))
  if (!same) return { ok: false, stale: true, error: 'The estimate\'s lines changed since I drafted this. Ask me again and I will redo the GMs on what is there now.' }

  const H = { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' }
  const gms = lines.filter(isGmLine)
  if (gms.length) await fetch(`${r.url}/rest/v1/quote_lines?company_id=eq.${companyId}&id=in.(${gms.map((g: Any) => g.id).join(',')})`, { method: 'DELETE', headers: H })
  let sort = Math.max(-1, ...fixtures.map((l: Any) => Number(l.sort_order) || 0)) + 1
  const rows = (c.new_gms || []).map((g: Any) => ({
    company_id: companyId, quote_id: id, item_id: g.item_id, item_name: g.item_name, quantity: g.quantity, price: g.price,
    line_total: money(g.quantity * g.price), description: g.description, in_utility_scope: true, sort_order: sort++,
  }))
  let inserted: number[] = []
  if (rows.length) {
    const res = await fetch(`${r.url}/rest/v1/quote_lines`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows) })
    if (!res.ok) {
      // Put the old GMs back before reporting, so a failed write is no change.
      if (gms.length) await fetch(`${r.url}/rest/v1/quote_lines`, { method: 'POST', headers: H, body: JSON.stringify(gms.map(({ id: _id, ...g }: Any) => ({ ...g, company_id: companyId, quote_id: id }))) })
      return { ok: false, error: `Could not write the GM lines: ${res.status} ${await res.text()}` }
    }
    inserted = ((await res.json()) || []).map((x: Any) => x.id)
  }
  await patchRow(r, 'quotes', companyId, id, { ...c.after, updated_at: new Date().toISOString() })
  return { ok: true, id, label: prop.payload?.entity_label || c.quote_ref || 'estimate', created: { quote_id: id, inserted_gm_ids: inserted } }
}

export async function rollbackSrpRebate(r: Rest, companyId: number, prop: Any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const c = prop.payload?.columns || {}
  const id = Number(c.quote_id)
  const [q] = await readRecordList(r, `quotes?select=id,status,last_sent_at,job_id&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
  if (!q) return { ok: true, deleted: id }
  if (q.status !== 'Draft' || q.last_sent_at || q.job_id) return { ok: false, error: `Can't undo — that estimate is ${q.status} now.` }
  const H = { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' }
  const made: number[] = prop.payload?.created?.inserted_gm_ids || []
  if (made.length) await fetch(`${r.url}/rest/v1/quote_lines?company_id=eq.${companyId}&quote_id=eq.${id}&id=in.(${made.join(',')})`, { method: 'DELETE', headers: H })
  const old: Any[] = c.old_gms || []
  if (old.length) {
    const res = await fetch(`${r.url}/rest/v1/quote_lines`, { method: 'POST', headers: H, body: JSON.stringify(old.map(({ id: _id, ...g }: Any) => ({ ...g, company_id: companyId, quote_id: id }))) })
    if (!res.ok) return { ok: false, error: `Could not restore the old GM lines: ${res.status} ${await res.text()}` }
  }
  await patchRow(r, 'quotes', companyId, id, { ...(c.before || {}), updated_at: new Date().toISOString() })
  return { ok: true, deleted: id }
}
