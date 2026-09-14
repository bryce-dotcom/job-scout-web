// Conversation storage shared by the chat agents.
//
// Every agent keeps its conversations in the same two tables — ai_sessions
// and ai_messages — told apart by a module name. Arnie grew a full set of
// helpers around that (history, pin, rename, search, "which chat was I in?")
// and Frankie had only the first third of the same code, copied. This is
// the whole set, once, parameterised by module, so the next agent to get a
// History tab does not need a third copy.
//
// Arnie's engine still carries its own copy of these functions; it is
// unchanged here and can move over when someone is in that file anyway.

import { supabase } from './supabase'
import { useStore } from './store'

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/**
 * The title shown in History is taken from the opening message, and that is
 * often pasted in — a text from a supplier, with its line breaks intact. A
 * title with newlines in it wraps into a three-line card. Collapse it.
 */
export function titleFromMessage(text, fallback = 'Untitled conversation', max = 80) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return fallback
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean
}

function parseContext(json) {
  try { return JSON.parse(json || '{}') || {} } catch { return {} }  // corrupt context reads as empty
}

/**
 * Build the helpers for one agent.
 *
 * @param {string} module         the ai_sessions.current_module / ai_messages.module_used value
 * @param {object} [opts]
 * @param {string} [opts.defaultTitle]  what an untitled conversation is called
 * @param {string} [opts.lastSessionKey] localStorage key for "resume where I was"
 */
export function createSessionStore(module, opts = {}) {
  const defaultTitle = opts.defaultTitle || 'Untitled conversation'
  const LAST_SESSION_KEY = opts.lastSessionKey || `${module}:lastSession`

  async function createSession(title) {
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
        current_module: module,
        context_json: JSON.stringify({ title: titleFromMessage(title, defaultTitle) }),
      })
      .select()
      .single()

    if (error) {
      console.error(`[${module}] Error creating session:`, error)
      return null
    }
    return data
  }

  async function saveMessage(sessionId, role, content) {
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
        module_used: module,
      })

    if (error) console.error(`[${module}] Error saving message:`, error)

    await supabase
      .from('ai_sessions')
      .update({ last_activity: now })
      .eq('session_id', sessionId)
  }

  // Everything kept about a conversation beyond its messages — title, pinned,
  // renamed — lives in the one context_json column. Read-modify-write so a
  // pin never drops the title, and so this needs no migration.
  async function patchSessionContext(sessionId, patch) {
    if (!sessionId) return
    const existing = await supabase
      .from('ai_sessions')
      .select('context_json')
      .eq('session_id', sessionId)
      .single()
    const ctx = parseContext(existing.data?.context_json)
    await supabase
      .from('ai_sessions')
      .update({ context_json: JSON.stringify({ ...ctx, ...patch }) })
      .eq('session_id', sessionId)
  }

  /** Rename by hand. Flagged so an auto-title never overwrites it later. */
  async function renameSession(sessionId, title) {
    const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!clean) return
    return patchSessionContext(sessionId, { title: clean, renamed: true })
  }

  async function setSessionPinned(sessionId, pinned) {
    return patchSessionContext(sessionId, { pinned: !!pinned })
  }

  async function loadSessions() {
    const { companyId, user } = useStore.getState()
    const { data, error } = await supabase
      .from('ai_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_email', user?.email)
      .eq('current_module', module)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(`[${module}] Error loading sessions:`, error)
      return []
    }

    // Pinned conversations float to the top: a pinned one is one someone
    // deliberately kept, and burying it under this morning's question
    // defeats the point.
    return (data || [])
      .map(s => {
        const ctx = parseContext(s.context_json)
        return {
          ...s,
          title: ctx.title || defaultTitle,
          pinned: ctx.pinned === true,
          renamed: ctx.renamed === true,
        }
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  }

  /**
   * Find conversations by name OR by something said inside them. Titles are
   * auto-generated from the first message, so the thing you remember saying
   * is usually in the middle of a chat called something else.
   *
   * Content matching is restricted to the session ids already loaded for
   * this user, so it can never surface a colleague's conversation.
   */
  async function searchSessions(term, sessions) {
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
      if (error) console.error(`[${module}] message search failed:`, error)
      for (const m of data || []) {
        if (!hits.has(m.session_id)) hits.set(m.session_id, 'message')
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

  async function loadSessionMessages(sessionId) {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })

    if (error) {
      console.error(`[${module}] Error loading messages:`, error)
      return []
    }
    return data || []
  }

  async function deleteSession(sessionId) {
    await supabase.from('ai_messages').delete().eq('session_id', sessionId)
    await supabase.from('ai_sessions').delete().eq('session_id', sessionId)
    if (getLastSessionId() === sessionId) forgetLastSession()
  }

  // ── Which conversation was I last in? ──────────────────────────────
  //
  // Leaving the chat tab unmounts it, and coming back used to show a blank
  // welcome screen even though every message had been saved. Keyed per user
  // because these are shared devices — a tablet in a truck gets passed
  // around, and resuming the last person's chat would show one employee
  // another's conversation.
  const lastSessionStore = () => {
    try { return window.localStorage } catch { return null }  // Safari private mode
  }

  function rememberLastSession(sessionId) {
    const store = lastSessionStore()
    const email = useStore.getState().user?.email
    if (!store || !email || !sessionId) return
    try {
      store.setItem(LAST_SESSION_KEY, JSON.stringify({ email, sessionId }))
    } catch { /* quota or disabled storage — resuming is a convenience, not a promise */ }
  }

  function getLastSessionId() {
    const store = lastSessionStore()
    const email = useStore.getState().user?.email
    if (!store || !email) return null
    try {
      const saved = JSON.parse(store.getItem(LAST_SESSION_KEY) || 'null')
      return saved?.email === email ? saved.sessionId || null : null
    } catch { return null }
  }

  function forgetLastSession() {
    try { lastSessionStore()?.removeItem(LAST_SESSION_KEY) } catch { /* nothing to clean up */ }
  }

  return {
    createSession, saveMessage,
    loadSessions, loadSessionMessages, deleteSession,
    renameSession, setSessionPinned, searchSessions,
    rememberLastSession, getLastSessionId, forgetLastSession,
  }
}
