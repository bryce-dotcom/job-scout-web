// Which site was this invoice for?
//
// Tracy (d5775312): "Invoice only shows job account not job site information.
// Receiving pushback because they don't see what job this was for. An account
// can have multiple job locations."
//
// A property manager with fourteen buildings gets an invoice addressed to the
// management company and cannot tell which building it covers. That is not a
// Tracy problem; it is true of every customer with more than one site.
//
// The rule is only interesting because of the second half: show the service
// address when it DIFFERS from where the bill is sent. Printing the same
// address twice under two headings makes an invoice look confused, and most
// customers are single-site.
//
// The invoice PDF had this rule inline. It now lives here so the PDF and the
// customer portal answer the question the same way — the customer sees one
// invoice, whichever surface they look at it on.

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The service address to display, or null when there is nothing worth showing.
 *
 * jobAddress      the job's site address
 * billingAddress  where the invoice is addressed
 */
export function serviceAddressToShow(jobAddress, billingAddress) {
  const site = String(jobAddress ?? '').trim()
  if (!site) return null
  return norm(site) === norm(billingAddress) ? null : site
}
