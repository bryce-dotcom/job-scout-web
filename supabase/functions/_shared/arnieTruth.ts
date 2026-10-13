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
  const card = /\b(approval|change)\s+card\b|\bcard (to|for) approve\b/i
  const drafted = /\b(i'?ve|i have|i just)\s+(drafted|created|set ?up|made|put together|built)\b/i
  const pointing = /\byou should see\b|\blook for (the|an|a) (approval )?card\b|\bwaiting for (your |the )?approval\b/i
  return (card.test(t) && (drafted.test(t) || pointing.test(t))) || (drafted.test(t) && card.test(t))
}

export type Fabrication = 'computer' | 'card'

/**
 * What to put in front of him. Short, factual, and it offers the way out that
 * is actually useful — do it now — before the way out that is merely honest.
 */
export function correctionFor(kind: Fabrication, seen = false): string {
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
  if (claimsACard(text) && !CARD_TOOLS.some((n) => names.has(n)) && cardPending === false) return 'card'
  return null
}
