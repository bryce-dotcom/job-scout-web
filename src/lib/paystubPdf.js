// Gusto-style employee earnings statement (paystub) as a PDF.
// Alayda: "our paystubs suck compared to Gusto" (feedback bfb724e9) — she
// sent a Gusto stub as the bar. This renders the same structure from our own
// data: company + employee identity, earnings itemized by type with
// rate/hours/current/YTD, employee AND employer taxes, deductions, and a
// gross->net summary, every line carrying a Year-To-Date column.
//
// Exports:
//   computePaystubYtd(allStubs, paystub) -> summed YTD fields for the year
//   generatePaystubPdf({ paystub, employee, company, ytd }) -> Promise<Blob>
//
// The tax numbers come straight off the finalized `paystubs` row (populated by
// payrollTax.js at run time). This file only PRESENTS them — it never computes
// tax, so it can't drift from the engine.

const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0)
const num = (v) => (Number(v) || 0)
const hrs = (v) => (Number(v) || 0).toFixed(2)

// Sum every dollar/hour field across this employee's finalized paystubs in the
// same calendar year, up to and including this pay date — that's the YTD column.
export function computePaystubYtd(allStubs, paystub) {
  const year = String(paystub.pay_date || '').slice(0, 4)
  const mine = (allStubs || []).filter(s =>
    String(s.employee_id) === String(paystub.employee_id) &&
    String(s.pay_date || '').slice(0, 4) === year &&
    String(s.pay_date || '') <= String(paystub.pay_date || '') &&
    !s.amends_paystub_id, // skip amendment rows so we don't double-count
  )
  const FIELDS = [
    'gross_pay', 'net_pay', 'bonus_pay', 'commission_pay', 'reimbursement_pay',
    'regular_hours', 'overtime_hours', 'pto_hours',
    'federal_income_tax', 'state_income_tax', 'social_security_employee',
    'medicare_employee', 'additional_medicare',
    'social_security_employer', 'medicare_employer', 'futa', 'sui',
    'pre_tax_deductions', 'post_tax_deductions',
  ]
  const ytd = {}
  for (const f of FIELDS) ytd[f] = mine.reduce((a, s) => a + (Number(s[f]) || 0), 0)
  // per-line earnings YTD need rate*hours summed per stub (rate can change)
  ytd.regular_pay = mine.reduce((a, s) => a + (Number(s.regular_hours) || 0) * (Number(s.hourly_rate) || 0), 0)
  ytd.overtime_pay = mine.reduce((a, s) => a + (Number(s.overtime_hours) || 0) * (Number(s.hourly_rate) || 0) * 1.5, 0)
  ytd.pto_pay = mine.reduce((a, s) => a + (Number(s.pto_hours) || 0) * (Number(s.hourly_rate) || 0), 0)
  ytd.salary_amount = mine.reduce((a, s) => a + (Number(s.salary_amount) || 0), 0)
  return ytd
}

export async function generatePaystubPdf({ paystub, employee, company, ytd }) {
  const mod = await import('jspdf')
  // Pick whichever export is actually the constructor: browser (Vite) exposes
  // it as .default, Node exposes .default as an object and .jsPDF as the fn.
  const jsPDF = [mod.jsPDF, mod.default, mod.default && mod.default.jsPDF].find((x) => typeof x === 'function')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth()
  const M = 40
  const RIGHT = PW - M
  let y = M

  const p = paystub || {}
  const e = employee || {}
  const c = company || {}
  const yt = ytd || {}
  const rate = num(p.hourly_rate)
  const isSalary = Array.isArray(e.pay_type) ? e.pay_type.includes('salary') : /salary/i.test(String(e.pay_type || ''))

  const fmtDate = (s) => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const set = (size, style = 'normal', color = [40, 44, 46]) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color) }
  const muted = [125, 130, 128]
  const rule = (yy, x1 = M, x2 = RIGHT, col = [214, 205, 184]) => { doc.setDrawColor(...col); doc.setLineWidth(0.6); doc.line(x1, yy, x2, yy) }

  // ---- Title ----
  set(17, 'bold'); doc.text('Earnings Statement', M, y + 4)
  set(9, 'normal', muted); doc.text('Pay Day ' + fmtDate(p.pay_date), RIGHT, y + 4, { align: 'right' })
  y += 22
  rule(y); y += 16

  // ---- Identity: company (left) + employee (right) ----
  const colR = M + 300
  set(10, 'bold'); doc.text(String(c.company_name || c.legal_name || 'Company'), M, y)
  set(10, 'bold'); doc.text(String(e.name || 'Employee'), colR, y)
  set(9, 'normal', muted)
  const coLines = [c.address, [c.city, c.state].filter(Boolean).join(', ') + (c.zip ? ' ' + c.zip : ''), c.ein ? 'EIN ' + c.ein : null, c.phone].filter(x => x && String(x).trim())
  const empLines = [
    e.ssn_last4 ? 'SSN •••-••-' + e.ssn_last4 : null,
    e.home_address,
    [e.home_city, e.home_state].filter(Boolean).join(', ') + (e.home_zip ? ' ' + e.home_zip : ''),
    e.role,
  ].filter(x => x && String(x).trim())
  let yl = y + 13
  const maxLines = Math.max(coLines.length, empLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (coLines[i]) doc.text(String(coLines[i]), M, yl)
    if (empLines[i]) doc.text(String(empLines[i]), colR, yl)
    yl += 12
  }
  y = yl + 4
  set(9, 'normal', [40, 44, 46])
  doc.text(`Pay period: ${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}`, M, y)
  set(11, 'bold'); doc.text('Net Pay ' + money(p.net_pay), RIGHT, y, { align: 'right' })
  y += 14
  rule(y); y += 16

  // ---- helper: a 5-col earnings/summary table ----
  const cols = { desc: M, rate: M + 250, hours: M + 320, cur: M + 410, ytd: RIGHT }
  const headRow = (label) => {
    set(8, 'bold', muted)
    doc.text(label, cols.desc, y)
    doc.text('Rate', cols.rate, y, { align: 'right' })
    doc.text('Hours', cols.hours, y, { align: 'right' })
    doc.text('Current', cols.cur, y, { align: 'right' })
    doc.text('YTD', cols.ytd, y, { align: 'right' })
    y += 4; rule(y); y += 12
  }
  const earnRow = (label, { rate: r, hours: h, cur, ytdv, bold } = {}) => {
    set(9, bold ? 'bold' : 'normal', [40, 44, 46])
    doc.text(String(label), cols.desc, y)
    if (r != null) doc.text(money(r), cols.rate, y, { align: 'right' })
    if (h != null) doc.text(hrs(h), cols.hours, y, { align: 'right' })
    doc.text(money(cur), cols.cur, y, { align: 'right' })
    doc.text(money(ytdv), cols.ytd, y, { align: 'right' })
    y += 13
  }

  // ---- Earnings ----
  headRow('EARNINGS')
  if (isSalary && num(p.salary_amount) > 0) {
    earnRow('Salary' + (e.role ? ` — ${e.role}` : ''), { cur: p.salary_amount, ytdv: yt.salary_amount })
  } else {
    earnRow('Regular' + (e.role ? ` — ${e.role}` : ''), { rate, hours: p.regular_hours, cur: num(p.regular_hours) * rate, ytdv: yt.regular_pay })
    if (num(p.overtime_hours) > 0) earnRow('Overtime', { rate: rate * 1.5, hours: p.overtime_hours, cur: num(p.overtime_hours) * rate * 1.5, ytdv: yt.overtime_pay })
    if (num(p.pto_hours) > 0) earnRow('Paid Time Off', { rate, hours: p.pto_hours, cur: num(p.pto_hours) * rate, ytdv: yt.pto_pay })
  }
  if (num(p.bonus_pay) > 0) earnRow('Bonus', { cur: p.bonus_pay, ytdv: yt.bonus_pay })
  if (num(p.commission_pay) > 0) earnRow('Commission', { cur: p.commission_pay, ytdv: yt.commission_pay })
  y += 2; rule(y); y += 12
  const totalHours = num(p.regular_hours) + num(p.overtime_hours) + num(p.pto_hours)
  earnRow('Gross Earnings', { hours: totalHours || null, cur: p.gross_pay, ytdv: yt.gross_pay, bold: true })
  y += 10

  // ---- Two-column tax tables: employee (left) | employer (right) ----
  const boxTop = y
  const lx = M, rx = M + 270
  const taxRow = (x, label, cur, ytdv) => {
    set(8.5, 'normal', [40, 44, 46])
    doc.text(String(label), x, ty)
    doc.text(money(cur), x + 180, ty, { align: 'right' })
    doc.text(money(ytdv), x + 250, ty, { align: 'right' })
    ty += 12.5
  }
  const taxHead = (x, label) => {
    set(8, 'bold', muted)
    doc.text(label, x, ty)
    doc.text('Current', x + 180, ty, { align: 'right' })
    doc.text('YTD', x + 250, ty, { align: 'right' })
  }
  let ty = boxTop
  taxHead(lx, 'EMPLOYEE TAXES WITHHELD'); taxHead(rx, 'EMPLOYER TAXES')
  ty += 4; rule(ty, lx, lx + 250); rule(ty, rx, rx + 250); ty += 12
  const tyStart = ty
  // employee column
  taxRow(lx, 'Federal Income Tax', p.federal_income_tax, yt.federal_income_tax)
  taxRow(lx, 'Social Security', p.social_security_employee, yt.social_security_employee)
  taxRow(lx, 'Medicare', p.medicare_employee, yt.medicare_employee)
  if (num(p.additional_medicare) > 0) taxRow(lx, 'Add’l Medicare', p.additional_medicare, yt.additional_medicare)
  taxRow(lx, 'State Income Tax', p.state_income_tax, yt.state_income_tax)
  const empEnd = ty
  // employer column (reset ty to align tops)
  ty = tyStart
  taxRow(rx, 'Social Security', p.social_security_employer, yt.social_security_employer)
  taxRow(rx, 'Medicare', p.medicare_employer, yt.medicare_employer)
  taxRow(rx, 'FUTA', p.futa, yt.futa)
  taxRow(rx, 'State Unemployment', p.sui, yt.sui)
  y = Math.max(empEnd, ty) + 6
  rule(y); y += 16

  // ---- Summary ----
  const sumRow = (label, cur, ytdv, opts = {}) => {
    set(9, opts.bold ? 'bold' : 'normal', opts.color || [40, 44, 46])
    doc.text(String(label), cols.desc, y)
    doc.text(money(Math.abs(num(cur))), cols.cur, y, { align: 'right' })
    doc.text(money(Math.abs(num(ytdv))), cols.ytd, y, { align: 'right' })
    y += 13.5
  }
  set(8, 'bold', muted)
  doc.text('SUMMARY', cols.desc, y)
  doc.text('Current', cols.cur, y, { align: 'right' })
  doc.text('YTD', cols.ytd, y, { align: 'right' })
  y += 4; rule(y); y += 12
  const totalTax = num(p.federal_income_tax) + num(p.state_income_tax) + num(p.social_security_employee) + num(p.medicare_employee) + num(p.additional_medicare)
  const ytdTax = num(yt.federal_income_tax) + num(yt.state_income_tax) + num(yt.social_security_employee) + num(yt.medicare_employee) + num(yt.additional_medicare)
  sumRow('Gross Earnings', p.gross_pay, yt.gross_pay)
  if (num(p.pre_tax_deductions) > 0 || num(yt.pre_tax_deductions) > 0) sumRow('Pre-Tax Deductions', p.pre_tax_deductions, yt.pre_tax_deductions, { neg: true, color: [200, 60, 40] })
  sumRow('Taxes', totalTax, ytdTax, { neg: true, color: [200, 60, 40] })
  if (num(p.post_tax_deductions) > 0 || num(yt.post_tax_deductions) > 0) sumRow('Post-Tax Deductions', p.post_tax_deductions, yt.post_tax_deductions, { neg: true, color: [200, 60, 40] })
  y += 2; rule(y); y += 12
  sumRow('Net Pay', p.net_pay, yt.net_pay, { bold: true, color: [74, 82, 57] })
  if (num(p.reimbursement_pay) > 0 || num(yt.reimbursement_pay) > 0) sumRow('Reimbursements', p.reimbursement_pay, yt.reimbursement_pay)
  const checkAmt = num(p.net_pay) + num(p.reimbursement_pay)
  const ytdCheck = num(yt.net_pay) + num(yt.reimbursement_pay)
  sumRow('Check Amount', checkAmt, ytdCheck, { bold: true })

  // ---- Footer ----
  set(7.5, 'normal', muted)
  doc.text('Generated by JobScout · This statement reflects the amounts recorded for this pay period.', M, doc.internal.pageSize.getHeight() - 24)

  return doc.output('blob')
}
