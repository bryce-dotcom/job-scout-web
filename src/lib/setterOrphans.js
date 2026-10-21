// A setter's fee stranded on the lead the quote never reached.
//
// Tracy, 9 Sep and again 25 Sep: "Noah created a duplicate lead (UIS, Lead
// 4504) instead of using the one I set (Lead 4503). His lead has the quote so
// that eliminates my setter lead." And: "Sometimes they will put in the name
// of the person vs the business name. This will also bypass the lead I
// created for them."
//
// HHH pays a setter on the `quote_created` rule, so an appointment fee sits
// PENDING until a quote appears ON THAT LEAD. When a rep books the work
// against a second lead for the same customer, the quote lands over there and
// the setter's fee waits forever. Tracy has 276 pending rows worth $19,450;
// most are appointments that simply never got quoted, but some are this.
//
// THE REPAIR ALREADY EXISTS. Since 20260911120000 the promote trigger fires
// on `update of lead_id` on quotes: point the quote at the setter's lead and
// her fee earns itself, and the lead it left is demoted back. What has been
// missing is any way to KNOW. Nobody goes looking for a row that is quietly
// not paying, which is why Tracy found both of these by hand and said "I have
// noticed several commissions I should have received did not get tied to me."
//
// So this finds them and says which lead the quote went to. It does not move
// anything: relinking a quote changes who the sale belongs to, and that is a
// person's decision, not a match on a name.

/** Digits only. A phone is only a match when there are enough of them. */
export const phoneKey = (v) => String(v || '').replace(/\D/g, '')
const PHONE_MIN = 10

/** Lower-case, letters and digits only — "Halifax Flooring" -> "halifaxflooring". */
export const nameKey = (lead) =>
  String(lead?.business_name || lead?.customer_name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const emailKey = (v) => String(v || '').trim().toLowerCase() || null

// Strongest first. A shared phone is the one that catches Tracy's "name of
// the person vs the business name" — the names look nothing alike, and the
// number is the same number.
export const MATCH_ORDER = ['customer', 'phone', 'email', 'name']

const HOW_SAID = {
  customer: 'the same customer record',
  phone: 'the same phone number',
  email: 'the same email address',
  name: 'the same name',
}

/** How this stranded fee was matched to the lead that got quoted, in words. */
export const matchSentence = (how) => HOW_SAID[how] || 'a match'

/**
 * Pending setter fees whose customer was quoted on a DIFFERENT lead.
 *
 * @param commissions lead_commissions rows (any status — filtered here)
 * @param leads       leads carrying quote_id, phone, email, customer_id, names
 * @returns [{ commission, lead, quotedLead, how }] strongest match first
 *
 * Only `appointment_set` rows still `pending` are considered: an earned or
 * paid fee has already done what it needed to, and a lead_source fee is not
 * waiting on a quote at all.
 */
export function strandedSetterFees({ commissions = [], leads = [] } = {}) {
  const byId = new Map((leads || []).filter(Boolean).map((l) => [String(l.id), l]))
  const quoted = (leads || []).filter((l) => l && l.quote_id != null)

  const out = []
  for (const c of commissions || []) {
    if (!c || c.commission_type !== 'appointment_set') continue
    if (c.payment_status !== 'pending') continue
    const lead = byId.get(String(c.lead_id))
    // Her lead already has the quote — nothing is stranded, it is just not
    // quoted yet, which is the ordinary pending case.
    if (!lead || lead.quote_id != null) continue

    const ph = phoneKey(lead.phone)
    const em = emailKey(lead.email)
    const key = nameKey(lead)

    let best = null
    for (const q of quoted) {
      if (String(q.id) === String(lead.id)) continue
      let how = null
      if (lead.customer_id != null && q.customer_id === lead.customer_id) how = 'customer'
      else if (ph.length >= PHONE_MIN && phoneKey(q.phone) === ph) how = 'phone'
      else if (em && emailKey(q.email) === em) how = 'email'
      else if (key && nameKey(q) === key) how = 'name'
      if (!how) continue
      if (!best || MATCH_ORDER.indexOf(how) < MATCH_ORDER.indexOf(best.how)) best = { how, quotedLead: q }
      if (best.how === MATCH_ORDER[0]) break
    }
    if (best) out.push({ commission: c, lead, quotedLead: best.quotedLead, how: best.how })
  }

  out.sort((a, b) =>
    MATCH_ORDER.indexOf(a.how) - MATCH_ORDER.indexOf(b.how) ||
    (Number(b.commission.amount) || 0) - (Number(a.commission.amount) || 0))
  return out
}

/** What the stranded fees come to, for a heading. */
export const strandedTotal = (rows = []) =>
  (rows || []).reduce((s, r) => s + (Number(r?.commission?.amount) || 0), 0)
