// "Stop" said out loud while she is talking.
//
// Bryce: "when i say stop the damn thing should stop". The mic used to be
// switched OFF for the whole of her answer — the only way to keep her own
// voice out of it — so a spoken stop could never be heard. Now the mic stays
// on while she talks, but in a mode that acts on ONE thing only: a short
// command to stop. Anything else it hears is ignored, because while she is
// speaking the likeliest thing the mic hears is her.
//
// What makes that safe is the shape of the command, not the timing. Her own
// sentences coming back through a speaker are long ("please stop by the
// warehouse before ten"); a person cutting her off says two or three words.
// So it counts only when EVERY word is a stop word, her name, or filler, and
// there are no more than six of them ("hey Jenny, hold on a sec").

const STOP_WORDS = new Set([
  'stop', 'quiet', 'enough', 'pause', 'wait', 'hush', 'cancel', 'silence', 'shush',
])
const STOP_PAIRS = ['hold on', 'shut up', 'be quiet', 'hang on', 'never mind', 'nevermind', 'that will do']
const FILLER = new Set([
  'ok', 'okay', 'hey', 'please', 'just', 'now', 'talking', 'it', 'right', 'there',
  'stop', 'oh', 'no', 'yeah', 'yes', 'a', 'sec', 'second', 'minute', 'up', 'for',
  'thanks', 'thank', 'you', 'arnie', 'jenny',
])

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim()

/** Is this — the whole of it — somebody telling her to stop? */
export function isStopCommand(text, name = '') {
  const n = norm(text)
  if (!n) return false
  const words = n.split(' ')
  if (words.length > 6) return false
  const names = new Set(norm(name).split(' ').filter((w) => w.length > 1))
  let rest = ` ${n} `
  let found = false
  for (const p of STOP_PAIRS) {
    if (rest.includes(` ${p} `)) { found = true; rest = rest.split(` ${p} `).join(' ') }
  }
  for (const w of rest.trim().split(' ').filter(Boolean)) {
    if (STOP_WORDS.has(w)) { found = true; continue }
    if (FILLER.has(w) || names.has(w)) continue
    return false   // a word that is not part of "stop" — this is something else
  }
  return found
}

const IOS = () => typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const FLAG = 'arnie_bargein'

/**
 * Keep the mic listening while she talks?
 *
 * Everywhere except iPhone/iPad by default. On iOS an open microphone moves
 * the whole audio session into record mode, and that can route her voice to
 * the earpiece or turn it down — exactly the "no sound on the phone" problem
 * that took a week to fix. Until that has been heard on a real iPhone it is
 * opt-in there: open the chat once with ?bargein=1 (and ?bargein=0 to undo).
 */
export function bargeInAllowed() {
  try {
    const q = new URLSearchParams(window.location.search).get('bargein')
    if (q === '1' || q === '0') localStorage.setItem(FLAG, q)
    const saved = localStorage.getItem(FLAG)
    if (saved === '1') return true
    if (saved === '0') return false
  } catch { /* private mode — fall through to the default */ }
  return !IOS()
}
