// Venmo as a payment option.
//
// There is no processor behind it: the company publishes a handle, the
// customer sends money to it from their own Venmo app, and someone records
// the payment on the invoice (or in FieldScout) when it lands. These helpers
// keep the handle clean and build the links the customer taps.

// People paste all sorts of things into the handle field: "@Acme-Services",
// "venmo.com/Acme-Services", "https://venmo.com/u/Acme-Services?x=1". Store
// the bare username; add the @ back when displaying.
export function normalizeVenmoHandle(raw) {
  if (!raw) return ''
  let s = String(raw).trim()
  s = s.replace(/^https?:\/\/(www\.)?venmo\.com\//i, '')
  s = s.replace(/^venmo\.com\//i, '')
  s = s.replace(/^u\//i, '')
  s = s.replace(/[?#].*$/, '')
  s = s.replace(/^@+/, '')
  s = s.replace(/\s+/g, '')
  return s
}

// Venmo's web pay link. On a phone it hands off to the app with recipient,
// amount and note prefilled; on desktop it opens the profile page.
export function venmoPayUrl({ handle, amount, note } = {}) {
  const h = normalizeVenmoHandle(handle)
  if (!h) return null
  const params = new URLSearchParams({ txn: 'pay' })
  const amt = parseFloat(amount)
  if (Number.isFinite(amt) && amt > 0) params.set('amount', amt.toFixed(2))
  if (note) params.set('note', String(note))
  return `https://venmo.com/${encodeURIComponent(h)}?${params.toString()}`
}

// Body of the text a tech sends from FieldScout so the customer has the
// handle, amount and note in front of them.
export function venmoSmsBody({ customerName, handle, amount, note } = {}) {
  const h = normalizeVenmoHandle(handle)
  const amt = parseFloat(amount)
  const parts = []
  parts.push(`Hi ${customerName || 'there'} — you can pay by Venmo to @${h}`)
  if (Number.isFinite(amt) && amt > 0) parts.push(`Amount: $${amt.toFixed(2)}`)
  if (note) parts.push(`Please put "${note}" in the note.`)
  const url = venmoPayUrl({ handle: h, amount, note })
  if (url) parts.push(url)
  return parts.join('\n')
}
