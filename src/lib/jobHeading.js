// What a crew member should read first on a job card in the field.
//
// Cameron (11 Sep): "sometimes the job will show up as Jan Pro jobs, which
// could be a plethora of things — I'd like it to show up as Sun Belt first".
// Job titles are typed by the office and often lead with the customer, so a
// card reads "Jan Pro Signature Real Estate September Exterior Cleaning"
// over a second line that says "Jan Pro" again, and the part that tells the
// tech which building to drive to is the part that got cut off.
//
// The title is not changed anywhere — this only decides what to show. If the
// title starts with the customer's name, the card leads with what follows it;
// the customer still appears on the line below, next to the address.

const SEP = /^[\s\-–—:|,.·]+/

export function fieldJobHeading(job) {
  const rawTitle = String(job?.job_title || '').trim()
  const customer = String(job?.customer?.name || job?.customer?.business_name || job?.customer_name || '').trim()
  let title = rawTitle
  // Whole-name only: "Jan Pro - BHB" yes, "Jan Products" no.
  const after = rawTitle.slice(customer.length)
  if (rawTitle && customer && rawTitle.toLowerCase().startsWith(customer.toLowerCase()) && (after === '' || SEP.test(after))) {
    const rest = after.replace(SEP, '').trim()
    // "Jan Pro" alone stays "Jan Pro"; "Jan Pro - BHB Structural" becomes "BHB Structural".
    if (rest) title = rest
  }
  if (!title) title = job?.job_id || 'Job'
  const address = String(job?.job_address || job?.customer?.address || '').trim()
  const subtitle = [customer, address].filter(Boolean).join(' · ')
  return { title, subtitle, customer, address }
}
