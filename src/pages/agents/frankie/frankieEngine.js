import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { createSessionStore } from '../../../lib/agentSessions'
import { fullSystemPrompt } from './frankieContext'

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
  const messages = conversationHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content,
  }))

  const { data, error } = await supabase.functions.invoke('arnie-chat', {
    body: {
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

function getUserRole() {
  const state = useStore.getState()
  const employee = state.employee
  const role = employee?.role || 'user'
  const userId = employee?.id
  return { role, userId }
}

export async function sendMessageStream(message, history = [], onChunk) {
  const { role } = getUserRole()
  const state = useStore.getState()
  const { user, company } = state

  const systemPrompt = fullSystemPrompt({
    user, company, role,
    data: { ...state, payrollRuns: await loadPayrollRuns(role) },
  })

  const conversationHistory = [
    ...history,
    { role: 'user', content: message }
  ]

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
