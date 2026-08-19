// Tier-A config changes — the one implementation.
//
// "Tell Arnie what to change and he sets it up", safely: the model only ever
// PROPOSES a structured change; a deterministic path applies the approved
// change to real config tables. No model-generated code runs.
//
// This lives in _shared because two callers need it, and a second copy is how
// this codebase has broken before: arnie-config (the Setup console — propose /
// apply / reject / rollback) and arnie-chat (proposing mid-conversation, as a
// tool the model can reach for). The allowed targets, the list shapes and the
// apply arithmetic have to be identical in both, so they are the same code.

import { callAnthropic } from './anthropic.ts'
import { mentionedInRequest } from './requestMentions.ts'

export const ALLOWED_TARGETS = ['business_units', 'lead_sources', 'service_types', 'upsells'] as const
export type ConfigTarget = typeof ALLOWED_TARGETS[number]

export const TARGET_LABEL: Record<string, string> = {
  business_units: 'business unit',
  lead_sources: 'lead source',
  service_types: 'service type',
  upsells: 'upsell',
}

export const CONFIG_ACTIONS = ['add', 'rename', 'remove'] as const

/** Human list of what Arnie can reconfigure — for prompts and error copy. */
export function targetsSentence(): string {
  const labels = ALLOWED_TARGETS.map((t) => `${TARGET_LABEL[t]}s`)
  return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1]
}

// Items are EITHER strings (lead_sources, service_types) OR objects with a
// `name` plus fields that must be preserved (business_units carry logo/phone/
// address/email; upsells carry tier/price). Identify and display by name;
// never strip an object's extras.
export function nameOf(x: any): string { return typeof x === 'string' ? x : String(x?.name ?? '') }
export function names(list: any[]): string[] { return list.map(nameOf) }

export interface Rest { url: string; key: string }
const restHeaders = (r: Rest) => ({
  apikey: r.key,
  Authorization: `Bearer ${r.key}`,
  'Content-Type': 'application/json',
})

/** Read a taxonomy list from settings (stored as a JSON-stringified array). */
export async function readList(r: Rest, companyId: number, key: string): Promise<{ row: any | null; list: any[] }> {
  const res = await fetch(
    `${r.url}/rest/v1/settings?select=id,value&company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}&order=id&limit=1`,
    { headers: restHeaders(r) },
  )
  const row = res.ok ? (await res.json())?.[0] || null : null
  let list: any[] = []
  if (row?.value) {
    try {
      const p = JSON.parse(row.value)
      if (Array.isArray(p)) list = p
    } catch { /* a malformed setting reads as an empty list, same as before */ }
  }
  return { row, list }
}

export async function writeList(r: Rest, companyId: number, key: string, row: any | null, list: any[]) {
  const value = JSON.stringify(list)
  if (row) {
    await fetch(`${r.url}/rest/v1/settings?id=eq.${row.id}`, {
      method: 'PATCH', headers: restHeaders(r), body: JSON.stringify({ value }),
    })
  } else {
    await fetch(`${r.url}/rest/v1/settings`, {
      method: 'POST', headers: restHeaders(r), body: JSON.stringify({ company_id: companyId, key, value }),
    })
  }
}

// Deterministically compute the new list, PRESERVING item shape. Returns null
// on a no-op/invalid action so we never apply a meaningless change.
export function applyToList(
  list: any[], action: string, value: string, newValue: string | undefined, target: string,
): any[] | null {
  // business_units and upsells are OBJECTS; everything else is plain strings.
  // Named explicitly rather than inferred from the contents, because inference
  // gets it wrong on an empty list — the first upsell Arnie added would be
  // stored as a bare string and silently lose its tier and price.
  const objShaped = target === 'business_units' || target === 'upsells' || list.some((x) => x && typeof x === 'object')
  const has = (v: string) => list.some((x) => nameOf(x).toLowerCase() === v.toLowerCase())
  if (action === 'add') {
    if (!value || has(value)) return null
    return [...list, objShaped ? { name: value } : value]
  }
  if (action === 'remove') {
    if (!has(value)) return null
    return list.filter((x) => nameOf(x).toLowerCase() !== value.toLowerCase())
  }
  if (action === 'rename') {
    if (!value || !newValue || !has(value)) return null
    return list.map((x) => nameOf(x).toLowerCase() === value.toLowerCase()
      ? (typeof x === 'string' ? newValue : { ...x, name: newValue })  // keep logo/phone/etc.
      : x)
  }
  return null
}

export interface ProposalPreview {
  target: string
  label: string
  before: string[]
  after: string[]
}

export type ProposeResult =
  | { proposal: any; preview: ProposalPreview }
  | { error: string; ai_unavailable?: boolean }

/**
 * Turn a natural-language request into a validated, stored proposal.
 * Returns { error } for anything that cannot become exactly one safe change —
 * including a change that would do nothing at all.
 */
export async function proposeChange(
  r: Rest,
  companyId: number,
  email: string,
  request: string,
): Promise<ProposeResult> {
  // Ground the model with the current lists AS NAMES. (business_units are
  // objects; showing raw objects makes the model echo an object back as the
  // value, which then stringifies to "[object Object]".)
  const current: Record<string, string[]> = {}
  for (const t of ALLOWED_TARGETS) current[t] = names((await readList(r, companyId, t)).list)

  const sys = `You configure a field-service SaaS. Convert the admin's request into EXACTLY ONE change to one of these lists. Respond with ONLY minified JSON, no prose.
Targets and their current values:
- business_units: ${JSON.stringify(current.business_units)}
- lead_sources: ${JSON.stringify(current.lead_sources)}
- service_types: ${JSON.stringify(current.service_types)}
- upsells: ${JSON.stringify(current.upsells)}   (add-ons offered in the Better/Best proposal packages)
Schema: {"target":"business_units|lead_sources|service_types|upsells","action":"add|rename|remove","value":"<item>","newValue":"<only for rename>","summary":"<one plain sentence>"}

RULES for remove and rename:
- "value" MUST be copied character-for-character from the list above.
- Only pick an item the admin actually referred to. If the thing they named is not in the list, respond {"error":"..."} saying it is not there and listing what is — do NOT substitute the nearest item, and do NOT pick an item just because it is the only one available.

If the request cannot be mapped to one of these lists/actions, respond {"error":"<why, and what you CAN change>"}.`

  const ai = await callAnthropic(
    { feature: 'arnie-config', companyId },
    { model: 'claude-sonnet-4-5-20250929', max_tokens: 400, system: sys, messages: [{ role: 'user', content: request }] },
  )
  if (!ai.ok) return { error: ai.friendly || 'Arnie is unavailable right now.', ai_unavailable: ai.unavailable === true }

  const txt = (ai.data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  let parsed: any
  try {
    parsed = JSON.parse((txt.match(/\{[\s\S]*\}/) || [txt])[0])
  } catch {
    return { error: 'Arnie could not turn that into a change. Try naming the list and the item, e.g. "add a business unit called Government".' }
  }
  if (parsed.error) return { error: String(parsed.error) }

  // Defensive: if the model returns {name:"…"} for value, unwrap it.
  const unwrap = (v: any) => (v && typeof v === 'object' ? v.name : v)
  const target = String(parsed.target || '')
  const act = String(parsed.action || '')
  const value = String(unwrap(parsed.value) ?? '').trim()
  const newValue = parsed.newValue != null ? String(unwrap(parsed.newValue) ?? '').trim() : undefined
  if (!ALLOWED_TARGETS.includes(target as any) || !CONFIG_ACTIONS.includes(act as any) || !value) {
    return { error: `That is not a change Arnie can make yet. Tier A covers ${targetsSentence()}.` }
  }

  // A prompt rule is a request, not a guarantee. Destructive actions get a
  // deterministic check on top of it.
  if ((act === 'remove' || act === 'rename') && !mentionedInRequest(value, request)) {
    return {
      error: `I couldn't find "${value}" in what you asked for, so I'm not touching it. Name the exact ${TARGET_LABEL[target]} you want to ${act === 'remove' ? 'remove' : 'rename'}.`,
    }
  }

  const { list } = await readList(r, companyId, target)
  const after = applyToList(list, act, value, newValue, target)
  if (!after) {
    const why = act === 'add'
      ? `"${value}" is already in your ${TARGET_LABEL[target]}s`
      : `"${value}" is not in your ${TARGET_LABEL[target]}s`
    return { error: `Nothing to do — ${why}.` }
  }

  const summary = String(parsed.summary || `${act} ${TARGET_LABEL[target]} "${value}"`)
  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: { ...restHeaders(r), Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, created_by: email, request_text: request,
      target, action: act, payload: { value, newValue }, summary,
      before_value: list, after_value: after, status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Could not save that proposal: ${await insert.text()}` }
  const proposal = (await insert.json())?.[0]
  return { proposal, preview: { target, label: TARGET_LABEL[target], before: names(list), after: names(after) } }
}
