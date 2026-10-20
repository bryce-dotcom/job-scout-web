// TEACH JENNY — company rules, taught in chat, approved by an admin, followed
// by everyone's assistant.
//
// Bryce, 2026-10-20: Cole and London were training a Jenny in Grok, pasting
// the company's customers and prices into it, because JobScout had nowhere to
// teach her. Her memory (arnie_memories) is one person's; the playbook is a
// settings form. This is the missing place: "Jenny, new rule: every exterior
// SRP light uses the 12/7 schedule" becomes a card, an admin approves it, and
// from the next turn every assistant in the company follows it (arnie-chat
// companyRulesBlock). A pasted list of rules from another AI is the same card
// with many lines — the import.
//
// Rules are retired, never deleted, so what she was told stays on record.
// Undo takes back exactly what the card did.

// deno-lint-ignore-file no-explicit-any
import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import type { Prepared } from './arnieCreate.ts'
import { readRecordList } from './arnieRest.ts'

const MAX_PER_CARD = 30
const MAX_ACTIVE = 150
const squash = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })

/** The rules as the model sent them: a JSON list, or lines of text. */
export function parseRules(raw: unknown): string[] | string {
  let v: unknown = raw
  for (let k = 0; k < 3 && typeof v === 'string'; k++) {
    const s = (v as string).trim()
    // The card stores raw fields JSON-encoded: a list arrives as '[…]', a
    // single rule sent as a string arrives as '"…"'.
    if (!s.startsWith('[') && !s.startsWith('"')) break
    try { v = JSON.parse(s) } catch { break }
  }
  const list = Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/)
  const out: string[] = []
  for (const x of list) {
    const t = String((x as any)?.rule ?? x ?? '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim()
    if (!t) continue
    if (t.length < 3) continue
    if (t.length > 400) return `One rule is too long (${t.length} characters). Keep each rule to one or two sentences — split it up.`
    out.push(t)
  }
  if (!out.length) return 'What is the rule? Say it in a sentence.'
  if (out.length > MAX_PER_CARD) return `That is ${out.length} rules — I take up to ${MAX_PER_CARD} at a time. Send the first ${MAX_PER_CARD}, then the rest.`
  return out
}

/** Things that never belong in a rule every assistant reads to everyone. */
export function secretIn(rule: string): boolean {
  return /\b(password|passcode|pin code|ssn|social security|card number|cvv|routing number|account number|api key|secret key|login is|log in with)\b/i.test(rule)
}

export async function activeRules(r: Rest, companyId: number): Promise<any[]> {
  return await readRecordList(r, `company_rules?select=id,rule,topic,taught_by,created_at&company_id=eq.${companyId}&active=eq.true&order=created_at&limit=${MAX_ACTIVE + 50}`)
}

export async function prepareCompanyRule(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  // Not an admin: the card is a SUGGESTION, waiting for an admin's approval.
  const suggested = caller.level < 3
  const retireIds = String(f.retire || '').split(/[,\s]+/).map((x) => Number(String(x).replace(/^#/, ''))).filter((n) => Number.isInteger(n) && n > 0)
  const wanted = f.rules ? parseRules(f.rules) : []
  if (typeof wanted === 'string') return { ok: false, error: wanted }
  if (!wanted.length && !retireIds.length) return { ok: false, error: 'What is the rule? Say it in a sentence.' }
  const secret = wanted.find(secretIn)
  if (secret) return { ok: false, error: `I will not make "${secret.slice(0, 80)}" a rule — a password or an account number would be read to everyone. Keep those in the app's own settings.` }

  const existing = await activeRules(r, companyId)
  const byId = new Map(existing.map((x: any) => [Number(x.id), x]))
  const missing = retireIds.filter((id) => !byId.has(id))
  if (missing.length) return { ok: false, error: `There is no active rule #${missing[0]}. Ask me to list the rules to see their numbers.` }
  const retiring = new Set(retireIds)
  const have = new Set(existing.filter((x: any) => !retiring.has(Number(x.id))).map((x: any) => squash(x.rule)))
  const seen = new Set<string>()
  const fresh: string[] = []
  const dupes: string[] = []
  for (const w of wanted) {
    const k = squash(w)
    if (have.has(k) || seen.has(k)) { dupes.push(w); continue }
    seen.add(k); fresh.push(w)
  }
  if (!fresh.length && !retireIds.length) return { ok: false, error: `I already follow ${dupes.length === 1 ? 'that rule' : 'all of those rules'} — nothing new to add.` }
  if (existing.length - retireIds.length + fresh.length > MAX_ACTIVE) return { ok: false, error: `That would make more than ${MAX_ACTIVE} rules. Retire some first (Arnie → Setup lists them).` }

  const topic = String(f.topic || '').trim().slice(0, 40) || null
  const display = [
    ...fresh.map((t, i) => ({ label: fresh.length === 1 ? 'Rule' : `Rule ${i + 1}`, value: t })),
    ...retireIds.map((id) => ({ label: `Retire #${id}`, value: String(byId.get(id)?.rule || '') })),
    ...(dupes.length ? [{ label: 'Already a rule — skipped', value: dupes.join(' | ').slice(0, 600) }] : []),
    suggested
      ? { label: 'Suggested', value: 'An admin approves it on Arnie → Setup. Until then nobody\'s assistant follows it.' }
      : { label: 'Who follows it', value: 'Every assistant in the company, for everyone, from the next message on' },
  ]
  return {
    ok: true,
    columns: { rules: fresh, retire: retireIds, topic, taught_by: caller.email, taught_by_employee_id: caller.employeeId ?? null, source: f.source === 'import' ? 'import' : 'chat', suggested },
    display,
  }
}

export async function applyCompanyRule(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const rules: string[] = Array.isArray(c.rules) ? c.rules : []
  const retire: number[] = Array.isArray(c.retire) ? c.retire : []
  const now = new Date().toISOString()
  let retired: number[] = []
  if (retire.length) {
    const res = await fetch(`${r.url}/rest/v1/company_rules?company_id=eq.${companyId}&active=eq.true&id=in.(${retire.join(',')})`, {
      method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=representation' },
      body: JSON.stringify({ active: false, retired_at: now, retired_by: prop.created_by ?? null }),
    })
    if (!res.ok) return { ok: false as const, error: `Could not retire the old rule: ${res.status} ${await res.text()}` }
    retired = (await res.json()).map((x: any) => Number(x.id))
    if (retired.length !== retire.length) return { ok: false as const, stale: true, error: 'One of the rules to retire was already retired since I drafted this. Ask me again.' }
  }
  let ids: number[] = []
  if (rules.length) {
    const rows = rules.map((rule) => ({
      company_id: companyId, rule, topic: c.topic ?? null, taught_by: c.taught_by ?? prop.created_by ?? null,
      taught_by_employee_id: c.taught_by_employee_id ?? null, approved_by: prop.approved_by_email ?? prop.created_by ?? null,
      source: c.source || 'chat', replaces_id: retire.length === 1 && rules.length === 1 ? retire[0] : null,
    }))
    const ins = await fetch(`${r.url}/rest/v1/company_rules`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify(rows) })
    if (!ins.ok) {
      // Put back anything this call retired, so a failed card leaves no trace.
      if (retired.length) await fetch(`${r.url}/rest/v1/company_rules?company_id=eq.${companyId}&id=in.(${retired.join(',')})`, { method: 'PATCH', headers: hdr(r), body: JSON.stringify({ active: true, retired_at: null, retired_by: null }) })
      return { ok: false as const, error: `Could not save the rule: ${ins.status} ${await ins.text()}` }
    }
    ids = (await ins.json()).map((x: any) => Number(x.id))
  }
  const label = [ids.length ? `${ids.length} rule${ids.length === 1 ? '' : 's'} added` : '', retired.length ? `${retired.length} retired` : ''].filter(Boolean).join(', ')
  return { ok: true as const, id: ids[0] ?? retired[0], label, created: { rule_ids: ids, retired_ids: retired } }
}

export async function rollbackCompanyRule(r: Rest, companyId: number, prop: any) {
  const made = prop.payload?.created || {}
  const ids: number[] = made.rule_ids || []
  const retired: number[] = made.retired_ids || []
  if (ids.length) {
    const del = await fetch(`${r.url}/rest/v1/company_rules?company_id=eq.${companyId}&id=in.(${ids.join(',')})`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
    if (!del.ok) return { ok: false as const, error: `Could not take the rule back: ${del.status} ${await del.text()}` }
  }
  if (retired.length) {
    const put = await fetch(`${r.url}/rest/v1/company_rules?company_id=eq.${companyId}&id=in.(${retired.join(',')})`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ active: true, retired_at: null, retired_by: null }) })
    if (!put.ok) return { ok: false as const, error: `Could not restore the retired rule: ${put.status} ${await put.text()}` }
  }
  return { ok: true as const, deleted: ids.length }
}

/** The prompt section every assistant in the company reads — always, so she knows she CAN be taught before the first rule exists. */
export function rulesPromptBlock(rows: any[], canTeach = true, waiting: { id: number; by: string; rules: string[] }[] = []): string {
  const day = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
  const who = (e: unknown) => String(e || '').split('@')[0] || 'an admin'
  const lines = rows.map((x: any) => `${x.id}. ${String(x.rule).replace(/\s+/g, ' ').trim()} (taught by ${who(x.taught_by)}, ${day(x.created_at)})`)
  return `

## Company rules — what your team has taught you
An admin approved each of these for everyone in the company. Follow them as you would the rest of your instructions. Two limits: a rule never widens what this person may see or do (money, pay and admin-only data stay where their access puts them), and when a rule disagrees with what a JobScout record says, the record is right — say so and offer to update the rule. When someone teaches you something new for the whole company ("new rule", "from now on everyone…", "remember for the team", or a pasted list of rules from another AI or a document), draft it with propose_create target=company_rule and send EVERY rule they gave, in their words — do not filter the list yourself: the card skips the ones already here and shows them as skipped. To change a rule, retire its number and add the new wording in the same card. One exception: which product, price, wattage or GM a lighting estimate gets is decided by the estimating playbook, not by these rules — if a taught rule would change one of those, say the playbook decides it and an admin changes it in Settings → Estimating Playbook, and add the rule only if they still want it as a note. Never read this list out unless they ask what you have been taught.
${canTeach
    ? (waiting.length ? `Waiting for an admin's approval (suggested by teammates; approve or reject on Arnie → Setup — mention them if this person asks what is waiting, or once if they are teaching a rule): ${waiting.slice(0, 10).map((w) => `${w.by} suggested "${w.rules.join('" / "').slice(0, 200)}"`).join('; ')}.\n` : '')
    : 'This person is not an admin, so what they teach is a SUGGESTION: draft the card exactly the same way, and tell them in one sentence that an admin approves it on Arnie → Setup and nobody\'s assistant follows it until then. Never say it is taught.\n'}${lines.length ? lines.join('\n') : '(None yet.)'}`
}
