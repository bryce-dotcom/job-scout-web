// Arnie, outside the browser.
//
// Bryce, 2026-10-10, after a rep built his own cross-tool bot because ours
// stopped at the app's edge: "I want Arnie to be able to do that same thing for
// users." The first thing standing in the way was mundane — Arnie's rules were
// built in a React file, so a text message arrived with nothing to think with.
//
// This is the one entry point every non-browser channel uses: a text, an email,
// a routine on a schedule. It builds the SAME prompt the tab builds
// (_shared/arniePrompt.ts) and runs the turn through the SAME arnie-chat, with
// the same tools, the same rails and the same money gates. Nothing about what
// Arnie is allowed to do changes with the channel he is reached on — which is
// the property that lets one eval keep proving all of them.
//
// What differs, honestly: the browser passes a feature INDEX generated from the
// 60 knowledge cards, and a channel cannot. Headless gets the static half
// (_shared/arnieKnowledgeStatic.ts), so he knows the rules and the workflows
// but is thinner on "which page is that on". Background degrades; rules do not.

// deno-lint-ignore-file no-explicit-any
import { buildArniePrompt } from './arniePrompt.ts'
import { ARNIE_STATIC_KNOWLEDGE } from './arnieKnowledgeStatic.ts'
import { accessLevel, LEVEL_ROLE } from './auth.ts'

type Any = any

export interface TurnResult {
  /** What Arnie said, as plain text for a channel that cannot render markdown. */
  text: string
  /** The card he drafted, if any — the caller decides how to offer approval. */
  proposal: Any | null
  employee: Any
  company: Any
  error?: string
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim()

/** Markdown is for a screen. A text message gets words. */
export function plainText(md: string): string {
  return str(md)
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*\n?/g, '').trim())
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*/g, '$1$2')
    .replace(/^\s*[-•]\s+/gm, '- ')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Run one Arnie turn as a named employee.
 *
 * @param r     service-key REST handle — this path has no user JWT by nature
 * @param o.employee  the employees row (active; the caller proved who it is)
 * @param o.messages  the conversation so far, oldest first
 * @param o.mode      'field' for someone on a job, 'office' otherwise
 */
export async function runArnieTurn(
  r: { url: string; key: string; internalKey?: string },
  o: { employee: Any; company?: Any; messages: { role: string; content: string }[]; mode?: 'field' | 'office'; cards?: string[] },
): Promise<TurnResult> {
  const emp = o.employee
  const companyId = emp?.company_id
  let company = o.company || null
  if (!company && companyId != null) {
    const res = await fetch(`${r.url}/rest/v1/companies?select=id,company_name,timezone,industry&id=eq.${companyId}&limit=1`, {
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}` },
    })
    company = res.ok ? ((await res.json().catch(() => []))?.[0] || null) : null
  }

  const level = Math.max(accessLevel(emp), emp?.is_admin === true ? 3 : 0)
  const role = LEVEL_ROLE[level] || 'user'
  // Someone texting mid-shift is in the field whatever their title says; the
  // caller tells us, because only it knows (a clock-in, an SMS, a cron).
  const mode = o.mode || (level <= 1 ? 'field' : 'office')

  const systemPrompt = buildArniePrompt(
    { email: emp?.email },
    { company_name: company?.company_name },
    role,
    mode,
    ARNIE_STATIC_KNOWLEDGE,
  )

  // Through arnie-chat, not around it: the tools, the rails, the money gates
  // and the audit trail are all in there, and a channel that reimplemented any
  // of it would be the second copy that drifts.
  let res: Response
  try {
    res = await fetch(`${r.url}/functions/v1/arnie-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: r.key,
        // The bearer must stay a real key: a gateway verifies it is a JWT
        // before our code runs. The internal secret goes in its own header —
        // see internalCaller.
        Authorization: `Bearer ${r.key}`,
        ...(r.internalKey ? { 'x-arnie-internal': r.internalKey } : {}),
      },
      body: JSON.stringify({
        messages: o.messages,
        systemPrompt,
        // Streaming, even though nobody is watching it arrive: the card only
        // comes down the stream. The non-streaming reply is {reply} alone, so
        // a channel that used it would silently lose every proposal — the one
        // thing a text conversation most needs to send back.
        stream: true,
        as_employee_id: emp?.id,
        supports: o.cards ?? ['config', 'record', 'bulk', 'create'],
      }),
    })
  } catch (e) {
    return { text: '', proposal: null, employee: emp, company, error: (e as Error)?.message || 'Arnie could not be reached.' }
  }

  const raw = await res.text()
  if (!res.ok) {
    let err = `Arnie answered ${res.status}.`
    try { err = str(JSON.parse(raw)?.error) || err } catch { /* keep the status */ }
    return { text: '', proposal: null, employee: emp, company, error: err }
  }

  // Server-sent events: `delta` carries the words, `preview` carries the card.
  const parts: Any[] = raw.split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } })
    .filter(Boolean)
  const text = parts.filter((p) => p.delta).map((p) => p.delta).join('')
  const card = parts.find((p) => p.preview) || null
  return { text, proposal: card, employee: emp, company }
}

/** The employee behind a phone number or an email address, active only. */
export async function employeeByContact(
  r: { url: string; key: string; internalKey?: string },
  o: { phone?: string | null; email?: string | null },
): Promise<Any | null> {
  const select = 'id,company_id,email,phone,name,role,user_role,is_admin,is_developer,has_hr_access'
  if (str(o.email)) {
    const res = await fetch(`${r.url}/rest/v1/employees?select=${select}&active=eq.true&email=ilike.${encodeURIComponent(str(o.email))}&limit=1`, {
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}` },
    })
    const hit = res.ok ? (await res.json().catch(() => []))?.[0] : null
    if (hit) return hit
  }
  if (str(o.phone)) {
    // Numbers are stored however somebody typed them, so compare on digits.
    const digits = str(o.phone).replace(/\D/g, '').slice(-10)
    if (digits.length === 10) {
      const res = await fetch(`${r.url}/rest/v1/employees?select=${select}&active=eq.true&phone=not.is.null&limit=500`, {
        headers: { apikey: r.key, Authorization: `Bearer ${r.key}` },
      })
      const rows = res.ok ? await res.json().catch(() => []) : []
      return rows.find((e: Any) => str(e.phone).replace(/\D/g, '').slice(-10) === digits) || null
    }
  }
  return null
}
