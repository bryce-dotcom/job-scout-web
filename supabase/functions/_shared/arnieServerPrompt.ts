// ARNIE'S INSTRUCTIONS, BUILT ON THE SERVER.
//
// Until 2026-10-14 the browser assembled the whole system prompt — persona,
// rules, knowledge — and posted it with every message. So who the assistant
// was and which rules it followed depended on whatever build a phone had
// cached: Jenny introduced herself as Arnie, and rules that had been fixed
// kept misbehaving, because the phone was still sending last week's text.
//
// Now the server builds every word of the rules from the database, each turn:
// who they are, their level, their company and its timezone, whether they are
// clocked in, and their chosen assistant. What the phone still sends is only
// what it is uniquely placed to know — the snapshot of data it has loaded,
// whether the message was spoken, and its timezone — and none of it can
// change a rule.
//
// An OLD phone keeps working and gets the NEW rules at once: it still posts a
// full prompt, and only the data section at the end of it is kept.

// deno-lint-ignore-file no-explicit-any
import { buildArniePrompt } from './arniePrompt.ts'
import { JOBSCOUT_KNOWLEDGE, featureContextForMessage } from './arnieKnowledge.ts'

type Any = any
type Rest = { url: string; key: string }

const DATA_MARK = '\n\n## Current Data Context'
const FIELD_MARK = '## You are talking to someone ON A JOB RIGHT NOW'
const SPOKEN_MARK = '## This instruction was SPOKEN, not typed'
const FEATURE_MARK = '## Active Feature Context'

/**
 * From an old phone's prompt, the part that is DATA (everything from the
 * data heading on) and the two facts the rules encoded: spoken, and field.
 * The rest is the old rules, and is thrown away.
 */
export function fromLegacyPrompt(prompt: unknown): { data: string; spoken: boolean; field: boolean } {
  const p = typeof prompt === 'string' ? prompt : ''
  const at = p.indexOf(DATA_MARK)
  return {
    data: at >= 0 ? p.slice(at) : '',
    spoken: p.includes(SPOKEN_MARK),
    field: p.includes(FIELD_MARK),
  }
}

/** The data section as the browser used to frame it, from a bare snapshot. */
export function frameData(dataContext: unknown): string {
  const d = typeof dataContext === 'string' ? dataContext.slice(0, 200_000) : ''
  return d.trim()
    ? `${DATA_MARK} (REAL DATA — use ONLY these facts)\nBelow is the ACTUAL company data pulled from the database. Use ONLY these numbers and facts when answering data questions. If something is not listed here AND no tool can fetch it, you do NOT have it. This governs facts about THIS COMPANY only — it does not limit your trade, technical or general knowledge, which you should use freely when helping someone diagnose or fix something.\n\n${d}`
    : `${DATA_MARK}\nNo preloaded data — call a query_* tool to fetch what you need.`
}

function lastUserText(messages: Any[]): string {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) return m.content.filter((b: Any) => b?.type === 'text').map((b: Any) => b.text).join(' ')
  }
  return ''
}

async function one(r: Rest, path: string): Promise<Any | null> {
  try {
    const res = await fetch(`${r.url}/rest/v1/${path}`, { headers: { apikey: r.key, Authorization: `Bearer ${r.key}` } })
    return res.ok ? ((await res.json())?.[0] ?? null) : null
  } catch { return null }
}

/**
 * The whole system prompt for one Arnie turn.
 *
 * @param caller  from the JWT (resolveCaller / internalCaller) — never the body
 * @param body    the request body: messages, and the phone's data snapshot
 */
export async function serverArniePrompt(r: Rest, caller: Any, body: Any): Promise<string> {
  const legacy = fromLegacyPrompt(body?.systemPrompt)
  const isNew = typeof body?.dataContext === 'string' || body?.promptVersion === 2

  const [emp, company, persona, open] = await Promise.all([
    caller.employeeId != null ? one(r, `employees?select=email,name&id=eq.${caller.employeeId}&limit=1`) : null,
    caller.companyId != null ? one(r, `companies?select=company_name,timezone&id=eq.${caller.companyId}&limit=1`) : null,
    caller.employeeId != null ? one(r, `arnie_personas?select=persona,display_name&employee_id=eq.${caller.employeeId}&limit=1`) : null,
    caller.employeeId != null
      ? one(r, `time_clock?select=id&employee_id=eq.${caller.employeeId}&clock_out=is.null&clock_in=gte.${encodeURIComponent(new Date(Date.now() - 16 * 3600_000).toISOString())}&limit=1`)
      : null,
  ])

  // Field or office. Clocked in is the strongest signal and outranks role —
  // a manager up a ladder is in the field. A caller that knows better (a
  // text sent mid-shift, a routine) says so; it only changes formatting.
  const asked = body?.mode === 'field' || body?.mode === 'office' ? body.mode : null
  const mode = asked || (open || legacy.field ? 'field' : (caller.role === 'user' || caller.role === 'team_lead' ? 'field' : 'office'))

  const spoken = body?.spoken === true || (!isNew && legacy.spoken)
  // Their zone: the one the phone reports (Cole sells in Arizona for a Utah
  // company), else the company's. Both are facts, not rules; an unknown zone
  // falls back inside buildArniePrompt.
  const timeZone = (typeof body?.tz === 'string' && body.tz) || company?.timezone || null

  const rules = buildArniePrompt(
    { email: emp?.email || caller.email },
    { company_name: company?.company_name },
    caller.role,
    mode,
    JOBSCOUT_KNOWLEDGE,
    persona?.persona,
    persona?.display_name,
    { spoken, timeZone },
  )

  // The data the phone loaded, then the cards this message is about — unless
  // an old phone already put them in its data section.
  const data = isNew ? frameData(body.dataContext) : (legacy.data || frameData(''))
  const features = data.includes(FEATURE_MARK) ? '' : featureContextForMessage(lastUserText(body?.messages))
  return rules + (features ? `\n${features}` : '') + data
}
