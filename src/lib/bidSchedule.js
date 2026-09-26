// The bid schedule — the buyer's list of items, in the buyer's order, with a
// unit price and an extension on every row. One rule for the portal page,
// the PDF and the estimate preview, so a total on the screen can never
// disagree with the total on the paper the procurement office receives.
//
// What Benny read from the package lives in quotes.bid_intake; what we are
// bidding lives in quote_lines (bid_item_no / bid_spec carry the buyer's own
// numbering and spec text). This file only arranges and adds.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** quotes.bid_intake, whether it arrives as an object or a JSON string; never null. */
export function bidIntakeOf(doc) {
  let v = doc?.bid_intake
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
  v = v && typeof v === 'object' ? v : {}
  return {
    title: v.title || doc?.estimate_name || null,
    bid_number: v.bid_number || null,
    buyer: v.buyer || null,             // "City of Ogden — Parks & Recreation"
    project: v.project || null,         // "Lorin Farr Park LED Retrofit"
    due_at: v.due_at || null,
    submit_to: v.submit_to || null,
    instructions: v.instructions || null,
    columns: Array.isArray(v.columns) && v.columns.length ? v.columns : DEFAULT_COLUMNS,
    sections: Array.isArray(v.sections) ? v.sections : [],
    source_document: v.source_document || null,
    read_at: v.read_at || null,
    alternates: Array.isArray(v.alternates) ? v.alternates : [],
    acknowledgements: Array.isArray(v.acknowledgements) ? v.acknowledgements : [],
  }
}

export const DEFAULT_COLUMNS = ['Item', 'Description', 'Qty', 'Unit', 'Unit Price', 'Extended']

/**
 * Item numbers sort the way a bid form reads: 1, 2, 2.1, 2.10, 10, A-1.
 * String sort puts 10 before 2; this does not.
 */
export function compareItemNo(a, b) {
  const pa = String(a ?? '').split(/[.\-\s]+/), pb = String(b ?? '').split(/[.\-\s]+/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '', y = pb[i] ?? ''
    if (x === y) continue
    if (x === '') return -1 // "2" before "2.1"
    if (y === '') return 1
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    return x.localeCompare(y)
  }
  return 0
}

/** One schedule row per quote line, in the buyer's order. */
export function scheduleRows(lines) {
  const rows = (lines || []).map((l, i) => {
    const qty = Number(l.quantity) || 0
    const unitPrice = r2(l.price ?? l.unit_price)
    const extended = l.line_total != null ? r2(l.line_total) : r2(qty * unitPrice)
    return {
      id: l.id ?? i,
      item_no: l.bid_item_no || null,
      description: l.bid_spec || [l.item_name || l.item?.name, l.description].filter(Boolean).join(' — ') || 'Item',
      qty,
      unit: l.unit_of_measure || 'EA',
      unit_price: unitPrice,
      extended,
      sort_order: l.sort_order ?? i,
      sourced: l.price_source === 'ai_sourced',
      unverified: l.price_source === 'ai_sourced' && !l.price_verified_at,
      match_kind: l.match_kind || null,
    }
  })
  return rows.sort((a, b) => {
    if (a.item_no && b.item_no) return compareItemNo(a.item_no, b.item_no)
    if (a.item_no || b.item_no) return a.item_no ? -1 : 1
    return a.sort_order - b.sort_order
  })
}

/**
 * Sections from the package (each names its item numbers); anything the
 * package did not place goes under "Schedule of Items". A bid with no
 * sections is one section.
 */
export function groupSections(rows, intake) {
  const secs = (intake?.sections || []).map((s) => ({ name: s.name || 'Schedule of Items', rows: [] }))
  const where = new Map()
  ;(intake?.sections || []).forEach((s, idx) => (s.item_nos || []).forEach((n) => where.set(String(n), idx)))
  const loose = []
  for (const r of rows) {
    const idx = r.item_no != null ? where.get(String(r.item_no)) : undefined
    if (idx == null) loose.push(r); else secs[idx].rows.push(r)
  }
  const out = secs.filter((s) => s.rows.length)
  if (loose.length) out.push({ name: out.length ? 'Other Items' : 'Schedule of Items', rows: loose })
  return out.map((s) => ({ ...s, total: r2(s.rows.reduce((t, r) => t + r.extended, 0)) }))
}

export function scheduleTotal(rows) {
  return r2((rows || []).reduce((t, r) => t + (Number(r.extended) || 0), 0))
}

export function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtQty(n) {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Everything a renderer needs, computed once. */
export function buildSchedule(doc, lines) {
  const intake = bidIntakeOf(doc)
  const rows = scheduleRows(lines)
  const sections = groupSections(rows, intake)
  return { intake, rows, sections, total: scheduleTotal(rows), unverified: rows.filter((r) => r.unverified).length }
}
