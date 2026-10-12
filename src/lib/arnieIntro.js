// Arnie speaks first, once, to somebody who has never spoken to him.
//
// WHY. Everything he can do sits behind a drawer with four tabs on it, and
// "Computer" means nothing to a person who has not read what we built. The
// whole feature set was invisible for exactly that reason: it was reachable
// and unexplained, which is the same as missing. "A user isn't going to know
// what the hell Computer means... Arnie should talk to them first thing and
// start setting shit up."
//
// WHAT IT IS NOT. Not a second onboarding — /onboarding already exists, has
// six steps and an Arnie option that sets the company up from a conversation,
// and new companies land there at signup. This is for everybody ELSE: the
// crew already inside the app, who never saw that page and never will.
//
// ONCE, AND ONLY ONCE. The signal that somebody has never talked to him is
// that they have no conversations — self-limiting, because the introduction
// itself creates one. The stored flag only stops it reappearing for a person
// who closed the drawer without answering; the session count is the real
// state and the flag is per-device nag suppression, nothing more.

const KEY = (userId) => `arnie:introduced:${userId}`

// localStorage is not always there — a private window, a blocked origin, a
// test runner with no DOM — and a thing that opens itself must not decide
// "already introduced" just because it could not look. Falls back to memory,
// which lasts the tab: he introduces himself once per load at worst instead
// of never, and never twice in a sitting.
const memory = new Map()
const store = {
  get(k) {
    try { return window.localStorage.getItem(k) } catch { return memory.get(k) ?? null }
  },
  set(k, v) {
    try { window.localStorage.setItem(k, v) } catch { memory.set(k, v) }
  },
}

/**
 * What he is asked, on their behalf, to open with.
 *
 * Phrased as the person asking rather than as a script he recites, because
 * the second kind reads as marketing and he has the tools to do the first
 * kind properly — he can look at what is actually set up and say what is
 * missing, which no written welcome can.
 */
export const INTRO_KICKOFF =
  "I'm new to you. In a few lines: who are you, what can you actually do for me, " +
  'and what should we set up first? Check what this company is still missing and ' +
  'start me on whatever matters most — keep it short and do the work for me where you can.'

/** Has this person been introduced on this device? */
export function introDone(userId) {
  if (!userId) return true
  return store.get(KEY(userId)) === '1'
}

export function markIntroDone(userId) {
  if (!userId) return
  store.set(KEY(userId), '1')
}

/** Test seam. Nothing in the app calls this. */
export function _forgetIntros() { memory.clear() }

/**
 * Should he open himself for this person right now?
 *
 * @param {object} a
 * @param {string|number|null} a.userId
 * @param {number} a.sessionCount   conversations they have had with him
 * @param {string} a.path           where they are
 * @param {boolean} a.alreadyOpen
 */
export function shouldIntroduce({ userId, sessionCount, path = '', alreadyOpen = false }) {
  if (!userId || alreadyOpen) return false
  // Somebody who has talked to him does not need introducing, whatever any
  // flag on this device says.
  if (sessionCount > 0) return false
  if (introDone(userId)) return false
  // Not over the top of the thing that is already introducing him, and not
  // on the way in or out.
  if (/^\/(onboarding|login|signup|connect|portal|accept)/.test(path)) return false
  return true
}
