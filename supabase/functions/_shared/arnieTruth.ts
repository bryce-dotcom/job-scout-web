// The server's own check on what Arnie claims to have done.
//
// Twice in one day he said he had done something he had not. He told Alayda to
// look for an approval card he never drafted, then told her the feature was
// broken and to file a bug report. Hours later he told her he was clicking
// around Chrome on her computer — asked whether she could SEE him working —
// while not one action had ever been sent to her machine, and blamed Google,
// lag, and clicks landing in the wrong place.
//
// Both times the fix was a prompt rule, and a prompt rule is a request. This
// is the thing a request cannot be: the server knows exactly which tools ran
// in a turn, so a reply that claims otherwise is caught in code, before it is
// the last word, and whatever the model was told or not told.
//
// WHAT IT DOES, AND DELIBERATELY DOES NOT DO. It never edits or deletes his
// words — rewriting model output is how you turn one wrong sentence into a
// mangled paragraph. It forces one more round with the truth in front of him,
// which usually ends with him actually CALLING the tool and doing the job. The
// cost of a false positive is therefore one extra round and a sentence of
// clarification, not a broken answer; the cost of a miss is somebody watching
// a screen for nothing. That asymmetry is why the patterns below are narrow
// but the response is cheap.

export const COMPUTER_TOOLS = ['use_my_computer']
export const CARD_TOOLS = ['propose_change', 'propose_record_change', 'propose_bulk_change', 'propose_create']

/** Context words that mean this sentence is about THEIR machine, not the app. */
const MACHINE = /\b(screen|screenshot|chrome|browser|excel|outlook|word|notepad|file explorer|window|tab|cursor|mouse|desktop|click|keyboard|address bar|search bar|the field)/i

/**
 * Does this text claim work on their computer?
 *
 * Every pattern here is first-person and already-happening. "I can take a
 * screenshot if you like" is an offer and must not match; "I'm taking a
 * screenshot" is a claim and must.
 */
export function claimsComputerWork(text: string): boolean {
  const t = String(text || '')
  if (!t) return false

  // The tell that started all this. If you have to ask, you did not do it.
  if (/\bcan you see (me|it|that|anything|what i)\b/i.test(t)) return true
  if (/\b(watch|look at) your screen\b/i.test(t)) return true
  if (/\bsending (a |the )?clicks?\b/i.test(t)) return true
  if (/\b(i'?m|i am) (now )?(in|on) (your |the )?(chrome|browser|screen|excel|outlook)\b/i.test(t)) return true
  if (/\blooking at (your |the )?(chrome|screen|browser|excel|outlook)\b/i.test(t)) return true
  // With no subject at all: "Taking a screenshot now…I can see the job now."
  // Jenny to Alayda, 2026-10-15, with not one action ever sent to her machine
  // — the pattern below wants "I'm taking", so it sailed past. A gerund that
  // starts a sentence is a claim; "I can take one" / "I'll be taking" is not.
  if (/(^|[.!?…:\n]\s*)(now\s+)?(taking|grabbing|snapping) (a |another )?(screenshot|look at your screen|picture of your screen)\b/i.test(t)) return true
  if (/\b(i can|i now|now i can) see (your|the) (screen|desktop|window|page you'?re on|job on your screen)\b/i.test(t)) return true
  if (/\bi can see (it|the \w+) now\b/i.test(t) && /\bscreenshot\b/i.test(t)) return true
  // "Chrome's address bar is focused. Typing the Gmail address now." — to
  // Bryce, 2026-10-15, in a turn with ONE model call and no tool at all. A
  // sentence that opens on the doing, about the machine, is the same claim.
  if (/(^|[.!?…:\n]\s*)(now\s+)?(typing|clicking|pressing|navigating|scrolling|launching|switching to)\b/i.test(t) && MACHINE.test(t)) return true
  if (/\b(address bar|search bar|the field|cursor) is (now )?(focused|selected|active|in place)\b/i.test(t)) return true

  // "I'm clicking the Edit button", "I've taken a screenshot", "I just typed…"
  const acting = /\b(i'?m|i am|i'?ve|i have|i just)\s+(now\s+|just\s+)?(taking|taken|took|clicking|clicked|typing|typed|sending|sent|opening|opened|navigating|navigated|scrolling|scrolled|pressing|pressed)\b/i
  return acting.test(t) && MACHINE.test(t)
}

/**
 * Does this text claim a card is waiting for them?
 *
 * A reference to a card that really does exist from an earlier turn is fine,
 * which is why the caller also checks whether one is actually pending before
 * treating this as a fabrication.
 */
export function claimsACard(text: string): boolean {
  const t = String(text || '')
  if (!t) return false

  // The first cut of this wanted the words "approval card" AND a claim verb,
  // which is only one of the ways it gets said. Bryce was told there was
  // something to approve, found nothing, and his proposals table had no row
  // at all — the claim was invented and this did not catch it, because it was
  // not phrased the way I happened to write the pattern. Any of these is
  // enough on its own now; each one asserts that something is waiting.
  // ASKING for approval is not CLAIMING one is waiting. "I'll need your
  // approval before I can do that — shall I draft it?" is him behaving
  // correctly, and interrupting that would be the rail nagging somebody for
  // doing the right thing. Checked first, because it beats everything below.
  if (/\b(i'?ll|i will|i would|we'?ll|we will) need (your |an? )?(approval|ok|sign ?off)/i.test(t)) return false
  if (/\b(shall|should|want me to|would you like me to) i? ?(draft|create|set|make)/i.test(t)) return false

  const card = /\b(approval|change)\s+cards?\b|\bcard (to|for) approve\b/i
  // Note "it's" with no space — the first version wrote `it (is|'s)`, which
  // requires one, so "It's in your approvals now" sailed straight past.
  const waiting = /\b(is|it'?s|that'?s|this is) waiting (for|on) (your |the )?(approval|ok|sign ?off)\b|\bawaiting (your )?approval\b|\b(that|this|it) needs (your )?approval\b/i
  const pointing = /\byou should see\b|\blook for (the|an|a) [^.]{0,24}card\b|\bit(?:'s| is| has gone)? ?(in|on|to) your (approvals|notifications)\b|\bcheck your approvals\b/i
  const drafted = /\b(i'?ve|i have|i just)\s+(drafted|created|set ?up|made|put together|built|queued|prepared)\b/i

  if (waiting.test(t)) return true
  if (pointing.test(t)) return true
  if (card.test(t) && drafted.test(t)) return true
  // "I've drafted the change for your approval" — no card named, but it says
  // in as many words that a thing exists and is waiting on them.
  if (drafted.test(t) && /\bfor (your |my )?(approval|review|sign ?off)\b/i.test(t)) return true
  // "I've drafted the won card" — ANY card, not only an "approval" one — and
  // "I've drafted it. Approve it and…". Both say a thing exists to approve.
  // Missed live on 10-14, after a refusal, with nothing on screen.
  if (drafted.test(t) && /\bcard\b/i.test(t)) return true
  if (drafted.test(t) && /\bapprove (it|this|that|the)\b/i.test(t)) return true
  // Cole, 2026-10-20 — eight of these in one afternoon, not one card drafted
  // after 9:33, and the patterns above caught one: "card is live and
  // waiting", "THERE IT IS — CARD IS LIVE", "Approval card created
  // successfully", "the approval card already exists", "should be on your
  // screen now", "the estimate is created and sitting in JobScout".
  if (/\bcards?\b[^.!?\n]{0,40}\b(is |are |'s |'re )?(live|ready|up|there|waiting|created|sent|exists?|in front of you|on (your|the) screen)\b/i.test(t)) return true
  // Christopher, 2026-10-14: "the lead and the estimate are drafted and
  // waiting for your approval" — nothing had been drafted.
  if (/\b(drafted|ready|created|set up) and waiting\b|\bwaiting for your (approval|ok|sign ?off)\b/i.test(t)) return true
  if (/\b(there it is|there you go|here it is)\b[^.!?\n]{0,30}\bcard\b/i.test(t)) return true
  if (/\bshould be (on|in front of|up on) (you|your screen|the screen)\b/i.test(t)) return true
  for (const m of t.matchAll(/\b(the |your |that |this )?(estimate|quote|lead|job|invoice|expense|appointment|rule|routine)\b[^.!?\n]{0,25}\b(is|has been|was) (created|added|saved|made|sitting|in jobscout|live)\b/gi)) {
    if (!reportsActivity(t, m)) return true
  }
  return false
}

/**
 * "1 lead was created today", "one draft estimate was created today" — a
 * report of what the DATA shows, not a claim that he made something. Cole's
 * 4pm scoreboard, 2026-10-28: its whole subject is estimates created, so the
 * claim pattern above fired on an honest count, the retry was caught again,
 * and the turn ran out of rounds into "I got tangled up". A counted subject,
 * or a "was created" pinned to when or by whom, is a report.
 */
function reportsActivity(t: string, m: RegExpMatchArray): boolean {
  const before = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0)
  const counted = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|no|none of the|only)\s+([a-z-]+\s+)?$/i
  if (!m[1] && counted.test(before)) return true
  if (m[3].toLowerCase() !== 'was') return false
  const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 30)
  return /^\s*(today|yesterday|this (morning|afternoon|week|month)|last \w+|on \w+|at \d|in [A-Z][a-z]+|since|by [A-Z])/.test(after)
}

/**
 * "Saved to memory", "locked in", "I'll remember that" — a memory is a CARD
 * (target memory; company-wide, a company_rule), so saying one was kept with
 * no card drafted is the same lie. Cole was told "NEW RULE — SAVED TO MEMORY"
 * three times on 2026-10-20 and nothing was saved.
 */
export function claimsAMemory(text: string): boolean {
  const t = String(text || '')
  return /\bsaved (it |that |this )?(to|in) (my )?memory\b/i.test(t)
    || /\b(locked|locking) (it |that |this )?in\b[^.!?\n]{0,40}\b(memory|rule|from now on|going forward)\b/i.test(t)
    || /\bnew rule\b[^.!?\n]{0,30}\b(saved|locked in|remembered)\b/i.test(t)
    || /\b(i'?ve|i have) (saved|remembered|stored|noted) (that|this|it)\b/i.test(t)
}

/**
 * Does this text blame the app for something?
 *
 * The tell that matters most, and the one I kept missing. Arnie has no dev
 * team to wait for — when something really is broken he files a ticket, which
 * is a tool call. So "the approval card isn't showing, wait for the dev team
 * to fix it" is, almost without exception, him covering for a card he never
 * drafted: he invents the thing, the person cannot find it, and rather than
 * check he blames the software and sends them away.
 *
 * It happened to Alayda yesterday and it was happening again, out loud, in
 * front of Bryce, hours after I shipped a rail that was supposed to stop it —
 * because that rail only recognised the claim, never the excuse.
 */
export function blamesTheApp(text: string): boolean {
  const t = String(text || '')
  if (!t) return false
  return /\b(dev|development|engineering) team\b/i.test(t)
    || /\b(file|submit|raise|add (it |this )?to) a? ?bug( report)?\b/i.test(t)
    // "Bug report" ALONE is not blame — it is the first of the four types on
    // the Feedback form, and the app map now has him describe that form. On
    // 2026-10-14 Bryce asked "is there a feedback page?", got a correct answer
    // naming "Bug Report", and the rail forced a baffling "I didn't draft
    // anything" onto the end of it. What IS blame is the bug report pinned on
    // something — added to, or the same, as an existing one.
    || /\b(add (it |this )?to|same as|part of|in) (the|that|a|an existing) bug report\b/i.test(t)
    || /\b(you|they) (can|could|should|might|may want to|'?ll (want|need) to|need to) (file|submit|send|raise|report) (a |an )?(bug|ticket)\b/i.test(t)
    || /\bknown (issue|bug)\b/i.test(t)
    || /\bwait (for|until) (the |a )?(dev|fix|team|engineers)/i.test(t)
    || /\b(the )?(app|feature|page|card|ui) (is|seems|appears) broken\b/i.test(t)
}

export type Fabrication = 'computer' | 'card' | 'figures' | 'email' | 'guess' | 'absence'

/**
 * "It isn't in JobScout" — said about something that is. Bryce, 2026-10-27:
 * asked whether a $15,000 pole barn was safe, Jenny said "I don't have your
 * bank balance" and that payroll and cost of sales "aren't in it", with Books
 * holding all three. A statement about what the SYSTEM lacks is a claim about
 * their data, and it is only true once every lookup that could hold it has
 * come back empty. Narrow on purpose: about JobScout or the app or the books,
 * not "there are no overdue invoices".
 */
const ABSENCE = [
  /\b(?:isn'?t|is not|aren'?t|are not)\s+(?:in|tracked in|logged in|recorded in|kept in|stored in|entered in)\s+(?:jobscout|the system|the app|it)\b/i,
  /\b(?:jobscout|the system|the app)\s+(?:doesn'?t|does not|can'?t|cannot)\s+(?:have|track|record|keep|show|hold)\b/i,
  /\bi\s+(?:don'?t|do not)\s+have\s+(?:your|the|any)\s+(?:bank|cash|balance|payroll|p&l|profit|costs?|expenses?|margin|books|financials?)\b/i,
  /\btoo thin to be (?:your|the) real\b/i,
]
/**
 * `toolSaid` is what this turn's tools returned. Repeating a gap a TOOL
 * reported is honest, not a claim about their data: query_rep_goals says
 * "JobScout does not record attendance", its description tells her to pass
 * that on, and Cole's 4pm scoreboard on 2026-10-28 was stopped for doing
 * exactly that (then ran out of rounds into "I got tangled up"). The gap is
 * excused only when the tool's own absence statement is about the same thing.
 */
export function claimsAbsence(text: string, toolSaid = ''): boolean {
  const told = absencesIn(String(toolSaid || ''))
  return String(text || '').split(/(?<=[.!?\n])\s+/).some((s) => ABSENCE.some((re) => {
    const m = s.match(re)
    if (!m) return false
    const about = absenceObject(s, m)
    return !told.some((t) => about.some((w) => t.includes(w)))
  }))
}

// Words that say "missing", not WHAT is missing — never enough to match on.
const ABSENCE_FILLER = new Set(('jobscout system does doesn record track tracked have keep kept show hold logged recorded stored entered ' +
  'cannot your this that them they there from with since because unless which what when come comes counted counts the and any isn aren').split(' '))
/** What an absence statement says is missing: the words beside the match. */
function absenceObject(s: string, m: RegExpMatchArray): string[] {
  const at = m.index ?? 0
  const near = s.slice(Math.max(0, at - 30), at) + ' ' + m[0] + ' ' + s.slice(at + m[0].length, at + m[0].length + 30)
  return (near.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !ABSENCE_FILLER.has(w))
}
function absencesIn(toolSaid: string): string[][] {
  if (!toolSaid) return []
  // Tool results arrive as JSON: an escaped newline would glue "\nJobScout" into one word.
  const plain = toolSaid.replace(/\\[nrt]/g, ' ').replace(/\\"/g, '"')
  return ABSENCE.flatMap((re) => [...plain.matchAll(new RegExp(re.source, 'gi'))].map((m) => absenceObject(plain, m)))
}

// ── Figures nobody looked up ────────────────────────────────────────────
//
// London, 2026-10-20: "how many jobs in Arizona … how much rev do we have to
// install still" → "18 jobs … Chillin 11 jobs, $88,450 … Scheduled 4, $34,200".
// None of it was real (27 jobs, 12 open, $80,060.28): the tool he needed could
// not filter by place, so the model wrote plausible numbers instead. A claim
// of WORK is caught above; a claim of FACT was not.
//
// A dollar amount or a "<n> jobs"-style count in the reply must be traceable
// to something in front of the model this turn — a tool result, the person's
// own words, an earlier message, or the data in its instructions — allowing
// for rounding ("$80,060" for 80060.28, "$80k") and for the sum of two figures
// it was given. Anything else is a figure it made up.

const COUNT_NOUN = '(?:jobs?|estimates?|quotes?|invoices?|leads?|customers?|appointments?|employees?|payments?|bids?|routines?|tickets?)'

/**
 * Phone numbers in a reply, as their 10 digits. Cole, 2026-10-20: "here are
 * YOUR leads in Negotiation" — seventeen businesses and phone numbers, not
 * one of them real (he has five). A phone number cannot be rounded or summed,
 * so it either came from something in front of the model or it was made up.
 */
export function phonesIn(text: string): string[] {
  const out: string[] = []
  for (const m of String(text || '').matchAll(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g)) out.push(m[1] + m[2] + m[3])
  return [...new Set(out)]
}

/** Dollar amounts and noun counts quoted in a reply, as numbers. */
export function figuresIn(text: string): { money: number[]; counts: number[] } {
  const t = String(text || '')
  const money: number[] = []
  for (const m of t.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\b/g)) {
    let v = parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(v)) continue
    if (m[2] && /k/i.test(m[2])) v *= 1000
    if (m[2] && /m/i.test(m[2])) v *= 1e6
    money.push(v)
  }
  const counts: number[] = []
  const re = new RegExp(`\\b(\\d[\\d,]*)\\s+(?:[a-z-]+\\s+){0,2}${COUNT_NOUN}\\b`, 'gi')
  for (const m of t.matchAll(re)) {
    const v = parseInt(m[1].replace(/,/g, ''), 10)
    if (Number.isFinite(v)) counts.push(v)
  }
  return { money, counts }
}

/** Every number in the material the model had, for the trace. */
export function numbersIn(context: string): number[] {
  const out: number[] = []
  for (const m of String(context || '').matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const v = parseFloat(m[0].replace(/,/g, ''))
    if (Number.isFinite(v)) out.push(Math.abs(v))
  }
  return out
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005)

/**
 * The figures in `text` that cannot be traced to `context` (everything the
 * model was given this turn) or to `toolContext` sums. [] = all traced.
 * Small counts (under 30) are not checked: they appear by coincidence in any
 * long context, so a "miss" would be noise, not evidence.
 */
export function untracedFigures(text: string, context: string, toolContext = ''): string[] {
  const { money, counts } = figuresIn(text)
  if (!money.length && !counts.length && !phonesIn(text).length) return []
  const all = numbersIn(context)
  const set = new Set(all.map((n) => Math.round(n)))
  const tool = numbersIn(toolContext).filter((n) => n >= 1).slice(0, 400)
  // Quantities in the reply itself ("Four cobras at $417 is $1,668"): a
  // figure that is a given number times one of them is arithmetic, not a guess.
  const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20 }
  const qty = [...new Set([
    ...numbersIn(text).filter((n) => Number.isInteger(n) && n >= 2 && n <= 1000),
    ...[...String(text).toLowerCase().matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b/g)].map((m) => WORDS[m[1]]),
  ])].slice(0, 40)
  const traced = (v: number) => {
    if (set.has(Math.round(v))) return true
    if (all.some((n) => near(v, n))) return true
    if (qty.some((k) => all.some((n) => near(v, n * k)))) return true
    // The sum of two figures it was handed (a total of two groups).
    // …or the gap between two ("customer pays $490.22" = subtotal − rebate).
    for (let i = 0; i < tool.length; i++) for (let j = i + 1; j < tool.length; j++) {
      if (near(v, tool[i] + tool[j]) || near(v, Math.abs(tool[i] - tool[j]))) return true
    }
    return false
  }
  const out: string[] = []
  for (const v of money) if (v >= 10 && !traced(v)) out.push(`$${v.toLocaleString('en-US')}`)
  for (const v of counts) if (v >= 30 && !traced(v)) out.push(String(v))
  // Phone numbers: the digits must appear somewhere in what it was given.
  const digits = String(context || '').replace(/\D/g, '')
  for (const p of phonesIn(text)) if (!digits.includes(p)) out.push(`(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`)
  return out
}

/**
 * An amount it said it could not read, then gave anyway. The eval's receipt
 * with every total blacked out, 2026-10-22: "I won't work the total out from
 * gallons times price" — and the same reply carried the worked-out figure.
 *
 * In a turn with a photo the figure trace cannot run (what is on the paper is
 * in no text), so this reads the reply alone. Once it says an amount cannot
 * be read, a dollar figure is a guess if it is two numbers it quotes
 * multiplied (gallons × price), two of its own dollar figures added (fuel +
 * car wash), or set beside estimate words. A figure that really is printed
 * can be caught too (a legible fuel line is gallons × price); the correction
 * lets him keep it by saying so.
 */
const UNREADABLE = /\b(?:can(?:no|['’])t|could(?:n['’]t| not)|unable to|not able to)\s+(?:quite\s+)?(?:read|make out|see)\b|\b(?:blacked|cut|torn|smudged|faded|crossed|scratched|whited|inked)\s+(?:out|off)\b|\b(?:illegible|unreadable|not legible|obscured|redacted|hidden|covered|smeared|blurr(?:y|ed)|(?:is|are|isn['’]t|aren['’]t|not) (?:visible|shown|printed)|(?:left |is |are )?blank)\b/i
const ESTIMATE = /\b(?:would (?:be|come to)|works? out|comes? to|about|around|roughly|approximately|approx|estimated?|likely|probably|my guess)\b|[~≈]/i
export function guessedAmounts(text: string): string[] {
  const t = String(text || '')
  if (!UNREADABLE.test(t)) return []
  const money = figuresIn(t).money
  const all = numbersIn(t).filter((n) => n > 0 && n < 100000)
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, b * 0.002)
  const out = new Set<string>()
  // "$87.41", or a bare "87.41" — two decimals reads as money; gallons
  // (22.418) and a pump price (3.899) carry three.
  for (const s of t.split(/(?<=[.!?\n])\s+/)) {
    for (const m of s.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)|(?<![\d.,])(\d[\d,]*\.\d{2})(?![\d.])/g)) {
      const v = parseFloat((m[1] || m[2]).replace(/,/g, ''))
      if (!(v >= 10)) continue
      const others = all.filter((n) => !close(n, v))
      const product = others.some((a, i) => others.some((b, j) => i < j && close(a * b, v)))
      const sum = money.some((a, i) => money.some((b, j) => i < j && !close(a, v) && !close(b, v) && close(a + b, v)))
      if (product || sum || ESTIMATE.test(s)) out.add(`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    }
  }
  return [...out]
}

/**
 * "Email sent", "check your inbox" — with no email tool run this turn.
 * Cole, 2026-10-20: "Email sent, boss … check your inbox" three times, then a
 * made-up tool result ("sent": true) when he said it never came.
 */
// A sentence that says it was NOT sent, or that it will be once something
// happens, is not a claim. Without this, "No email has been sent, and saying it
// would be false" was caught as a claim and rewritten (live test, 2026-10-21).
const NOT_A_SEND = /\b(no|not|never|nothing|cannot|once|when|if|after|until|before|unless|will|would|should i)\b|n['’]t\b/i

export function claimsAnEmail(text: string): boolean {
  return String(text || '').split(/(?<=[.!?\n])\s+/).some((s) => !NOT_A_SEND.test(s) && (
    /\b(e-?mail|list|report|it)\b[^.!?\n]{0,25}\b(has been |was |is |'s )?sent\b(?! to the customer when)/i.test(s)
    || /\bsent (it|the list|the report|that|this|you|an e-?mail)\b[^.!?\n]{0,20}\b(to your|your) (e-?mail|inbox)\b/i.test(s)
    || /\bcheck your (inbox|e-?mail)\b/i.test(s)))
}
export const EMAIL_TOOLS = ['email_me']

/**
 * What to put in front of him. Short, factual, and it offers the way out that
 * is actually useful — do it now — before the way out that is merely honest.
 */
export function correctionFor(kind: Fabrication, seen = false, detail: string[] = []): string {
  // Whether they have already READ the false sentence changes what is owed.
  //
  // Streaming puts every word on screen as it is written, so by the time this
  // check runs the claim has been read and cannot be unsaid — it has to be
  // taken back in as many words. Without a stream the reply is still in the
  // server's hands and is simply replaced, so a retraction would be an
  // apology for something nobody ever saw.
  const opensWith = seen
    ? ['They have ALREADY READ what you just said — it is on their screen. So you MUST take it back in your first sentence, plainly and without ceremony, before anything else.']
    : ['They have not seen that message yet; it is being replaced by what you write now. Do not apologise for it or refer to it — just do the right thing.']

  if (kind === 'email') {
    return [
      'STOP. You told them an email was sent, and no email tool ran in this turn, so NOTHING was sent. They are waiting for it.',
      ...opensWith,
      'Then do one of these two things, and nothing else:',
      '1. CALL email_me with the real content, and say it is sent only after it returns sent: true.',
      '2. If you cannot, say so in one line. Never quote a tool result you did not receive.',
    ].join('\n')
  }
  if (kind === 'figures') {
    return [
      `STOP. These figures in your reply did not come from any tool result, anything they said, or anything in your instructions: ${detail.slice(0, 8).join(', ')}. You made them up.`,
      ...opensWith,
      'Then do one of these two things, and nothing else:',
      '1. CALL the query tool that answers it and give the real figures from its result.',
      '2. If no tool you have can answer it, say so in one line — never estimate, round up from a guess, or fill a breakdown with plausible numbers.',
    ].join('\n')
  }
  if (kind === 'absence') {
    return [
      'STOP. You told them something is not in JobScout, or that you do not have it. That is a claim about THEIR data, and it is only true once every lookup that could hold it has come back empty.',
      ...opensWith,
      detail.length
        ? `Then look now with the lookups that could hold it — you have ${detail.join(', ')} — and answer from what they return.`
        : 'Then look now with every lookup that could hold it, and answer from what they return.',
      'If none of your lookups can reach it, say exactly "I can\'t look that up yet" and what they can open in the app instead — never that it is not in JobScout.',
    ].join('\n')
  }
  if (kind === 'guess') {
    return [
      `STOP. You said an amount on what they sent cannot be read, and then gave one anyway: ${detail.slice(0, 6).join(', ')}. A figure worked out from other lines, or estimated, is a guess at what the paper does not show.`,
      ...opensWith,
      'Then do this, and nothing else:',
      '1. Drop every amount you worked out or estimated. Say only what is printed and legible.',
      '2. Ask them for the amount you could not read, in one line.',
      'If one of those figures IS printed and legible on the paper, you may keep it — say so plainly ("the fuel line itself reads $X").',
    ].join('\n')
  }
  if (kind === 'computer') {
    return [
      'STOP. You just told them you were working on their computer, and you did not call use_my_computer in this turn, so NOTHING was sent to their machine. Nothing is on their screen. They may be sitting there watching it.',
      ...opensWith,
      'Then do one of these two things, and nothing else:',
      '1. If you can do it, CALL use_my_computer and actually do it.',
      '2. If you cannot, say why in one line — "I said I was clicking, but I had not sent anything to your machine yet."',
      'Do not explain it away. Do not blame the website, a lag, the clicks landing wrong, or anything else a tool has not told you. One short sentence, then get on with it.',
    ].join('\n')
  }
  return [
    'STOP. You just told them a card was drafted or waiting, you did not call any propose_ tool in this turn, and there is no card pending for them. There is nothing for them to find.',
    ...opensWith,
    'Then do one of these two things, and nothing else:',
    '1. If they asked for something you can draft, CALL the right propose_ tool and draft it now.',
    '2. If you genuinely need one more detail before you can draft it, ask for that ONE thing.',
    'Do NOT tell them the app is broken, do not suggest a bug report, and do not offer a workaround for something you never did.',
  ].join('\n')
}

/**
 * The check itself.
 *
 * `used` is every tool name called anywhere in this turn. `cardPending` is
 * only consulted for a card claim, and the caller is expected to pass null
 * when it has not looked — an unknown is treated as "a card might exist", so
 * the benefit of the doubt goes to not interrupting.
 */
export function fabricationIn(
  text: string,
  used: Iterable<string>,
  cardPending: boolean | null = null,
): Fabrication | null {
  const names = new Set(used)
  if (claimsComputerWork(text) && !COMPUTER_TOOLS.some((n) => names.has(n))) return 'computer'
  const noCardTool = !CARD_TOOLS.some((n) => names.has(n))
  if (claimsACard(text) && noCardTool && cardPending === false) return 'card'
  // A memory claim needs no "pending" lookup: if no card tool made a card
  // this turn, nothing was remembered this turn.
  if (claimsAMemory(text) && noCardTool) return 'card'
  // An email is sent by email_me (or drafted on a card for a customer, which
  // is not "sent" until approved). Neither ran: nothing went out.
  if (claimsAnEmail(text) && !EMAIL_TOOLS.some((n) => names.has(n)) && noCardTool) return 'email'
  // Blaming the app, having drafted nothing and with nothing pending. Filing
  // a ticket for a REAL fault is a tool call, so a turn that actually did
  // that has propose_create in `used` and never reaches here.
  if (blamesTheApp(text) && noCardTool && cardPending === false) return 'card'
  return null
}
