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
