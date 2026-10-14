// The microphone hearing the assistant and sending it back as you.
//
// From Bryce's own transcript, 2026-10-14. He said "check my email"; she
// answered; and his next three "messages" were her previous answers, word for
// word, read back into the microphone by his speakers. She then replied to
// herself, twice, before working out what was happening. Every round of that
// is real money and a conversation nobody can steer.
//
// The immediate cause was a safety timer that force-resumed the mic thirty
// seconds after sending, whether or not she was still speaking — and her
// answers are often longer than thirty seconds. That is fixed where it lives.
// This is the second line of defence, and the one that holds whatever the
// timing does: a speaker turned up loud will always leak into a microphone,
// so the thing to check is not WHEN we listened but WHAT we heard.
//
// Deliberately conservative. Refusing to send something a person actually
// said is worse than the echo it prevents, so a short agreement that happens
// to appear in her answer — "yes", "go ahead", "that one" — is never treated
// as an echo, however well it matches.

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** Long enough that saying it by accident is not plausible. */
const MIN_WORDS = 6

/**
 * Did the microphone just hear the assistant?
 *
 * `said` is what speech recognition produced; `spoken` is what the assistant
 * last said out loud. True only when `said` is a real run of the assistant's
 * own words — contained in them outright, or sharing a long unbroken stretch.
 */
export function looksLikeEcho(said, spoken) {
  const a = norm(said)
  const b = norm(spoken)
  if (!a || !b) return false

  const words = a.split(' ')
  // Short utterances are how people actually steer a conversation. "Yes",
  // "stop", "the second one" — all of which may appear verbatim in what she
  // just said, and none of which may ever be swallowed.
  if (words.length < MIN_WORDS) return false

  // Said back whole. This is what the real failure looked like.
  if (b.includes(a)) return true

  // Or a long unbroken run of it — recognition drops and mangles words, so an
  // echo is rarely a perfect copy of a long reply.
  const bWords = b.split(' ')
  let best = 0
  for (let i = 0; i < words.length; i++) {
    const at = bWords.indexOf(words[i])
    if (at === -1) continue
    let run = 0
    while (i + run < words.length && at + run < bWords.length && words[i + run] === bWords[at + run]) run++
    if (run > best) best = run
    if (best >= 12) return true
  }
  // A long run that is also most of what was heard: the tail of her answer,
  // picked up after the start was missed.
  return best >= MIN_WORDS && best / words.length >= 0.7
}
