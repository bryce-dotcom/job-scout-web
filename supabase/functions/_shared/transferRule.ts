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
 * A transfer needs no category and no tax category — there is no true answer to
 * either. Everything else needs both, or the books have a hole in them.
 */
export function needsCategories(
  { category, flagged }: { category?: unknown; flagged?: unknown },
): boolean {
  return !resolveIsTransfer({ category, flagged })
}
