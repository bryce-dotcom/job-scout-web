// The half-typed line item at the bottom of the Add Job dialog.
//
// Christopher: "I just tested it. It works only if you hit the add button on
// the dialogue box. Then right below is the add job button. I have been hitting
// the add job button thinking all of the info is saved. Having to hit one save
// button would remove confusion and add to ease of use."
//
// He is describing data loss, not a preference. The dialog keeps a draft row —
// product, description, price, qty — and only the small "Add" button folds it
// into the list that gets saved. Submitting read the list and never the draft,
// so a line you had typed but not Added went in the bin without a word, and the
// job was created missing the work.
//
// This is the one place that decides what a draft becomes. The Add button uses
// it, and so does submit — which is what makes the small button optional rather
// than mandatory, and answers the actual request.

/**
 * Turn a draft row into a job line, or null when there is nothing to keep.
 *
 * draft    { item_id, description, price, quantity }
 * products the catalogue, for name and unit-price fallback
 */
export function draftToJobLine(draft, products = []) {
  if (!draft) return null
  const desc = String(draft.description ?? '').trim()
  // Nothing typed and nothing picked: an untouched draft is not a line, and
  // submitting must not invent one.
  if (!draft.item_id && !desc) return null

  // Blank quantity means the field was never touched — the input's own default
  // is 1. A deliberate 0 or a negative is not a line anyone means to bill.
  const rawQty = draft.quantity
  const qty = rawQty === '' || rawQty == null ? 1 : Number(rawQty)
  if (!Number.isFinite(qty) || qty <= 0) return null

  const prod = (products || []).find((p) => String(p.id) === String(draft.item_id))
  // A typed price wins; a catalogue line falls back to the product's price.
  const typed = draft.price
  const price = (typed !== '' && typed != null && !isNaN(Number(typed)))
    ? Number(typed)
    : Number(prod?.unit_price || 0)

  return {
    item_id: draft.item_id || null,
    description: desc || prod?.name || '',
    price,
    quantity: qty,
  }
}

/** True when the draft holds something a person would expect to be saved. */
export function draftHasContent(draft) {
  if (!draft) return false
  return !!draft.item_id || !!String(draft.description ?? '').trim()
}
