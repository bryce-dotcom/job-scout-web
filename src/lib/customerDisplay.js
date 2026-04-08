// Centralized "how do we show a customer" logic.
//
// Business name wins because businesses are what reps sell to and what
// shows up on invoices, legal docs, and proposals. The contact person
// ("Jayleen" at "Kimball Investment Co.") is the secondary line when
// there's a distinct business name.
//
// Falls back through every historical field shape — leads use
// `customer_name`, customers use `name` + `business_name`, and some
// legacy joins expose `business_or_customer`. One helper, everywhere.

/**
 * Primary label for a customer-like object.
 *
 * @param {Object|null|undefined} c - customer / lead / joined row
 * @returns {string}
 */
export function getCustomerPrimary(c) {
  if (!c) return ''
  return (
    c.business_name ||
    c.name ||
    c.customer_name ||
    c.business_or_customer ||
    ''
  )
}

/**
 * Secondary line — the contact person when a business name is present.
 * Returns an empty string for personal customers so pages don't render
 * a duplicate "Jayleen / Jayleen" pair.
 */
export function getCustomerSecondary(c) {
  if (!c) return ''
  if (c.business_name) {
    return c.name || c.customer_name || ''
  }
  return ''
}

/**
 * Inline label suitable for a single-line chip / dropdown / list item.
 * Shows "Business (Contact)" when both exist, or just the primary otherwise.
 */
export function formatCustomerLabel(c) {
  const primary = getCustomerPrimary(c)
  const secondary = getCustomerSecondary(c)
  return secondary ? `${primary} (${secondary})` : primary
}
