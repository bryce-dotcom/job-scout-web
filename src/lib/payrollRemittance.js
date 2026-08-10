// Payroll tax remittance — turns the per-run rows in `payroll_tax_liabilities`
// into the handful of payments an employer actually has to make each payroll,
// and renders a printable "deposit worksheet" they take to EFTPS / their state
// portal.
//
// IMPORTANT: JobScout calculates and documents these; it does NOT send the
// money. Every payroll, the admin remits these themselves and marks them paid.
//
// The liability table stores federal taxes as SEPARATE rows
// (federal_income_tax + social_security + medicare [+ additional_medicare]);
// the IRS is paid as ONE Form-941 deposit, so we sum those into one bucket.
// See supabase/migrations/20260508214221_payroll_tax_foundation.sql.

// The buckets an employer remits, in the order they appear on the worksheet.
// `kinds` are the payroll_tax_liabilities.kind values that roll into each.
const BUCKETS = [
  {
    id: 'federal_941',
    kinds: ['federal_income_tax', 'social_security', 'medicare', 'additional_medicare'],
    label: 'Federal payroll taxes (Form 941)',
    detail: 'Income-tax withholding + Social Security + Medicare (employee & employer share).',
    method: 'EFTPS',
    where: 'Pay electronically at eftps.gov (or by phone). Enrollment required.',
  },
  {
    id: 'federal_940',
    kinds: ['futa'],
    label: 'Federal unemployment (FUTA · Form 940)',
    detail: 'Employer-only FUTA. Deposit when the accrued liability crosses $500.',
    method: 'EFTPS',
    where: 'Pay electronically at eftps.gov.',
  },
  {
    id: 'state_income',
    kinds: ['state_income_tax'],
    label: 'State income-tax withholding',
    detail: 'State income tax withheld from employee wages.',
    method: 'State portal',
    where: 'Pay through your state tax agency’s online portal.',
  },
  {
    id: 'state_ui',
    kinds: ['sui'],
    label: 'State unemployment (SUI/SUTA)',
    detail: 'Employer-only state unemployment insurance.',
    method: 'State portal',
    where: 'Pay through your state workforce/UI agency’s portal.',
  },
  {
    id: 'local',
    kinds: ['local_income_tax', 'local'],
    label: 'Local taxes',
    detail: 'Local jurisdiction taxes, where applicable.',
    method: 'Local portal',
    where: 'Pay through the local taxing authority.',
  },
]

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const earliest = (dates) => dates.filter(Boolean).sort()[0] || null

// Group a run's liability rows into the payments an employer must remit.
// Returns [{ id, label, detail, method, where, agency, amount, dueDate,
//            liabilityIds, paid, paidAt, breakdown:[{kind, amount}] }]
// — skipping buckets with a zero total. `liabilities` = payroll_tax_liabilities
// rows for one payroll_run (or any set you want summarized together).
export function groupRemittance(liabilities = []) {
  const rows = Array.isArray(liabilities) ? liabilities : []
  const out = []
  for (const b of BUCKETS) {
    const mine = rows.filter((r) => b.kinds.includes(r.kind))
    if (!mine.length) continue
    const amount = round2(mine.reduce((s, r) => s + Number(r.amount_total || 0), 0))
    if (amount <= 0) continue
    out.push({
      id: b.id,
      label: b.label,
      detail: b.detail,
      method: b.method,
      where: b.where,
      agency: mine.find((r) => r.agency)?.agency || null,
      amount,
      dueDate: earliest(mine.map((r) => r.due_date)),
      liabilityIds: mine.map((r) => r.id),
      paid: mine.every((r) => !!r.paid_at),
      paidAt: mine.map((r) => r.paid_at).filter(Boolean).sort().slice(-1)[0] || null,
      breakdown: mine
        .slice()
        .sort((a, c) => b.kinds.indexOf(a.kind) - b.kinds.indexOf(c.kind))
        .map((r) => ({ kind: r.kind, amount: round2(r.amount_total) })),
    })
  }
  return out
}

export function remittanceTotal(buckets = []) {
  return round2(buckets.reduce((s, b) => s + (b.amount || 0), 0))
}

const KIND_LABEL = {
  federal_income_tax: 'Federal income tax withheld',
  social_security: 'Social Security (both shares)',
  medicare: 'Medicare (both shares)',
  additional_medicare: 'Additional Medicare (0.9%)',
  futa: 'FUTA',
  state_income_tax: 'State income tax withheld',
  sui: 'State unemployment (SUI)',
  local_income_tax: 'Local income tax',
  local: 'Local tax',
}

const fmtMoney = (n) => '$' + round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d) => {
  if (!d) return '—'
  // d is 'YYYY-MM-DD' (or ISO) — format without timezone drift.
  const [y, m, day] = String(d).slice(0, 10).split('-')
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] || m
  return `${mo} ${Number(day)}, ${y}`
}

// Build a printable "Payroll Tax Deposit Worksheet" for one payroll run.
// `doc` is a jsPDF instance (passed in so this stays import-light / Node-testable).
// company: { legal_name|name, ein, state_employer_id_state }
// run:     { pay_date, period_start, period_end }
export function buildDepositWorksheet(doc, { company = {}, run = {}, buckets = [] }) {
  const M = 54                 // left margin (pt)
  const W = 612                // letter width
  const right = W - M
  let y = 60
  const ink = [32, 38, 28], sub = [90, 100, 84], line = [214, 205, 182], hivis = [176, 101, 26]

  const text = (s, x, yy, { size = 10, bold = false, color = ink, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    doc.text(Array.isArray(s) ? s : String(s), x, yy, { align })
  }
  const rule = (yy, color = line) => { doc.setDrawColor(...color); doc.setLineWidth(0.8); doc.line(M, yy, right, yy) }

  // Header
  text('PAYROLL TAX DEPOSIT WORKSHEET', M, y, { size: 15, bold: true })
  y += 16
  text('What to remit this payroll — and where. JobScout does not send these payments.', M, y, { size: 9.5, color: sub })
  y += 18; rule(y); y += 20

  // Employer + period block
  const coName = company.legal_name || company.name || 'Your company'
  text(coName, M, y, { size: 11, bold: true })
  text(`Pay date: ${fmtDate(run.pay_date)}`, right, y, { size: 10, align: 'right' })
  y += 14
  text(`EIN: ${company.ein || '—'}`, M, y, { size: 9.5, color: sub })
  const period = run.period_start ? `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}` : ''
  if (period) text(`Pay period: ${period}`, right, y, { size: 9.5, color: sub, align: 'right' })
  y += 22

  // Table header
  const cAmt = right, cDue = right - 120
  text('PAYMENT', M, y, { size: 8.5, bold: true, color: sub })
  text('DUE', cDue, y, { size: 8.5, bold: true, color: sub })
  text('AMOUNT', cAmt, y, { size: 8.5, bold: true, color: sub, align: 'right' })
  y += 8; rule(y); y += 16

  for (const b of buckets) {
    text(b.label, M, y, { size: 10.5, bold: true })
    text(fmtDate(b.dueDate), cDue, y, { size: 10 })
    text(fmtMoney(b.amount), cAmt, y, { size: 11, bold: true, align: 'right' })
    y += 13
    text(`${b.method} · ${b.where}`, M, y, { size: 8.5, color: sub })
    y += 12
    // breakdown line
    const parts = b.breakdown.map((k) => `${KIND_LABEL[k.kind] || k.kind} ${fmtMoney(k.amount)}`)
    if (parts.length > 1) { text(parts.join('   ·   '), M, y, { size: 8, color: sub }); y += 12 }
    y += 6; rule(y, [230, 224, 206]); y += 16
    if (y > 690) { doc.addPage(); y = 60 }
  }

  // Total
  y += 4
  text('TOTAL TO REMIT THIS PAYROLL', M, y, { size: 11, bold: true })
  text(fmtMoney(remittanceTotal(buckets)), cAmt, y, { size: 14, bold: true, color: hivis, align: 'right' })
  y += 24; rule(y); y += 20

  // Footer instructions
  const notes = [
    'Federal taxes (941 & FUTA): pay electronically at eftps.gov. Missing a federal deposit deadline can trigger IRS penalties.',
    'State taxes: pay through your state tax and unemployment portals by the dates above.',
    'This worksheet is a payment aid — it is not a filed return. JobScout does not remit these funds; you must send each payment yourself and can then mark it remitted.',
  ]
  for (const n of notes) {
    const wrapped = doc.splitTextToSize(`•  ${n}`, right - M)
    text(wrapped, M, y, { size: 8.5, color: sub }); y += wrapped.length * 11 + 4
  }
  return doc
}
