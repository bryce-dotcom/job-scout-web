// The browser's side of the arnie-computer rail.
//
// Every call goes out as the signed-in person's own session, because that is
// the only identity the function accepts — there is no service-key path and no
// as_employee_id. Which means this module cannot reach another person's
// computer even by accident.

import { supabase } from './supabase'

const FN = 'arnie-computer'

async function call(action, body = {}) {
  const { data, error } = await supabase.functions.invoke(FN, { body: { action, ...body } })
  if (error) {
    // A non-2xx arrives as FunctionsHttpError with the body on .context. The
    // rail's refusals are meaningful text ("That is a credential field…"), so
    // losing them to a generic message would be the whole point thrown away.
    let detail = ''
    try { detail = (await error.context?.json())?.error || '' } catch { /* not json */ }
    throw new Error(detail || error.message || 'Could not reach Arnie’s computer rail')
  }
  return data || {}
}

/** Announce a machine. Only the agent calls this; the app never does. */
export const hello = (device) => call('hello', device)

export const grants = () => call('grants')
/** Change the level on a program already allowed. Replaces, never adds —
 *  a second grant does not widen anything, because the narrowest wins. */
export const setTier = ({ app, host = '*', tier }) => call('set_tier', { app, host, tier })

export const grant = ({ app, host = '*', tier = 'watch', duration = 'always', expires_at = null }) =>
  call('grant', { app, host, tier, duration, expires_at })
export const revoke = ({ app, host }) => call('revoke', { app, host })

export const queue = (session_id, action) => call('queue', { session_id, ...action })
export const stop = (session_id) => call('stop', { session_id })

/**
 * "Arnie offers, you accept."
 *
 * Accepting writes the permission AND re-places the action, in that order, on
 * the rail — never here. The browser must not be able to decide that something
 * is allowed; it can only pass on that a person said yes.
 *
 * `duration` is 'once' or 'always'. Once is the default everywhere it is
 * offered: a person saying yes to one job has not said yes to a standing
 * arrangement, and the second tap tomorrow costs them almost nothing.
 */
export const acceptOffer = (action_id, duration = 'once') => call('accept_offer', { action_id, duration })

/** Saying no — the same route as declining an approval, because it is the same act. */
export const declineOffer = (action_id) => call('deny', { action_id })

/**
 * Everything of this person's that is waiting on them: a permission he is
 * asking for, an approval, or something he has stopped at and will not do.
 *
 * Read straight from the table — RLS scopes it, and a list is not worth a
 * function invocation. Ordered oldest first so answering them in order is
 * answering them in the order they happened.
 */
export async function myOffers(employeeId) {
  if (!employeeId) return []
  const { data } = await supabase
    .from('arnie_computer_actions')
    .select('id,session_id,kind,app,host,target,decision,reason,wants_tier,expires_at,created_at')
    .eq('employee_id', employeeId)
    .in('decision', ['needs_grant', 'needs_approval', 'awaiting_human'])
    .is('completed_at', null)
    .order('id')
    .limit(10)
  // An offer with a deadline that has passed is not answerable; the rail says
  // so too, but showing a button that cannot work is worse than showing none.
  const now = Date.now()
  return (data || []).filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
}

/**
 * This person's most recent session, and the newest action on it.
 *
 * Read straight from the tables rather than through the function: RLS already
 * scopes them to the tenant and these are reads, so there is no reason to pay
 * for a function invocation to look at a list.
 */
export async function myComputer(employeeId) {
  if (!employeeId) return { session: null, latest: null, actions: [] }
  const { data: sessions } = await supabase
    .from('arnie_computer_sessions')
    .select('id,device_label,platform,agent_version,agent_build,status,last_seen_at,started_at,ended_at,capabilities')
    .eq('employee_id', employeeId)
    .order('id', { ascending: false })
    .limit(1)
  const session = sessions?.[0] || null
  if (!session) return { session: null, latest: null, actions: [] }

  const { data: actions } = await supabase
    .from('arnie_computer_actions')
    .select('id,kind,app,host,target,decision,reason,result,created_at,completed_at')
    .eq('session_id', session.id)
    .order('id', { ascending: false })
    .limit(60)
  return { session, latest: actions?.[0] || null, actions: actions || [] }
}

/** The grants rows, newest first, for the Computer tab's list. */
export async function myGrants(employeeId) {
  if (!employeeId) return []
  const { data } = await supabase
    .from('arnie_computer_grants')
    .select('id,app,host,tier,duration,granted_at,expires_at,consumed_at')
    .eq('employee_id', employeeId)
    .is('revoked_at', null)
    .order('app')
  return data || []
}
