// Takeoff mode: the assistant listens and says nothing.
//
// A rep walking a building counting fixtures talks in bursts. "Back room,
// four highbays" — then forty seconds of actually counting — then "two wall
// packs by the door". Normal voice chat is built for the opposite shape: it
// treats three seconds of quiet as the end of your sentence, sends what it
// has, and starts talking back. On a takeoff that is useless twice over. It
// cuts the count into fragments, and it talks over the person counting.
//
// So in takeoff mode: nothing is sent on a pause, however long; nothing is
// spoken back; the speech accumulates until the rep says they are finished.
// Then the whole thing goes at once — and because it arrives as a spoken
// instruction it gets read back first, which is exactly the check a takeoff
// needs before anything is built from it.
//
// Bryce: "we want her to be silent even with long pauses so they can count
// things or however they are building she should just listen until they
// indicate they are done."

// Said to START it. Phrased the several ways people actually say it, because
// somebody who has to remember one magic phrase will use the button instead
// and somebody who cannot find the button will give up.
const ON_PHRASES = [
  'takeoff mode', 'take off mode', 'taking off mode',
  'silent mode', 'quiet mode', 'listen mode',
  'be quiet', 'stay quiet', 'stop talking', 'just listen',
  'start the takeoff', 'start a takeoff', 'start takeoff',
  'let me count', 'i am counting', "i'm counting",
]

// Said to FINISH it. These are matched only at the END of what was said,
// because "that's it for the back room" is a rep still working, not a rep
// finished — and ending a takeoff early sends half a building.
const OFF_PHRASES = [
  "that's it", 'thats it', "that's the takeoff", 'thats the takeoff',
  "that's all", 'thats all', "i'm done", 'im done', 'i am done',
  'all done', 'we are done', "we're done", 'done with the takeoff',
  'end takeoff', 'end the takeoff', 'finished', 'go ahead', 'send it',
  'that is everything', "that's everything", 'thats everything',
]

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Did they ask to start? Returns the phrase found and the text with it
 * removed, so "takeoff mode — back room, four highbays" keeps the four
 * highbays instead of throwing the first thing they said away.
 */
export function startsTakeoff(text) {
  const n = norm(text)
  if (!n) return { hit: null, rest: '' }
  for (const p of ON_PHRASES) {
    const i = n.indexOf(p)
    if (i === -1) continue
    // Only when it is how the sentence OPENS. Otherwise "I'll put it in
    // silent mode later" would arm it mid-conversation.
    if (i > 12) continue
    return { hit: p, rest: n.slice(i + p.length).replace(/^[\s,.]+/, '') }
  }
  return { hit: null, rest: '' }
}

/**
 * Did they say they are finished? Only counts at the very end of the
 * utterance; anything before it is kept as part of the takeoff.
 */
export function endsTakeoff(text) {
  const n = norm(text)
  if (!n) return { hit: null, rest: '' }
  for (const p of OFF_PHRASES) {
    if (n === p) return { hit: p, rest: '' }
    if (n.endsWith(' ' + p)) return { hit: p, rest: n.slice(0, n.length - p.length - 1).trim() }
  }
  return { hit: null, rest: '' }
}

/**
 * Join what has been collected so far with the latest run of recognition.
 *
 * Needed because the browser restarts recognition on every long silence and
 * `event.results` starts empty again each time — which on a takeoff, where
 * the silences are the whole point, means the earlier rooms are simply gone
 * unless they are carried over. Overlap is dropped rather than repeated: a
 * restart sometimes re-reports the tail of the previous run, and a takeoff
 * that counts the same eight highbays twice is worse than one that stops.
 */
export function joinSegments(carried, latest) {
  const a = String(carried || '').trim()
  const b = String(latest || '').trim()
  if (!a) return b
  if (!b) return a
  if (a.endsWith(b)) return a
  // Longest suffix of `a` that `b` repeats at its start.
  const max = Math.min(a.length, b.length)
  for (let len = max; len >= 12; len--) {
    if (a.slice(a.length - len).toLowerCase() === b.slice(0, len).toLowerCase()) {
      return (a + b.slice(len)).trim()
    }
  }
  return `${a} ${b}`.trim()
}

/** What the banner says while it is on. */
export const TAKEOFF_HINT = 'Listening. Take your time — say "that\'s it" when you\'re done.'
