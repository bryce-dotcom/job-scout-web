// Arnie by text.
//
// Bryce, 2026-10-10: a rep built his own bot because ours lived in a tab. This
// is the first half of the answer — the same Arnie, reachable on the thing
// already in your hand, with the same rails.
//
// One number does both jobs. A customer texting it is still a customer and
// their message goes to the communications log exactly as before; a known,
// ACTIVE employee texting it is talking to Arnie. Nothing about what he may do
// changes with the channel: same tools, same money gates, same
// propose → approve → apply, same audit row.
//
// Two things a text conversation needs that a tab gets for free:
//
//  • MEMORY of the thread. SMS has no session, so the last few turns are kept
//    in ai_messages under a per-person session id — the same tables the chat
//    history uses, so a texted conversation shows up in Arnie's history like
//    any other rather than living in a silo.
//  • A WAY TO APPROVE. The card cannot be rendered, so it is read out and the
//    pending proposal is held on the session row. "YES" applies it.
//
// What a text may NOT approve is money. A phone number is a weak credential —
// it can be spoofed, and a handset can be picked up off a seat — so anything
// that moves money or pay is drafted over text and must be approved in the
// app, where there is a real login behind it. That is a deliberate narrowing,
// and the reply says so rather than failing silently.

// deno-lint-ignore-file no-explicit-any
import { plainText, runArnieTurn } from './arnieHeadless.ts'

type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()

/** Targets a text message may not approve, however keen the sender. */
export const APPROVE_IN_APP_ONLY = ['payment', 'price_book', 'expense_category', 'employee', 'payroll', 'bulk']

export const YES = /^(y|ya|yes|yep|yeah|ok|okay|approve|approved|do it|send it|go|go ahead|confirm)[.! ]*$/i
export const NO = /^(n|no|nope|cancel|stop it|discard|never mind|nevermind)[.! ]*$/i

/** 1600 is the practical ceiling before carriers split a message badly. */
export const SMS_MAX = 1400

export function forSms(text: string): string {
  const t = plainText(text)
  return t.length <= SMS_MAX ? t : t.slice(0, SMS_MAX - 24).trimEnd() + '…\n(more in the app)'
}

/** The card, read out loud. A phone cannot render it, so it gets said. */
export function cardAsText(preview: Any): string {
  const fields: Any[] = preview?.fields || []
  const lines = fields.map((f) => `${f.label}: ${f.value}`)
  const head = preview?.label ? `${String(preview.label).toUpperCase()}` : 'DRAFT'
  return [head, ...lines].join('\n')
}

const SESSION = (employeeId: number) => `sms:${employeeId}`

export interface SmsRest { url: string; key: string; internalKey?: string }
// REST reads go with the service key; a call to another FUNCTION goes with
// the internal key when there is one (internalCaller explains why they differ).
const H = (r: SmsRest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const FH = (r: SmsRest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', ...(r.internalKey ? { 'x-arnie-internal': r.internalKey } : {}) })

/** The last few turns, oldest first. Enough for "do that one too" to mean something. */
export async function recentTurns(r: SmsRest, companyId: number, employeeId: number, limit = 8): Promise<{ role: string; content: string }[]> {
  const res = await fetch(
    `${r.url}/rest/v1/ai_messages?select=role,content,created_at&company_id=eq.${companyId}&session_id=eq.${SESSION(employeeId)}&order=created_at.desc&limit=${limit}`,
    { headers: H(r) },
  )
  if (!res.ok) return []
  const rows: Any[] = await res.json().catch(() => [])
  return rows.reverse().map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: str(m.content) })).filter((m) => m.content)
}

export async function rememberTurn(r: SmsRest, companyId: number, employeeId: number, role: 'user' | 'assistant', content: string) {
  await fetch(`${r.url}/rest/v1/ai_messages`, {
    method: 'POST',
    headers: H(r),
    body: JSON.stringify({
      company_id: companyId,
      session_id: SESSION(employeeId),
      message_id: `${SESSION(employeeId)}-${Date.now()}-${role}`,
      role,
      content: str(content).slice(0, 8000),
      module_used: 'arnie-sms',
    }),
  }).catch(() => {})
}

/** The card waiting on a "yes", held on the person's own session row. */
export async function pendingProposal(r: SmsRest, companyId: number, employeeId: number): Promise<Any | null> {
  const res = await fetch(
    `${r.url}/rest/v1/ai_sessions?select=id,pending_action,pending_data&company_id=eq.${companyId}&session_id=eq.${SESSION(employeeId)}&limit=1`,
    { headers: H(r) },
  )
  if (!res.ok) return null
  const row = (await res.json().catch(() => []))?.[0]
  if (row?.pending_action !== 'arnie_proposal' || !row?.pending_data) return null
  // pending_data comes back as a JSON STRING, not an object — the column is
  // text, so spreading it gave character keys and `pending.id` was undefined,
  // which meant "yes" never found the card it was answering. Caught by a live
  // probe on 2026-10-10; parse whichever shape arrives.
  let data: Any = row.pending_data
  if (typeof data === 'string') { try { data = JSON.parse(data) } catch { return null } }
  return data && typeof data === 'object' ? { ...data, sessionRowId: row.id } : null
}

export async function setPending(r: SmsRest, companyId: number, employeeId: number, email: string, data: Any | null) {
  const sid = SESSION(employeeId)
  const existing = await fetch(`${r.url}/rest/v1/ai_sessions?select=id&company_id=eq.${companyId}&session_id=eq.${sid}&limit=1`, { headers: H(r) })
  const row = existing.ok ? (await existing.json().catch(() => []))?.[0] : null
  // Written as a string deliberately: the column is text, and a round trip
  // that changes shape is what broke the YES handshake the first time.
  const patch = { pending_action: data ? 'arnie_proposal' : null, pending_data: data ? JSON.stringify(data) : null, last_activity: new Date().toISOString() }
  if (row?.id) {
    await fetch(`${r.url}/rest/v1/ai_sessions?id=eq.${row.id}`, { method: 'PATCH', headers: H(r), body: JSON.stringify(patch) }).catch(() => {})
  } else {
    await fetch(`${r.url}/rest/v1/ai_sessions`, {
      method: 'POST', headers: H(r),
      body: JSON.stringify({ company_id: companyId, session_id: sid, user_email: email, current_module: 'arnie-sms', started: new Date().toISOString(), ...patch }),
    }).catch(() => {})
  }
}

/**
 * One inbound text from a known employee, start to finish.
 * Returns the words to send back — the caller decides how (TwiML, the API).
 */
export async function arnieBySms(r: SmsRest, employee: Any, bodyText: string): Promise<string> {
  const companyId = employee.company_id as number
  const employeeId = employee.id as number
  const said = str(bodyText)
  if (!said) return ''

  // ── "yes" to the card he is already holding ────────────────────────────
  const pending = await pendingProposal(r, companyId, employeeId)
  if (pending?.id && YES.test(said)) {
    if (APPROVE_IN_APP_ONLY.includes(str(pending.target))) {
      return forSms(`That one moves money, so it needs approving in the app — open Arnie and it is waiting there. I have left it drafted.`)
    }
    const res = await fetch(`${r.url}/functions/v1/arnie-config`, {
      method: 'POST', headers: FH(r),
      body: JSON.stringify({ action: 'apply', proposal_id: pending.id, as_employee_id: employeeId }),
    })
    const out = await res.json().catch(() => ({}))
    await setPending(r, companyId, employeeId, employee.email, null)
    const reply = out?.ok ? `Done — ${str(pending.label) || 'that'} is applied.` : `It did not go through: ${str(out?.error) || 'something stopped it'}.`
    await rememberTurn(r, companyId, employeeId, 'assistant', reply)
    return forSms(reply)
  }
  if (pending?.id && NO.test(said)) {
    await fetch(`${r.url}/functions/v1/arnie-config`, {
      method: 'POST', headers: FH(r),
      body: JSON.stringify({ action: 'reject', proposal_id: pending.id, as_employee_id: employeeId }),
    }).catch(() => {})
    await setPending(r, companyId, employeeId, employee.email, null)
    const reply = 'Dropped it.'
    await rememberTurn(r, companyId, employeeId, 'assistant', reply)
    return reply
  }

  // ── an ordinary turn ───────────────────────────────────────────────────
  const history = await recentTurns(r, companyId, employeeId)
  await rememberTurn(r, companyId, employeeId, 'user', said)

  const turn = await runArnieTurn(r, { employee, messages: [...history, { role: 'user', content: said }] })
  if (turn.error) return forSms(`I could not get to that just now — ${turn.error}`)

  let reply = turn.text
  const preview = turn.proposal?.preview
  const proposalId = turn.proposal?.proposal?.id

  if (preview && proposalId) {
    const money = APPROVE_IN_APP_ONLY.includes(str(turn.proposal?.proposal?.target))
    await setPending(r, companyId, employeeId, employee.email, {
      id: proposalId,
      target: turn.proposal?.proposal?.target,
      label: preview?.label,
    })
    reply = [reply, cardAsText(preview), money ? 'Approve this one in the app — it moves money.' : 'Reply YES to approve, NO to drop it.']
      .filter(Boolean).join('\n\n')
  }

  await rememberTurn(r, companyId, employeeId, 'assistant', reply)
  return forSms(reply)
}
