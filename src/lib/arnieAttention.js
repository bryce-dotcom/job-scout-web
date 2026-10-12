// Does your assistant have something for you?
//
// One definition, because the badge appears in more than one place and two
// answers to "is there a dot" is worse than no dot. Bryce wanted it to feel
// like an unread text: you should be able to tell at a glance, from anywhere
// in the app, without opening Arnie to find out.
//
// THREE THINGS COUNT, and they are the three that are genuinely waiting on
// THIS person — not news, not activity, not something interesting:
//
//   1. A card he has drafted and cannot apply until somebody approves it.
//   2. Something on their computer he has stopped at: a sign-in he will not
//      do, or an action a rule says to check first.
//   3. An unread notification he raised — a routine's answer, a nudge.
//
// What deliberately does NOT count: anything already decided, anything
// belonging to somebody else, and notifications from the rest of the app. A
// badge that lights up for things you cannot act on gets ignored within a
// week, and then it is worth nothing when it matters.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useStore } from './store'

/** Notification types Arnie raises. Others belong to other parts of the app. */
const ARNIE_NOTIFICATION_TYPES = ['arnie_routine', 'arnie_nudge', 'arnie_brief']

/**
 * What is waiting, and why. Returns zeroes rather than throwing: a badge is
 * never worth breaking a page for.
 */
export async function arnieAttention({ employeeId, companyId } = {}) {
  const empty = { total: 0, proposals: 0, computer: 0, notifications: 0, reasons: [] }
  if (!employeeId || !companyId) return empty

  const [props, computer, notes] = await Promise.all([
    // Their own drafts, still undecided.
    supabase.from('arnie_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('created_by', employeeId).eq('status', 'pending')
      .then((r) => r.count || 0, () => 0),
    // Stopped on their machine, waiting for them.
    supabase.from('arnie_computer_actions')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId).in('decision', ['awaiting_human', 'needs_approval'])
      .is('completed_at', null)
      .then((r) => r.count || 0, () => 0),
    // Unread, and his.
    supabase.from('employee_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId).is('read_at', null)
      .in('type', ARNIE_NOTIFICATION_TYPES)
      .then((r) => r.count || 0, () => 0),
  ])

  const reasons = []
  if (computer) reasons.push(computer === 1 ? 'is waiting on you at your computer' : `is waiting on you ${computer} times at your computer`)
  if (props) reasons.push(props === 1 ? 'has a card for you to approve' : `has ${props} cards for you to approve`)
  if (notes) reasons.push(notes === 1 ? 'has something to tell you' : `has ${notes} things to tell you`)

  return { total: props + computer + notes, proposals: props, computer, notifications: notes, reasons }
}

/**
 * One line for a tooltip or aria-label.
 * @param {{reasons: string[]}} a
 * @param {string} name what this person calls their assistant
 */
export function attentionLabel(a, name = 'Arnie') {
  if (!a?.total) return `Ask ${name}`
  return `${name} ${a.reasons.join(', and ')}`
}

/** 9+ rather than a number nobody reads at 16 pixels. */
export function badgeText(total) {
  if (!total) return ''
  return total > 9 ? '9+' : String(total)
}

/**
 * The live count, for anywhere that wants to badge the assistant.
 *
 * Polls rather than subscribes: the three sources are three different tables,
 * a realtime channel on each is three connections per tab, and a badge that
 * is thirty seconds stale is still a badge that works. It also backs off
 * while the tab is hidden, because a phone in a pocket does not need it.
 */
export function useArnieAttention() {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [state, setState] = useState({ total: 0, proposals: 0, computer: 0, notifications: 0, reasons: [] })

  useEffect(() => {
    if (!user?.id || !companyId) return
    let alive = true
    let timer
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        const a = await arnieAttention({ employeeId: user.id, companyId })
        if (!alive) return
        // Only re-render when the number actually moves.
        setState((prev) => (prev.total === a.total ? prev : a))
      }
      timer = setTimeout(tick, 30000)
    }
    tick()
    const onShow = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onShow)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onShow) }
  }, [user?.id, companyId])

  return state
}
