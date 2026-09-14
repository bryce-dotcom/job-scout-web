import { describe, it, expect, vi, beforeEach } from 'vitest'

// A tiny stand-in for the supabase client, recording what the store asks for.
const state = { rows: [], inserts: [], updates: [], messages: [], lastFilters: null, deletes: [] }

function table(name) {
  const q = { _name: name }
  const chain = new Proxy(q, {
    get(t, prop) {
      if (prop === 'then') return undefined
      if (prop === 'select') return () => chain
      if (prop === 'order') return () => chain
      if (prop === 'limit') return () => (name === 'ai_messages'
        ? Promise.resolve({ data: state.messages, error: null })
        : Promise.resolve({ data: state.rows, error: null }))
      if (prop === 'single') return () => Promise.resolve({ data: state.rows[0] || state.inserts[state.inserts.length - 1], error: null })
      if (prop === 'in') return (col, vals) => { state.lastFilters = { col, vals }; return chain }
      if (prop === 'ilike') return () => chain
      if (prop === 'eq') return () => chain
      if (prop === 'update') return (payload) => { state.updates.push(payload); return chain }
      if (prop === 'insert') return (payload) => { state.inserts.push({ table: name, ...payload }); return chain }
      if (prop === 'delete') return () => { state.deletes.push(name); return chain }
      return () => chain
    },
  })
  return chain
}

// Tests run in node, so window is stubbed with a minimal localStorage.
function fakeStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
  }
}
vi.stubGlobal('window', { localStorage: fakeStorage() })

let currentUser = { email: 'bryce@example.com' }
vi.mock('../lib/supabase', () => ({ supabase: { from: (n) => table(n) } }))
vi.mock('../lib/store', () => ({
  useStore: { getState: () => ({ companyId: 20, user: currentUser }) },
}))

const { createSessionStore, titleFromMessage } = await import('./agentSessions')
const frankie = createSessionStore('frankie', { defaultTitle: 'Financial conversation' })

const session = (id, ctx) => ({ session_id: id, created_at: '2026-09-14T10:00:00Z', context_json: JSON.stringify(ctx) })

beforeEach(() => {
  state.rows = []; state.inserts = []; state.updates = []; state.messages = []; state.lastFilters = null; state.deletes = []
  currentUser = { email: 'bryce@example.com' }
  window.localStorage.clear()
})

describe('titles come from the opening message', () => {
  it('collapses a pasted text message onto one line', () => {
    // The real case: "MES we owe $47,934\nTerms $50,000 45 days\n\nAmex we owe..."
    // showed up in the list as a three-line card.
    const t = titleFromMessage('MES we owe $47,934\nTerms $50,000 45 days\n\nAmex we owe $25,000')
    expect(t).not.toMatch(/\n/)
    expect(t).toBe('MES we owe $47,934 Terms $50,000 45 days Amex we owe $25,000')
  })

  it('truncates long messages and falls back when blank', () => {
    expect(titleFromMessage('x'.repeat(200)).length).toBeLessThanOrEqual(81)
    expect(titleFromMessage('   \n ', 'Financial conversation')).toBe('Financial conversation')
  })

  it('stores the cleaned title against the right module', async () => {
    await frankie.createSession('do i have\nenough money')
    const row = state.inserts.find(i => i.table === 'ai_sessions')
    expect(row.current_module).toBe('frankie')
    expect(JSON.parse(row.context_json).title).toBe('do i have enough money')
  })
})

describe('the conversations you kept stay at the top', () => {
  it('floats pinned conversations above newer unpinned ones', async () => {
    state.rows = [
      session('new', { title: 'Asked this morning' }),
      session('kept', { title: 'Dump trailer vs dumper', pinned: true }),
      session('old', { title: 'Something from June' }),
    ]
    const out = await frankie.loadSessions()
    expect(out.map(s => s.session_id)).toEqual(['kept', 'new', 'old'])
    expect(out[0].pinned).toBe(true)
  })

  it('survives a context_json that is not valid JSON', async () => {
    state.rows = [{ session_id: 'bad', context_json: '{not json' }]
    const out = await frankie.loadSessions()
    expect(out[0].title).toBe('Financial conversation')
    expect(out[0].pinned).toBe(false)
  })

  it('renaming keeps the pin and marks the name as chosen', async () => {
    state.rows = [session('x', { title: 'auto', pinned: true })]
    await frankie.renameSession('x', '  Q3   cash plan ')
    const ctx = JSON.parse(state.updates[0].context_json)
    expect(ctx).toEqual({ title: 'Q3 cash plan', pinned: true, renamed: true })
  })
})

describe('picking up where you left off', () => {
  it('remembers the last conversation for the person who had it', () => {
    frankie.rememberLastSession('abc')
    expect(frankie.getLastSessionId()).toBe('abc')
  })

  it('does not hand one person another person\'s conversation on a shared tablet', () => {
    frankie.rememberLastSession('abc')
    currentUser = { email: 'tracy@example.com' }
    expect(frankie.getLastSessionId()).toBeNull()
  })

  it('forgets a conversation once it is deleted', async () => {
    frankie.rememberLastSession('abc')
    await frankie.deleteSession('abc')
    expect(frankie.getLastSessionId()).toBeNull()
    expect(state.deletes).toEqual(['ai_messages', 'ai_sessions'])
  })

  it('keeps Frankie and Arnie from resuming each other', () => {
    const arnie = createSessionStore('arnie')
    frankie.rememberLastSession('frank-1')
    arnie.rememberLastSession('arnie-1')
    expect(frankie.getLastSessionId()).toBe('frank-1')
    expect(arnie.getLastSessionId()).toBe('arnie-1')
  })
})

describe('searching conversations', () => {
  it('returns everything when the query is blank', async () => {
    const sessions = [{ session_id: 'a', title: 'One' }]
    expect(await frankie.searchSessions('   ', sessions)).toBe(sessions)
  })

  it('matches on message text, not just the title', async () => {
    const sessions = [
      { session_id: 'a', title: 'I got a text from Doug that says we owe MES' },
      { session_id: 'b', title: 'Something else' },
    ]
    state.messages = [{ session_id: 'a', content: 'Pay Amex first, the terms on MES give you 45 days' }]
    const out = await frankie.searchSessions('amex', sessions)
    expect(out.map(s => s.session_id)).toEqual(['a'])
    expect(out[0].matchedOn).toBe('message')
    expect(out[0].snippet).toMatch(/Amex/)
  })

  it('only ever searches inside the caller\'s own sessions', async () => {
    const sessions = [{ session_id: 'mine-1', title: 'x' }, { session_id: 'mine-2', title: 'y' }]
    await frankie.searchSessions('anything', sessions)
    expect(state.lastFilters.col).toBe('session_id')
    expect(state.lastFilters.vals).toEqual(['mine-1', 'mine-2'])
  })
})
