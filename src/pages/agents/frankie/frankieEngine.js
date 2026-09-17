import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { createSessionStore } from '../../../lib/agentSessions'
import { fullSystemPrompt, roleForPrompt } from './frankieContext'
import { toApiMessages, withCurrentTurn } from '../../../lib/chatAttachments'

// The persona and the data context live in frankieContext.js, pure, so the
// eval runner (scripts/frankie-eval.mjs) can build exactly what production
// builds without a browser. This file is the glue: the store, the payroll
// fetch, the edge function, and the saved conversations.

const FULL_ACCESS_ROLES = new Set(['admin', 'super_admin', 'developer', 'owner'])

// Wages for the year, for the people allowed to see them. Fetched here rather
// than kept in the store because only Frankie and the Payroll page want it.
async function loadPayrollRuns(role) {
  if (!FULL_ACCESS_ROLES.has(String(role || '').toLowerCase())) return null
  const { companyId } = useStore.getState()
  if (!companyId) return null
  try {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('pay_date, period_end, status, total_gross, employee_count')
      .eq('company_id', companyId)
      .order('pay_date', { ascending: false })
      .limit(120)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Frankie Engine] payroll not available:', e?.message)
    return null
  }
}

// What Frankie says he is doing while a tool runs. The reader sees this
// under the answer-in-progress instead of a spinner for thirty seconds.
const LOOKUP_HINTS = {
  query_bank_transactions: 'Pulling the bank rows…',
  query_pnl: 'Running the P&L for that period…',
  query_invoices: 'Pulling the open invoices…',
  query_payments: 'Pulling the payments…',
  query_job_profitability: 'Costing the jobs…',
  query_payroll_runs: 'Pulling the payroll runs…',
  query_bank_balances: 'Checking the bank balances…',
}

/**
 * Stream the answer. Text arrives as it is written; each tool call arrives
 * as a status line. `onChunk(text, meta)` gets the cumulative text, and
 * `meta.status` when a lookup starts (null again when text resumes).
 *
 * `agent: 'frankie'` tells the shared edge function whose tools and model
 * to use. Without it Frankie was offered Arnie's toolset, including the
 * ones that propose record changes.
 */
async function callClaude(conversationHistory, systemPrompt, onChunk) {
  // Attachments ride as content blocks on the turns that carry them, the
  // way Arnie's do; older images age out (lib/chatAttachments).
  const messages = toApiMessages(conversationHistory)

  const session = await supabase.auth.getSession()
  const accessToken = session?.data?.session?.access_token
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arnie-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ agent: 'frankie', messages, systemPrompt, stream: true }),
  })

  if (!res.ok || !res.body) {
    let detail = `Frankie is unavailable (${res.status}).`
    try { const j = await res.json(); detail = j.error || j.details || detail } catch {}
    console.error('[Frankie Engine] Edge function error:', detail)
    throw new Error(detail)
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
      if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); continue }
      if (!line.startsWith('data: ')) continue
      let payload
      try { payload = JSON.parse(line.slice(6)) } catch { continue }
      if (currentEvent === 'text' && payload.delta) {
        full += payload.delta
        onChunk(full, { status: null })
      } else if (currentEvent === 'tool_call') {
        // Text written before a lookup and text written after it are separate
        // paragraphs; without this they ran together ("…overdue list.Gym Interior…").
        if (full && !/\n\s*$/.test(full)) full += '\n\n'
        onChunk(full, { status: LOOKUP_HINTS[payload.name] || 'Looking that up…', tool: payload.name })
      } else if (currentEvent === 'error') {
        throw new Error(payload.message || 'Frankie could not finish that answer.')
      }
    }
  }

  onChunk(full, { status: null })
  return full
}

// The store's `user` IS the signed-in employee row (App.jsx setUser(employee)).
// Its role for Frankie comes from the shared access ladder, never from the
// job-title string alone.
function getUserRole() {
  const { user } = useStore.getState()
  return { role: roleForPrompt(user), userId: user?.id }
}

// The company's own Expense Category names. Books loads these on its own
// page rather than through the store, so Frankie asks for them here.
async function loadExpenseCategories() {
  const { companyId } = useStore.getState()
  if (!companyId) return []
  try {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('name, type')
      .eq('company_id', companyId)
      .order('sort_order')
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[Frankie Engine] expense categories not available:', e?.message)
    return []
  }
}

export async function sendMessageStream(message, history = [], onChunk, attachments = []) {
  const { role } = getUserRole()
  const state = useStore.getState()
  const { user, company } = state

  const [payrollRuns, expenseCategories] = await Promise.all([loadPayrollRuns(role), loadExpenseCategories()])
  const systemPrompt = fullSystemPrompt({
    user, company, role,
    data: { ...state, payrollRuns, expenseCategories },
  })

  const conversationHistory = withCurrentTurn(history, message, attachments)

  return await callClaude(conversationHistory, systemPrompt, onChunk)
}

// Session management — the shared ai_sessions / ai_messages tables, tagged
// module='frankie'. Same helpers Arnie's History tab is built on, from one
// place (see lib/agentSessions.js) instead of a second copy.
const sessions = createSessionStore('frankie', { defaultTitle: 'Financial conversation' })

export const {
  createSession, saveMessage,
  loadSessions, loadSessionMessages, deleteSession,
  renameSession, setSessionPinned, searchSessions,
  rememberLastSession, getLastSessionId, forgetLastSession,
} = sessions
