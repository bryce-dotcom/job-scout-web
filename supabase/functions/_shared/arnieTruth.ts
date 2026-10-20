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
  if (/\bcard\b[^.!?\n]{0,40}\b(is |'s )?(live|ready|up|there|waiting|created|sent|exists|in front of you|on (your|the) screen)\b/i.test(t)) return true
  if (/\b(there it is|there you go|here it is)\b[^.!?\n]{0,30}\bcard\b/i.test(t)) return true
  if (/\bshould be (on|in front of|up on) (you|your screen|the screen)\b/i.test(t)) return true
  if (/\b(the |your |that |this )?(estimate|quote|lead|job|invoice|expense|appointment|rule|routine)\b[^.!?\n]{0,25}\b(is|has been|was) (created|added|saved|made|sitting|in jobscout|live)\b/i.test(t)) return true
  return false
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

export type Fabrication = 'computer' | 'card' | 'figures'

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
  if (!money.length && !counts.length) return []
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
  return out
}

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

  if (kind === 'figures') {
    return [
      `STOP. These figures in your reply did not come from any tool result, anything they said, or anything in your instructions: ${detail.slice(0, 8).join(', ')}. You made them up.`,
      ...opensWith,
      'Then do one of these two things, and nothing else:',
      '1. CALL the query tool that answers it and give the real figures from its result.',
      '2. If no tool you have can answer it, say so in one line — never estimate, round up from a guess, or fill a breakdown with plausible numbers.',
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
  // Blaming the app, having drafted nothing and with nothing pending. Filing
  // a ticket for a REAL fault is a tool call, so a turn that actually did
  // that has propose_create in `used` and never reaches here.
  if (blamesTheApp(text) && noCardTool && cardPending === false) return 'card'
  return null
}
