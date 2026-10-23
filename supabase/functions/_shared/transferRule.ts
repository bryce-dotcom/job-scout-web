// One definition of "this money moved between my own accounts".
//
// Tracy, 2026-08-10: "The first transaction is Stripe. I chose transfer between
// accounts. From Cameron's card to the checking account. Since this is income I
// can't choose it in the tax category... it will not let me."
//
// There were two ways to say it and only one worked:
//
//   the Category dropdown's "Transfer (between accounts)" — wrote the STRING
//     'Transfer' into user_category and nothing else, so the save still demanded
//     a tax category (a transfer has no honest one) and every report still
//     counted the money as real
//   the "Transfer between my own accounts" checkbox — set is_transfer, which is
//     the ONLY thing reports.js, revenueBasis.js, Dashboard, EOS, Frankie and
//     the daily brief actually read
//
// Tracy reached for the dropdown, which is the obvious control and sits inside
// the flow she was already in. It left 48 rows labelled Transfer but unflagged:
// $23,522 of phantom revenue and $23,349 of phantom expenses in the 2026 books.
//
// So the two controls are now one rule, in one file, shared by the app and the
// categorising edge function — the same fix shape as matLabCore and specScrub,
// because a rule written twice is the thing that keeps breaking here.

/** The category name that means "not income, not an expense — I moved my own money". */
export const TRANSFER_CATEGORY = 'Transfer'

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** True when a category name is the transfer category, however it was cased. */
export function isTransferCategory(category: unknown): boolean {
  return norm(category) === norm(TRANSFER_CATEGORY)
}

/**
 * Resolve the single truth from whichever control someone used: the checkbox,
 * the modal dropdown, or the AI's own is_transfer flag. Saying it either way
 * has to mean the same thing, or the books drift from what the screen showed.
 */
export function resolveIsTransfer(
  { category, flagged }: { category?: unknown; flagged?: unknown },
): boolean {
  return flagged === true || isTransferCategory(category)
}

/**
 * What to persist for a transaction someone just categorised.
 *
 * A transfer carries no categories: leaving 'Transfer' behind in user_category
 * would put it back in the P&L the moment anyone filtered or grouped by
 * category, which is exactly how these 48 rows got counted twice over.
 */
export function transferFields(
  { category, taxCategory, flagged }:
  { category?: unknown; taxCategory?: unknown; flagged?: unknown },
): { is_transfer: boolean; user_category: string | null; user_tax_category: string | null } {
  const transfer = resolveIsTransfer({ category, flagged })
  return {
    is_transfer: transfer,
    user_category: transfer ? null : ((category as string) || null),
    user_tax_category: transfer ? null : ((taxCategory as string) || null),
  }
}

/**
 * What to SHOW in the category control for a transaction.
 *
 * The counterpart to transferFields, and it was missing. Because a transfer
 * stores user_category = null on purpose, every screen that read
 * `user_category || ai_category` fell straight back to the AI's original guess:
 * pick "Transfer", and the dropdown snapped back to "Service" the instant the
 * row reloaded. The flag had saved, the reports were right, and the screen said
 * otherwise — so Tracy reasonably concluded nothing had saved and kept trying
 * (f31332d3: "It will tell you what's saving it but then when you look, it
 * didn't save it. It went back to what you very first chose."). Stripe payout
 * 4740, $1,496.74, 28 Sep.
 *
 * is_transfer is the truth, so it answers first.
 */
export function displayCategory(
  txn: { is_transfer?: unknown; user_category?: unknown; ai_category?: unknown } | null | undefined,
): string {
  if (txn?.is_transfer === true) return TRANSFER_CATEGORY
  return (txn?.user_category as string) || (txn?.ai_category as string) || ''
}

/**
 * Is the category on screen only the AI's guess — the thing worth styling as
 * unconfirmed and chasing? A transfer never is: somebody, or a rule, decided it.
 */
export function isAiCategoryGuess(
  txn: { is_transfer?: unknown; user_category?: unknown; ai_category?: unknown } | null | undefined,
): boolean {
  if (txn?.is_transfer === true) return false
  return !txn?.user_category && !!txn?.ai_category
}

/**
 * Which job a bank transaction shows — the same rule as displayCategory, for
 * the other field that carries a guess and an answer in two columns.
 *
 * job_id is what a person chose. ai_job_id is what the matcher thought. While
 * nobody has decided, the guess is a useful head start and shows. Once the row
 * is confirmed, a person HAS decided, and an empty job_id is their answer:
 * "not this one". Falling back to ai_job_id past that point overrides the
 * answer with the guess it was given to replace.
 *
 * Tracy, /books, 2026-10-22: a $3,875.43 Central Valley deposit matched to The
 * Breakfast Club at 0.75 confidence. The guess was promoted to job_id on
 * confirm, and clearing it put the guess straight back on screen — so the row
 * read as unchanged, and saving again re-attached the job she was removing.
 * The same job sat on her $16,299.20 deposit from 6/25.
 *
 * This is f31332d3 again, one field over: the category dropdown snapped back
 * to the AI's pick for exactly this reason, and she reported it in the same
 * words — "it went back to what you very first chose".
 */
export function displayJobId(
  txn: { job_id?: unknown; ai_job_id?: unknown; confirmed?: unknown } | null | undefined,
): unknown {
  if (txn?.job_id !== null && txn?.job_id !== undefined && txn?.job_id !== '') return txn.job_id
  if (txn?.confirmed === true) return null
  return txn?.ai_job_id ?? null
}

/** Is the job on screen only the matcher's guess — the one to style as such? */
export function isAiJobGuess(
  txn: { job_id?: unknown; ai_job_id?: unknown; confirmed?: unknown } | null | undefined,
): boolean {
  const shown = displayJobId(txn)
  if (shown === null || shown === undefined) return false
  return txn?.job_id === null || txn?.job_id === undefined || txn?.job_id === ''
}

/**
 * Which job a bank row's money COUNTS AGAINST in a report — job costing, the
 * overhead pool, Frankie's per-job rollups. Only what a person chose; never
 * the matcher's guess, at any confidence.
 *
 * Deliberately stricter than displayJobId, and the difference is the point.
 * On screen the guess earns its place precisely because it is LABELLED one:
 * isAiJobGuess styles it, the confidence sits beside it, and the person
 * reading the row is the one who will decide. None of that survives into a
 * total. Inside "The Breakfast Club — total cost $X" there is no styling and
 * no confidence; the number is read as fact, and it drives margin, profit and
 * the EOS overhead rate. A report cannot show its work, so it must not make a
 * claim nobody has checked.
 *
 * Leaving a guess out costs nothing. An expense no person has tagged is not
 * dropped — it stays in the overhead pool and is spread over the hours
 * worked, exactly how every other untagged expense is treated. So excluding a
 * guess that was RIGHT is gentle: the money is still counted, just not
 * attributed yet. Including one that was WRONG is silent and doubled — the
 * job is charged for something it never bought AND the overhead pool shrinks
 * by the same amount, so two reports move in opposite directions off one
 * unreviewed guess.
 *
 * Nor is anything held back for long: confirming a row promotes ai_job_id
 * into job_id (Books.jsx, both Accept and Confirm All), so guess-only is a
 * waiting room, not a destination. The moment someone reviews the row, its
 * money lands on the job.
 *
 * HHH, 2026-10-22: exactly one row platform-wide reached these reports on a
 * guess — a $26.39 "Subscriptions" charge matched to The Breakfast Club at
 * 0.50 confidence. A subscription IS overhead (/subscription/ is in the
 * overhead allow-list), so a coin flip was charging a job for it and taking
 * it out of the pool at the same time, with nobody having agreed to either.
 *
 * Written down once because this lived inline as `job_id || ai_job_id` in the
 * four places that have to agree: lib/reports jobCosting, lib/overhead, and
 * two rollups in frankieTools. Four copies of one money rule is the shape
 * every circular regression in this app has had.
 */
export function costingJobId(
  txn: { job_id?: unknown } | null | undefined,
): unknown {
  const chosen = txn?.job_id
  if (chosen === null || chosen === undefined || chosen === '') return null
  return chosen
}

/**
 * A transfer needs no category and no tax category — there is no true answer to
 * either. Everything else needs both, or the books have a hole in them.
 */
export function needsCategories(
  { category, flagged }: { category?: unknown; flagged?: unknown },
): boolean {
  return !resolveIsTransfer({ category, flagged })
}

/**
 * Why a payout from a card processor is a transfer and not income.
 *
 * Tracy, 14 Aug: "There is a Stripe deposit transaction on Aug 5 in the amount
 * of $407. It should just let me choose income in the first category... The AI
 * automatically categorizes it to a transfer between accounts."
 *
 * A reasonable thing to think — from the bank statement it looks exactly like
 * money arriving. But the customer's payment is already recorded when they pay:
 * there are 30 Stripe payment rows on this company, and revenue is counted from
 * those. The payout is the same money moving from the Stripe balance into the
 * bank, so counting it again would report the revenue twice.
 *
 * Nothing said that anywhere, so it read as the app being wrong. Returns the
 * sentence to show on the transaction, or null when it does not apply.
 */
const PROCESSOR_PAYOUT = /\b(stripe|square|paypal|shopify)\b.*\b(payout|transfer)\b|\btransfer from (stripe|square|paypal)\b/i

export function processorPayoutNote(description: unknown): string | null {
  if (!PROCESSOR_PAYOUT.test(String(description ?? ''))) return null
  return 'Already counted as income when the customer paid — this is that money ' +
    'moving from the processor into the bank, so it is a transfer rather than a ' +
    'second sale. Categorising it as income would report the revenue twice.'
}
