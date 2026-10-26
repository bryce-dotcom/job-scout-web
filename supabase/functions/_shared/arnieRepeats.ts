// The same question, again (the learning loop, part 4; Bryce, 2026-10-23).
//
// "What did we sell this month", typed on Monday, Wednesday and Friday, is a
// report somebody wants and has to remember to ask for. The third time, after
// answering, she offers once to send it on a schedule — at the hour they
// usually ask — and a yes is the existing routine card (arnieCreate 'routine').
//
// Pure: the matching and the note. arnie-chat reads the person's own last 30
// days of questions and their routines, and passes them in. Never offered
// twice for the same question inside 14 days (her own earlier reply is the
// record of an offer), and never for a question a routine of theirs already
// asks.

const STOP = new Set(('a an and any are at be by can could did do does for from get give got has have how i in is it its jenny arnie me my '
  + 'need of on or our please show so tell that the this to us was we what whats when where which who will with would you your').split(' '))

// The irregular past tenses business questions are asked in: "what did we
// sell" and "what have we sold" are one question.
const IRREGULAR: Record<string, string> = { sold: 'sell', bought: 'buy', spent: 'spend', paid: 'pay', made: 'make', won: 'win', lost: 'lose', sent: 'send', got: 'get', ran: 'run', went: 'go', brought: 'bring', left: 'leave', took: 'take', gave: 'give' }

/** The words that carry a question's meaning, roughly stemmed. */
export function wordsOf(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue
    out.add(IRREGULAR[w] || w.replace(/(ing|ed|es|s)$/, '') || w)
  }
  return out
}

/** The same question in other words: most of the meaning words shared. */
export function sameQuestion(a: string, b: string): boolean {
  const x = wordsOf(a), y = wordsOf(b)
  if (x.size < 2 || y.size < 2) return false
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both >= 2 && both / (x.size + y.size - both) >= 0.5
}

/** A routine's longer instructions already ask this: nearly all its meaning words are in them. */
export function routineCovers(prompt: string, said: string): boolean {
  const x = wordsOf(said), y = wordsOf(prompt)
  if (x.size < 2) return false
  let inside = 0
  for (const w of x) if (y.has(w)) inside++
  return inside / x.size >= 0.8
}

/** An answer of hers that offered a schedule. */
const OFFERED = /\b(routine|on a schedule|automatically|every (weekday|day|morning|afternoon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i

const DAY = 86_400_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function local(ms: number, tz: string): { day: string; hour: number; weekday: number; label: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, weekday: WEEKDAYS.indexOf(String(parts.weekday)), label: `${parts.weekday} ${Number(parts.month)}/${Number(parts.day)}` }
}

export type Repeat = { days: string[]; hour: number; weekdaysOnly: boolean }

/**
 * Has this person asked this on two OTHER days in the window? null when not,
 * when a routine of theirs already asks it, or when she offered in 14 days.
 * msgs: their own messages and her replies, oldest first, with session_id.
 */
export function findRepeat(
  said: string,
  msgs: { session_id?: string; role: string; content: string; created_at: string }[],
  routinePrompts: string[],
  tz: string,
  now = Date.now(),
): Repeat | null {
  if (wordsOf(said).size < 2) return null
  if (routinePrompts.some((p) => routineCovers(p, said))) return null
  const today = local(now, tz).day
  const asks: { ms: number; l: ReturnType<typeof local> }[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (m.role !== 'user' || !sameQuestion(m.content, said)) continue
    const ms = Date.parse(m.created_at)
    if (!Number.isFinite(ms)) continue
    const reply = msgs.slice(i + 1).find((n) => n.session_id === m.session_id && n.role === 'assistant')
    if (reply && now - ms < 14 * DAY && OFFERED.test(String(reply.content))) return null
    const l = local(ms, tz)
    if (l.day !== today) asks.push({ ms, l })
  }
  const days = [...new Set(asks.map((a) => a.l.day))]
  if (days.length < 2) return null
  const hours = asks.map((a) => a.l.hour).sort((a, b) => a - b)
  const wds = new Set(asks.map((a) => a.l.weekday))
  return {
    days: days.map((d) => asks.find((a) => a.l.day === d)!.l.label),
    hour: hours[Math.floor(hours.length / 2)],
    weekdaysOnly: [...wds].every((w) => w >= 1 && w <= 5),
  }
}

const hourWords = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`

/** The note on this turn: answer it, then offer it once as a routine. */
export function repeatNote(r: Repeat): string {
  // A routine runs every weekday or every day — not on one chosen weekday.
  const when = r.weekdaysOnly ? `every weekday at ${hourWords(r.hour)}` : `every day at ${hourWords(r.hour)}`
  return [
    `THEY HAVE ASKED THIS BEFORE — on ${r.days.join(', ')}, usually around ${hourWords(r.hour)}.`,
    'Answer it fully, as usual. Then, ONLY if it is something that changes over time and is worth having without asking — a report, a list, a status, a day\'s numbers — end with ONE short line offering to send it automatically, '
      + `for example: "You ask this a lot — want it ${when}?" If they say yes, draft it with propose_create, target routine: prompt = their question in their words, when = the time, every_day = "yes" for every day or "no" for weekdays only, how = app unless they say text or email.`,
    'Do not offer for a one-off lookup (one customer\'s phone, one job\'s address). Say nothing about having noticed the pattern unless you are offering.',
  ].join('\n')
}
