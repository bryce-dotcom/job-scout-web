// Arnie's "where am I".
//
// Bryce wants: "Arnie use my location to find the customer/business name and
// adress phone number and any other relevant info about the location im at".
//
// THE RULE: the position is only asked for when the message is actually about
// where they are. Not every turn, and not on page load.
//
// Two reasons, and the second is the one that matters. A GPS fix costs
// battery and takes seconds on a phone in a building, so taking one for "how
// many overdue invoices" is waste. But more than that, a permission prompt
// that appears for no visible reason is a permission people deny — and once
// denied in a browser it is genuinely awkward to undo. Asking at the moment
// somebody says "who is this building" makes the prompt self-explanatory, and
// they say yes.
//
// Nothing here ever guesses. If the fix is refused, unavailable or stale, the
// server is told nothing and Arnie says he has not got it — which is the
// honest answer, and the only one that cannot send somebody to the wrong
// address.

// Phrased the way people ask. Deliberately NOT just the word "location":
// "the location of the Halifax job" is a question about a record, and taking
// a GPS fix to answer it would be absurd.
const ASKS_WHERE = [
  /\b(my|our) location\b/i,
  /\bwhere (am|are) (i|we)\b/i,
  /\bwhere i am\b/i,
  /\buse (my|the) (location|gps|position)\b/i,
  /\b(this|the) (building|business|place|address|property|site|store|shop)\b.*\b(who|what|name|whose)\b/i,
  /\b(who|what|whose)('s|s| is| are)?\b.*\b(this|the) (building|business|place|address|property|site)\b/i,
  /\bam i at\b/i,
  /\bwhere i'?m (at|standing)\b/i,
  /\bi'?m (standing )?(at|outside|in front of)\b.*\b(this|a|the)\b/i,
  /\bcurrent location\b/i,
  /\bnearby business/i,
  /\bwhat'?s (around|near) (me|here)\b/i,
]

/** Is this message about where the person physically is? */
export function asksAboutHere(text) {
  const t = String(text || '')
  if (!t.trim()) return false
  return ASKS_WHERE.some((re) => re.test(t))
}

/**
 * A position, or null. Never throws, never blocks for long, never guesses.
 *
 * `timeout` is deliberately short. Somebody standing in a car park waiting
 * for an answer would rather be told "I could not get a fix" after eight
 * seconds than watch a spinner — and a fix that takes longer than that
 * indoors is usually not coming.
 *
 * maximumAge lets a fix from the last minute be reused, which matters when
 * they ask a follow-up ("what's their phone number?") — taking a second fix
 * for that would be slower and no more accurate.
 */
export function getPosition({ timeout = 8000, maximumAge = 60000 } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    // A belt-and-braces timer: some browsers have been known to never call
    // either callback when permission is in a half-granted state, and a
    // promise that never settles would hang the whole message.
    const t = setTimeout(() => done(null), timeout + 1500)
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(t)
          const c = pos?.coords
          if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) { done(null); return }
          done({
            lat: c.latitude,
            lng: c.longitude,
            // Carried through so Arnie can say "give or take 40 metres"
            // instead of presenting a phone fix as a certainty.
            accuracy: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : undefined,
          })
        },
        () => { clearTimeout(t); done(null) },   // denied, unavailable, timed out — all the same answer
        { enableHighAccuracy: true, timeout, maximumAge },
      )
    } catch {
      clearTimeout(t)
      done(null)
    }
  })
}
