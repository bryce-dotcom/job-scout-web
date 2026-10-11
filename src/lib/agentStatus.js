// What an agent's badge says, and the one place it is decided.
//
// Grok's team landed on this after testing the alternative: they tried showing
// a text description of every step an agent took, and found users "wanted more
// detail than was useful". So the signal is ambient — a dot, a word, a colour —
// and the detail is on hover, on demand. We copy the finding, not the taste.
//
// The header already had a hardcoded green "Active" badge, which is
// reassurance rather than information. These states are the information.
//
// ONE state is loud on purpose. 'waiting' is not progress, it is a question:
// Arnie has stopped at a sign-in page or an irreversible button and nothing
// moves until a person does something. A quiet dot for that would mean a rep
// walks away from a half-filled rebate application.

export const AGENT_STATES = {
  idle: { label: 'Active', colour: '#22c55e', tint: 'rgba(34,197,94,0.14)', ink: '#15803d', loud: false },
  thinking: { label: 'Thinking', colour: '#3b82f6', tint: 'rgba(59,130,246,0.14)', ink: '#1d4ed8', loud: false },
  working: { label: 'Working', colour: '#3b82f6', tint: 'rgba(59,130,246,0.14)', ink: '#1d4ed8', loud: false, pulse: true },
  // The one that interrupts.
  waiting: { label: 'Needs you', colour: '#eab308', tint: 'rgba(234,179,8,0.18)', ink: '#92400e', loud: true, pulse: true },
  // Two different things that both stop work, and they must not share a word.
  // 'blocked' is the kill switch — a person decided. 'stale' is the agent not
  // answering, which is a laptop asleep or a window closed, and telling
  // somebody "Stopped" for that sends them looking for a decision they never
  // made.
  blocked: { label: 'Stopped', colour: '#ef4444', tint: 'rgba(239,68,68,0.14)', ink: '#b91c1c', loud: true },
  stale: { label: 'Not answering', colour: '#7d8a7f', tint: 'rgba(125,138,127,0.14)', ink: '#4d5a52', loud: false },
  done: { label: 'Done', colour: '#22c55e', tint: 'rgba(34,197,94,0.14)', ink: '#15803d', loud: false },
}

/** Unknown names fall back to idle rather than rendering nothing. */
export function agentState(name) {
  return AGENT_STATES[name] || AGENT_STATES.idle
}

/**
 * The state of a computer session, from its row and its newest action.
 *
 * Derived in one place because three surfaces want the same answer: the header
 * badge, the Computer tab, and the handoff banner.
 */
export function computerState({ session, latest, actions, staleSeconds = 90, now = Date.now() } = {}) {
  if (!session || session.status === 'ended') return { state: 'idle', detail: 'Not on a computer' }
  if (session.status === 'stopped') return { state: 'blocked', detail: 'You stopped Arnie on this computer' }

  const seen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0
  if (now - seen > staleSeconds * 1000) {
    return { state: 'stale', detail: 'The agent has not checked in — is it still running on that computer?' }
  }

  // Look across everything OUTSTANDING, not just the newest row. Judging by
  // the newest alone meant a handoff went quiet the moment anything happened
  // after it: Arnie stops at a sign-in page, takes one more screenshot, and
  // the badge drops back to green with nobody told. An unanswered question is
  // the state of the session until it is answered.
  const open = Array.isArray(actions) ? actions : (latest ? [latest] : [])
  const needsMe = open.find((a) => a.decision === 'awaiting_human' || a.decision === 'needs_approval')
  if (needsMe) {
    return {
      state: 'waiting',
      detail: needsMe.reason || 'Arnie needs you to do this one',
      actionId: needsMe.id,
    }
  }
  const running = open.find((a) => a.decision === 'queued')
  if (running) return { state: 'working', detail: describeAction(running) }
  return { state: 'idle', detail: `On ${session.device_label || 'your computer'}` }
}

/** One short line for a hover, a log row or a banner. */
export function describeAction(a) {
  if (!a) return ''
  const t = a.target || {}
  const where = t.label || t.name || t.text || (t.x !== undefined ? `(${t.x}, ${t.y})` : '')
  const verb = {
    screenshot: 'Looking at', read_text: 'Reading', click: 'Clicking', double_click: 'Double-clicking',
    right_click: 'Right-clicking', type: 'Typing into', key: 'Pressing a key in',
    scroll: 'Scrolling', drag: 'Dragging in', launch: 'Opening',
  }[a.kind] || a.kind
  const place = a.host && a.host !== '*' ? a.host : a.app
  return [verb, where && `“${where}”`, place && `in ${place}`].filter(Boolean).join(' ')
}
