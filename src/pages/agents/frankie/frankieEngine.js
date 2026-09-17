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

async function callClaude(conversationHistory, systemPrompt, onChunk) {
  // Attachments ride as content blocks on the turns that carry them, the
  // way Arnie's do; older images age out (lib/chatAttachments).
  const messages = toApiMessages(conversationHistory)

  // `agent` tells the shared edge function whose tools and model to use.
  // Without it Frankie was offered Arnie's toolset, including the ones that
  // propose record changes.
  const { data, error } = await supabase.functions.invoke('arnie-chat', {
    body: {
      agent: 'frankie',
      messages,
      systemPrompt,
      sessionId: null,
    },
  })

  if (error) {
    let detail = error.message || 'Failed to call AI'
    if (error.context?.body) {
      try {
        const reader = error.context.body.getReader()
        const { value } = await reader.read()
        const text = new TextDecoder().decode(value)
        const parsed = JSON.parse(text)
        detail = parsed.error || parsed.details || text
      } catch {}
    }
    console.error('[Frankie Engine] Edge function error:', detail)
    throw new Error(detail)
  }

  if (data?.error) {
    console.error('[Frankie Engine] AI error:', data.error, data.details)
    throw new Error(data.error)
  }

  const reply = data?.reply || ''
  onChunk(reply)
  return reply
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
