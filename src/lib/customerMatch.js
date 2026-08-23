// Identity-safe customer matching.
//
// Why: lead→estimate→job flows used to attach customers by NAME ONLY
// (`.ilike('name', ...)`), which silently linked records to the wrong human —
// Doug's test lead "Doug" got attached to the March customer "Doug" of
// Curley Construction, so approval appeared to "change the email address"
// (ticket 5406ff71). Worse, the convert back-fill would then write the
// lead's phone/address INTO the wrong customer's record.
//
// Match order:
//   1. email (exact, case-insensitive)  — strong identifier
//   2. phone (last 10 digits)           — strong identifier
//   3. name — ONLY when the candidate doesn't contradict the contact info we
//      hold (no conflicting email/phone on the candidate). A name hit with a
//      different email/phone is treated as a DIFFERENT person → return null
//      so the caller creates a fresh customer.

const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10)

export async function findMatchingCustomer(supabase, companyId, { name, email, phone }) {
  const e = String(email || '').trim().toLowerCase()
  const p = digits(phone)
  const n = String(name || '').trim()

  if (e) {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .ilike('email', e)
      .limit(1)
    if (data?.length) return data[0].id
  }

  if (p && p.length >= 7) {
    // Phone is stored in arbitrary formats — narrow by the last 4 digits in
    // SQL, then compare normalized in JS.
    const { data } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('company_id', companyId)
      .ilike('phone', `%${p.slice(-4)}%`)
      .limit(25)
    const hit = (data || []).find((c) => digits(c.phone) === p)
    if (hit) return hit.id
  }

  if (n) {
    const { data } = await supabase
      .from('customers')
      .select('id, email, phone')
      .eq('company_id', companyId)
      .ilike('name', n)
      .limit(5)
    const safe = (data || []).find((c) => {
      const emailConflict = c.email && e && String(c.email).trim().toLowerCase() !== e
      const phoneConflict = digits(c.phone) && p && digits(c.phone) !== p
      return !emailConflict && !phoneConflict
    })
    if (safe) return safe.id
  }

  return null
}

/**
 * Contact details the matched customer is missing and the lead already has.
 *
 * Doug (ad33b5fe): "Damion can see the contact info in the Job. I cannot, i did
 * refresh my system."
 *
 * Nothing was hidden from him. Halverson Mechanical already existed as a
 * customer — name and address, no phone, no email — so when the lead was
 * converted, findMatchingCustomer matched it and the caller used it as-is. The
 * lead's phone (8014304041) and email (dave@halversonmechanical.com) stayed on
 * the lead. Damien could see them because he works the lead; the job reads the
 * CUSTOMER, which had neither.
 *
 * Only fills blanks. An existing value is never overwritten — a customer record
 * that someone has corrected by hand outranks whatever was typed on a lead
 * months ago, and silently replacing it would be a worse bug than the one this
 * fixes.
 *
 * Returns null when there is nothing to fill, so a caller can skip the write.
 */
export function contactGapPatch(customer, source) {
  if (!customer || !source) return null
  const patch = {}
  for (const field of ['phone', 'email', 'address']) {
    const have = String(customer[field] ?? '').trim()
    const incoming = String(source[field] ?? '').trim()
    if (!have && incoming) patch[field] = incoming
  }
  return Object.keys(patch).length ? patch : null
}
