import { getUserRole, assembleDataContext, getDataLoadStatus, isClockedIn } from './arnieTools'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { JOBSCOUT_KNOWLEDGE, getFeatureContextForMessage } from './arnieKnowledge'
import { buildArniePrompt } from '../../../../supabase/functions/_shared/arniePrompt.ts'
import { toApiMessages, withCurrentTurn } from '../../../lib/chatAttachments'

/**
 * The approval-card types this build can render, declared to the server on
 * every request. It only offers tools whose output we can draw.
 *
 * The reason this exists: propose_bulk_change was deployed to the edge
 * function before the card that renders it had shipped. The client of the day
 * routed every non-'record' preview into the settings-list card, which calls
 * .map() on `after` — and a bulk preview's `after` is a string, so the whole
 * message list threw mid-render. Nothing was written and nothing could be
 * approved, but the panel broke.
 *
 * Keep this list honest: a card type belongs here in the same commit that
 * teaches ArnieChat to draw it, never earlier.
 */
export const RENDERABLE_CARDS = ['config', 'record', 'bulk', 'create']

/**
 * Field or office — the same Arnie, answering very differently.
 *
 * These are not the same product. A tech clocked into a job is holding a
 * phone, probably wearing gloves, quite possibly listening rather than
 * reading; a markdown table is useless to them and a four-paragraph answer is
 * worse than silence. An owner at a desk wants the table.
 *
 * Being clocked in is the strongest signal we have and it outranks role: a
 * manager up a ladder is in the field, whatever their access level says.
 */
export function detectMode(role, userId) {
  if (isClockedIn(userId)) return 'field'
  return role === 'user' || role === 'team_lead' ? 'field' : 'office'
}

// The rules moved to supabase/functions/_shared/arniePrompt.ts so the edge
// functions can build the same prompt — Arnie has to be able to think outside
// a browser tab. Do not reimplement any of it here; the knowledge CATALOGUE is
// still ours to supply, because it is generated from the feature cards.

function buildSystemPrompt(user, company, role, mode = 'office') {
  return buildArniePrompt(user, company, role, mode, JOBSCOUT_KNOWLEDGE)
}

// Keyword-based intent detection to determine which data domains to fetch
export function detectIntent(message) {
  const lower = message.toLowerCase()
  const domains = new Set()

  // Jobs
  if (/\b(job|jobs|work order|task|assignment)\b/.test(lower)) {
    domains.add('jobs')
  }

  // Schedule / appointments
  if (/\b(schedule|today|this week|calendar|upcoming|next|tomorrow|when|appointment)\b/.test(lower)) {
    domains.add('schedule')
    domains.add('jobs')
    domains.add('appointments')
  }

  // Products
  if (/\b(product|service|offering|catalog|price|pricing|item)\b/.test(lower)) {
    domains.add('products')
  }

  // Inventory
  if (/\b(inventory|stock|supply|supplies|warehouse|parts|reorder)\b/.test(lower)) {
    domains.add('inventory')
  }

  // Customers
  if (/\b(customer|client|account|contact)\b/.test(lower)) {
    domains.add('customers')
  }

  // Leads / Sales — fixed regex: removed misplaced \b inside group for "rep"
  if (/\b(lead|leads|deal|deals|pipeline|prospect|opportunity|sales|sell|sold|selling|make|made|commission|salesperson|rep)\b/.test(lower)) {
    domains.add('leads')
    domains.add('employees')
  }

  // Employees
  if (/\b(employee|team|staff|crew|member|worker|technician|tech)\b/.test(lower)) {
    domains.add('employees')
  }

  // Financials — added sell/sold/make/made/commission to also pull financials
  if (/\b(invoice|payment|expense|revenue|financial|money|profit|cost|billing|payroll|income|earnings|sell|sold|make|made|commission)\b/.test(lower)) {
    domains.add('financials')
  }

  // Quotes
  if (/\b(quote|quotes|estimate|proposal|bid)\b/.test(lower)) {
    domains.add('quotes')
  }

  // Fleet
  if (/\b(fleet|vehicle|truck|van|car|mileage|maintenance)\b/.test(lower)) {
    domains.add('fleet')
  }

  // Lighting audits
  if (/\b(audit|audits|lighting audit|fixture|rebate|utility)\b/.test(lower)) {
    domains.add('audits')
  }

  // Routes
  if (/\b(route|routes|routing|stops|dispatch)\b/.test(lower)) {
    domains.add('routes')
  }

  // Communications
  if (/\b(communication|email|message|sent|outreach|campaign)\b/.test(lower)) {
    domains.add('communications')
  }

  // Time tracking
  if (/\b(time log|time clock|clocked|hours|timesheet|time sheet|punch)\b/.test(lower)) {
    domains.add('timeLogs')
  }

  // Agents
  if (/\b(agent|lenard|freddy|conrad|victor|ai|robot|base camp)\b/.test(lower)) {
    domains.add('agents')
  }

  // Company
  if (/\b(company|business|about us|our company)\b/.test(lower)) {
    domains.add('company')
  }

  // Person-specific questions — if asking about a person, pull employees + leads + jobs + financials
  if (/\b(did|how much|how many)\b.*\b(he|she|they|sell|make|get|close|do)\b/.test(lower)) {
    domains.add('employees')
    domains.add('leads')
    domains.add('jobs')
    domains.add('financials')
  }

  // General / overview — send everything relevant
  if (/\b(overview|summary|dashboard|how many|report|status|everything|total|count|all|going on|what's up|whats up|how are we|how we doing|how's business|hows business|update|rundown|breakdown)\b/.test(lower)) {
    domains.add('jobs')
    domains.add('customers')
    domains.add('employees')
    domains.add('schedule')
    domains.add('company')
    domains.add('products')
    domains.add('leads')
    domains.add('quotes')
    domains.add('inventory')
    domains.add('financials')
  }

  // Help with current task / job context
  if (/\b(help|how do i|how to|what should|what do i|this job|current job|working on|clocked in|my task|my section|what next|next step|walk me through|guide me|stuck)\b/.test(lower)) {
    domains.add('activeJob')
    domains.add('currentPage')
  }

  // This/the job, task, section — pull current context
  if (/\b(this|the) (job|task|section|customer|address|line item)\b/.test(lower)) {
    domains.add('activeJob')
    domains.add('currentPage')
  }

  return Array.from(domains)
}

// Call Claude via Supabase edge function — streams responses via SSE
async function callClaude(conversationHistory, systemPrompt, dataContext, onChunk) {
  const contextMessage = dataContext
    ? `\n\n## Current Data Context (REAL DATA — use ONLY these facts)\nBelow is the ACTUAL company data pulled from the database. Use ONLY these numbers and facts when answering data questions. If something is not listed here AND no tool can fetch it, you do NOT have it. This governs facts about THIS COMPANY only — it does not limit your trade, technical or general knowledge, which you should use freely when helping someone diagnose or fix something.\n\n${dataContext}`
    : '\n\n## Current Data Context\nNo preloaded data — call a query_* tool to fetch what you need.'

  const messages = toApiMessages(conversationHistory)

  const fullSystemPrompt = systemPrompt + contextMessage

  // Stream via fetch directly so we can read SSE
  const session = await supabase.auth.getSession()
  const accessToken = session?.data?.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arnie-chat`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    // companyId and role are deliberately NOT sent. The edge function
    // resolves both from the caller's JWT — a client-supplied tenant id is
    // exactly the hole that let one company read another's data.
    body: JSON.stringify({
      messages,
      systemPrompt: fullSystemPrompt,
      stream: true,
      // Approval cards this build knows how to draw. The server withholds any
      // tool whose result we could not render, so the two halves of a feature
      // can deploy in either order. Add to this list in the SAME commit that
      // adds the card — never ahead of it.
      supports: RENDERABLE_CARDS,
    }),
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => 'stream failed')
    throw new Error(`arnie-chat error: ${res.status} ${errText}`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  let currentEvent = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        try {
          const payload = JSON.parse(line.slice(6))
          if (currentEvent === 'text' && payload.delta) {
            full += payload.delta
            onChunk(full) // pass cumulative text for replace-style rendering
          } else if (currentEvent === 'tool_call') {
            const hint = payload.name === 'propose_change' ? 'writing that up' : `looking that up (${payload.name})`
            onChunk(full + `\n\n_…${hint}_`, { tool: payload.name })
          } else if (currentEvent === 'proposal') {
            // Arnie drafted a config change. Nothing is applied — the caller
            // renders an approve/reject card from this payload.
            onChunk(full, { proposal: payload })
          } else if (currentEvent === 'error') {
            throw new Error(payload.message || 'stream error')
          }
        } catch (e) {
          if (currentEvent === 'error') throw e
        }
      }
    }
  }

  // Final clean send (without the "looking that up" hint)
  if (full) onChunk(full)
  return full
}

// Send a message through the full pipeline with streaming.
// `attachments` are screenshots/photos/PDFs the user added to THIS turn.
export async function sendMessageStream(message, history = [], onChunk, attachments = []) {
  let role, userId
  try {
    const ur = getUserRole()
    role = ur.role
    userId = ur.userId
  } catch (e) {
    console.error('[Arnie] getUserRole failed:', e)
    throw new Error('Failed to get user role: ' + e.message)
  }

  const { user, company } = useStore.getState()

  let systemPrompt
  try {
    systemPrompt = buildSystemPrompt(user, company, role, detectMode(role, userId))
  } catch (e) {
    console.error('[Arnie] buildSystemPrompt failed:', e)
    throw new Error('Failed to build prompt: ' + e.message)
  }

  let dataContext
  try {
    const domains = detectIntent(message)

    // Always include activeJob and currentPage for context awareness
    if (!domains.includes('activeJob')) domains.push('activeJob')
    if (!domains.includes('currentPage')) domains.push('currentPage')

    // If no data domains detected, include broad context so Arnie has something
    if (domains.length <= 2) {
      domains.push('jobs', 'schedule', 'company', 'customers', 'employees')
    }

    dataContext = assembleDataContext(domains, role, userId)
  } catch (e) {
    console.error('[Arnie] Data assembly failed:', e)
    // Don't crash — just proceed without data
    dataContext = ''
  }

  // A cold store is a reason to reach for a tool, not a reason to give up.
  // This used to instruct Arnie to tell the user their data was still loading
  // and to try again in a moment — on a hard refresh, or on a slow phone in
  // the field, that turned every first question into a brush-off, while the
  // tools sitting next to him could have answered it from the database.
  if (!dataContext || dataContext.trim().length < 50) {
    const loadStatus = getDataLoadStatus()
    const totalRecords = Object.values(loadStatus).reduce((a, b) => a + b, 0)
    if (totalRecords === 0) {
      dataContext = '### Data Load Status\n'
        + 'The app has not finished loading its local snapshot, so there is NO preloaded data in this turn.\n'
        + 'This says nothing about what exists — it only means you must get it yourself.\n'
        + 'Use your query_* tools to answer anything factual. Do NOT tell the user their data is still loading, '
        + 'and do NOT report zero for anything: a tool call is available and is the correct move.'
    }
  }

  // Feature-specific deep context — if the user's message names a
  // feature in our knowledge cards, prepend the full card so Arnie
  // cites setup steps + gotchas + FAQs accurately instead of
  // improvising from the high-level feature index. Empty string when
  // nothing matches (cheap no-op for casual chitchat).
  try {
    const featureContext = getFeatureContextForMessage(message)
    if (featureContext) {
      dataContext = featureContext + '\n\n' + (dataContext || '')
    }
  } catch (e) {
    console.error('[Arnie] feature context injection failed:', e)
  }

  const conversationHistory = withCurrentTurn(history, message, attachments)

  const response = await callClaude(conversationHistory, systemPrompt, dataContext, onChunk)
  return response
}

// Generate a unique session ID
function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// Session management — uses ai_sessions table (session_id is text, not auto PK)
export async function createSession(title) {
  const { companyId, user } = useStore.getState()
  const sessionId = generateId()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('ai_sessions')
    .insert({
      company_id: companyId,
      session_id: sessionId,
      user_email: user?.email,
      started: now,
      last_activity: now,
      status: 'active',
      current_module: 'arnie',
      context_json: JSON.stringify({ title: title || 'New conversation' })
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session:', error)
    return null
  }
  return data
}

export async function saveMessage(sessionId, role, content) {
  if (!sessionId) return null
  const { companyId } = useStore.getState()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('ai_messages')
    .insert({
      company_id: companyId,
      message_id: generateId(),
      session_id: sessionId,
      timestamp: now,
      role,
      content,
      module_used: 'arnie'
    })

  if (error) console.error('Error saving message:', error)

  // Update last_activity on the session
  await supabase
    .from('ai_sessions')
    .update({ last_activity: now })
    .eq('session_id', sessionId)
}

/**
 * Merge keys into a session's context_json.
 *
 * Everything we keep about a conversation beyond its messages — the title,
 * whether it's pinned, when it was renamed — lives in this one JSON column.
 * Read-modify-write rather than overwrite, so adding a pin never drops the
 * title, and so this needs no migration (which matters: other sessions have
 * unpushed migrations sitting in front of `db push`).
 */
async function patchSessionContext(sessionId, patch) {
  if (!sessionId) return
  const existing = await supabase
    .from('ai_sessions')
    .select('context_json')
    .eq('session_id', sessionId)
    .single()

  let ctx = {}
  try { ctx = JSON.parse(existing.data?.context_json || '{}') } catch { /* corrupt context reads as empty */ }

  await supabase
    .from('ai_sessions')
    .update({ context_json: JSON.stringify({ ...ctx, ...patch }) })
    .eq('session_id', sessionId)
}

/** Auto-title from the opening message — never over a name someone chose. */
export async function updateSessionTitle(sessionId, title) {
  if (!sessionId) return
  const { data } = await supabase
    .from('ai_sessions')
    .select('context_json')
    .eq('session_id', sessionId)
    .single()
  try {
    if (JSON.parse(data?.context_json || '{}').renamed === true) return
  } catch { /* corrupt context is not a rename */ }
  return patchSessionContext(sessionId, { title })
}

/**
 * Rename a conversation by hand.
 *
 * Kept separate from updateSessionTitle because that one is called
 * automatically from the first message of every chat. Without the flag, the
 * auto-titler would quietly overwrite a name someone chose.
 */
export async function renameSession(sessionId, title) {
  const clean = String(title || '').trim().slice(0, 120)
  if (!clean) return
  return patchSessionContext(sessionId, { title: clean, renamed: true })
}

export async function setSessionPinned(sessionId, pinned) {
  return patchSessionContext(sessionId, { pinned: !!pinned })
}

// ── Which conversation was I last in? ────────────────────────────────
//
// The corner panel used to start a brand-new conversation every time it was
// opened, and closing it lost the thread. Mid-task that is the wrong default:
// people shut the panel to look at the screen behind it, not to change subject.
//
// Keyed per user because these are shared devices — a tablet in a truck gets
// passed around, and resuming the last person's conversation would show one
// employee another's chat.
const LAST_SESSION_KEY = 'arnie:lastSession'

const lastSessionStore = () => {
  try { return window.localStorage } catch { return null }  // Safari private mode
}

export function rememberLastSession(sessionId) {
  const store = lastSessionStore()
  const email = useStore.getState().user?.email
  if (!store || !email || !sessionId) return
  try {
    store.setItem(LAST_SESSION_KEY, JSON.stringify({ email, sessionId }))
  } catch { /* quota or disabled storage — resuming is a convenience, not a promise */ }
}

export function getLastSessionId() {
  const store = lastSessionStore()
  const email = useStore.getState().user?.email
  if (!store || !email) return null
  try {
    const saved = JSON.parse(store.getItem(LAST_SESSION_KEY) || 'null')
    return saved?.email === email ? saved.sessionId || null : null
  } catch { return null }
}

export function forgetLastSession() {
  try { lastSessionStore()?.removeItem(LAST_SESSION_KEY) } catch { /* nothing to clean up */ }
}

export async function loadSessions() {
  const { companyId, user } = useStore.getState()
  const { data, error } = await supabase
    .from('ai_sessions')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_email', user?.email)
    .eq('current_module', 'arnie')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error loading sessions:', error)
    return []
  }

  // Unpack what we keep about each conversation, then float the pinned ones.
  // A pinned conversation is one someone deliberately kept; burying it under
  // whatever they happened to ask this morning defeats the point of pinning.
  return (data || [])
    .map(s => {
      let ctx = {}
      try { ctx = JSON.parse(s.context_json || '{}') } catch { /* corrupt context reads as empty */ }
      return {
        ...s,
        title: ctx.title || 'Untitled conversation',
        pinned: ctx.pinned === true,
        renamed: ctx.renamed === true,
      }
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}

/**
 * Find conversations by name OR by something said inside them.
 *
 * Searching titles alone is close to useless here: titles are auto-generated
 * from the first message, so the thing you remember saying is usually in the
 * middle of a chat called something else entirely.
 *
 * Content matching is restricted to the session ids already loaded for this
 * user, so it can never surface a colleague's conversation.
 */
export async function searchSessions(term, sessions) {
  const q = String(term || '').trim()
  if (!q) return sessions

  const lower = q.toLowerCase()
  const hits = new Map()
  for (const s of sessions) {
    if ((s.title || '').toLowerCase().includes(lower)) hits.set(s.session_id, 'title')
  }

  const ids = sessions.map(s => s.session_id).filter(Boolean)
  if (ids.length) {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('session_id, content')
      .in('session_id', ids)
      .ilike('content', `%${q}%`)
      .limit(400)
    if (error) console.error('[Arnie] message search failed:', error)
    for (const m of data || []) {
      if (!hits.has(m.session_id)) hits.set(m.session_id, 'message')
      // Keep a short excerpt so the result explains why it matched.
      if (!hits.get(`${m.session_id}:snippet`)) {
        const i = (m.content || '').toLowerCase().indexOf(lower)
        if (i >= 0) {
          const from = Math.max(0, i - 40)
          hits.set(`${m.session_id}:snippet`,
            (from > 0 ? '…' : '') + m.content.slice(from, i + q.length + 60).replace(/\s+/g, ' ').trim() + '…')
        }
      }
    }
  }

  return sessions
    .filter(s => hits.has(s.session_id))
    .map(s => ({ ...s, matchedOn: hits.get(s.session_id), snippet: hits.get(`${s.session_id}:snippet`) || null }))
}

export async function loadSessionMessages(sessionId) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true })

  if (error) {
    console.error('Error loading messages:', error)
    return []
  }
  return data || []
}

export async function deleteSession(sessionId) {
  // Delete messages first, then session
  await supabase.from('ai_messages').delete().eq('session_id', sessionId)
  await supabase.from('ai_sessions').delete().eq('session_id', sessionId)
}
