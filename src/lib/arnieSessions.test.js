import { describe, it, expect, vi, beforeEach } from 'vitest'

// A tiny stand-in for the supabase client, recording what the engine asks for.
const state = { rows: [], updates: [], messages: [], lastFilters: null }

function table(name) {
  const q = { _name: name, _filters: {} }
  const chain = new Proxy(q, {
    get(t, prop) {
      if (prop === 'then') return undefined
      if (prop === 'select') return () => chain
      if (prop === 'order') return () => chain
      if (prop === 'limit') return () => (name === 'ai_messages'
        ? Promise.resolve({ data: state.messages, error: null })
        : Promise.resolve({ data: state.rows, error: null }))
      if (prop === 'single') return () => Promise.resolve({ data: state.rows[0], error: null })
      if (prop === 'in') return (col, vals) => { state.lastFilters = { col, vals }; return chain }
      if (prop === 'ilike') return () => chain
      if (prop === 'eq') return () => chain
      if (prop === 'update') return (payload) => { state.updates.push(payload); return chain }
      if (prop === 'insert') return () => chain
      if (prop === 'delete') return () => chain
      return () => chain
    },
  })
  return chain
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (n) => table(n) } }))
vi.mock('../pages/agents/arnie/arnieTools', () => ({
  getUserRole: () => ({ role: 'admin', userId: 1 }),
  assembleDataContext: () => '',
  getDataLoadStatus: () => ({}),
  isClockedIn: () => false,
}))
vi.mock('../lib/store', () => ({
  useStore: { getState: () => ({ companyId: 3, user: { email: 'a@b.c' } }) },
}))

const { loadSessions, updateSessionTitle, searchSessions } =
  await import('../pages/agents/arnie/arnieEngine')

const session = (id, ctx) => ({ session_id: id, created_at: '2026-08-20T10:00:00Z', context_json: JSON.stringify(ctx) })

beforeEach(() => { state.rows = []; state.updates = []; state.messages = []; state.lastFilters = null })

describe('the conversations you kept stay at the top', () => {
  it('floats pinned conversations above newer unpinned ones', async () => {
    // Pinning means "I will come back to this". Burying it under whatever was
    // asked this morning is exactly the thing pinning is supposed to prevent.
    state.rows = [
      session('new', { title: 'Asked this morning' }),
      session('kept', { title: 'Product catalogue clean-up', pinned: true }),
      session('old', { title: 'Something from March' }),
    ]
    const out = await loadSessions()
    expect(out.map(s => s.session_id)).toEqual(['kept', 'new', 'old'])
    expect(out[0].pinned).toBe(true)
  })

  it('survives a context_json that is not valid JSON', async () => {
    // One corrupt row should cost that row its title, not take out the page.
    state.rows = [{ session_id: 'bad', context_json: '{not json' }]
    const out = await loadSessions()
    expect(out[0].title).toBe('Untitled conversation')
    expect(out[0].pinned).toBe(false)
  })
})

describe('a name someone chose is not overwritten', () => {
  it('skips the auto-title once a conversation has been renamed', async () => {
    // updateSessionTitle runs off the opening message of every chat. Without
    // this guard it would quietly rename "Product catalogue clean-up" back to
    // whatever the first question happened to be.
    state.rows = [session('x', { title: 'Product catalogue clean-up', renamed: true })]
    await updateSessionTitle('x', 'Will you check my product & see if there is any inconsist')
    expect(state.updates).toHaveLength(0)
  })

  it('still auto-titles a conversation nobody has named', async () => {
    state.rows = [session('x', {})]
    await updateSessionTitle('x', 'How many jobs are open?')
    expect(state.updates).toHaveLength(1)
    expect(JSON.parse(state.updates[0].context_json).title).toBe('How many jobs are open?')
  })
})

describe('searching conversations', () => {
  it('returns everything when the query is blank', async () => {
    const sessions = [{ session_id: 'a', title: 'One' }]
    expect(await searchSessions('   ', sessions)).toBe(sessions)
  })

  it('matches on message text, not just the title', async () => {
    // The real case: a conversation auto-titled "Will you check my product…"
    // is the one where "dupes" was said. Title search alone never finds it.
    const sessions = [
      { session_id: 'a', title: 'Will you check my product & see if there is any inconsistancies' },
      { session_id: 'b', title: 'Something else' },
    ]
    state.messages = [{ session_id: 'a', content: 'Clean up the dupes on the window cleaning sides' }]
    const out = await searchSessions('dupes', sessions)
    expect(out.map(s => s.session_id)).toEqual(['a'])
    expect(out[0].matchedOn).toBe('message')
    expect(out[0].snippet).toMatch(/dupes/)
  })

  it('only ever searches inside the caller\'s own sessions', async () => {
    // The message table holds the whole company. Scoping the query to the ids
    // already loaded for this user is what stops a search surfacing a
    // colleague's conversation.
    const sessions = [{ session_id: 'mine-1', title: 'x' }, { session_id: 'mine-2', title: 'y' }]
    await searchSessions('anything', sessions)
    expect(state.lastFilters.col).toBe('session_id')
    expect(state.lastFilters.vals).toEqual(['mine-1', 'mine-2'])
  })
})
