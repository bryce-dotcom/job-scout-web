import { describe, it, expect, vi, beforeEach } from 'vitest'

// The signed-in user is varied per test — that is the point of most of them.
const current = { email: 'alayda@hhh.services' }
vi.mock('../lib/store', () => ({
  useStore: { getState: () => ({ companyId: 3, user: current.email ? { email: current.email } : null }) },
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }))
vi.mock('../pages/agents/arnie/arnieTools', () => ({
  getUserRole: () => ({ role: 'admin', userId: 1 }),
  assembleDataContext: () => '',
  getDataLoadStatus: () => ({}),
  isClockedIn: () => false,
}))

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}

const { rememberLastSession, getLastSessionId, forgetLastSession } =
  await import('../pages/agents/arnie/arnieEngine')

beforeEach(() => {
  current.email = 'alayda@hhh.services'
  vi.stubGlobal('window', { localStorage: fakeStorage() })
})

describe('reopening the panel lands back where you were', () => {
  it('remembers the conversation and hands it back', () => {
    rememberLastSession('sess-123')
    expect(getLastSessionId()).toBe('sess-123')
  })

  it('has nothing to resume before anything has been said', () => {
    expect(getLastSessionId()).toBeNull()
  })

  it('moves on when a newer conversation replaces it', () => {
    rememberLastSession('sess-old')
    rememberLastSession('sess-new')
    expect(getLastSessionId()).toBe('sess-new')
  })

  it('ignores an empty session id rather than storing a hole', () => {
    rememberLastSession('sess-123')
    rememberLastSession(null)
    expect(getLastSessionId()).toBe('sess-123')
  })
})

describe('a shared device does not leak one person into another', () => {
  it('will not resume a conversation belonging to whoever had the tablet last', () => {
    // Field crews pass one tablet around. Resuming the previous user's chat
    // would show an employee someone else's conversation, which is a privacy
    // problem rather than a convenience bug.
    rememberLastSession('alaydas-chat')
    current.email = 'noah@hhh.services'
    expect(getLastSessionId()).toBeNull()
  })

  it('gives it back when the original user returns', () => {
    rememberLastSession('alaydas-chat')
    current.email = 'noah@hhh.services'
    expect(getLastSessionId()).toBeNull()
    current.email = 'alayda@hhh.services'
    expect(getLastSessionId()).toBe('alaydas-chat')
  })

  it('resumes nothing when nobody is signed in', () => {
    rememberLastSession('alaydas-chat')
    current.email = null
    expect(getLastSessionId()).toBeNull()
  })
})

describe('when storage misbehaves', () => {
  it('stays quiet if localStorage cannot be reached at all', () => {
    // Safari private mode throws on access. Resuming is a convenience; it must
    // never be the thing that stops the panel opening.
    vi.stubGlobal('window', { get localStorage() { throw new Error('denied') } })
    expect(() => rememberLastSession('sess-1')).not.toThrow()
    expect(getLastSessionId()).toBeNull()
  })

  it('stays quiet if the write is refused', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} },
    })
    expect(() => rememberLastSession('sess-1')).not.toThrow()
  })

  it('treats corrupt stored data as nothing to resume', () => {
    const store = fakeStorage()
    store.setItem('arnie:lastSession', '{not json')
    vi.stubGlobal('window', { localStorage: store })
    expect(getLastSessionId()).toBeNull()
  })

  it('clears cleanly', () => {
    rememberLastSession('sess-123')
    forgetLastSession()
    expect(getLastSessionId()).toBeNull()
  })
})
