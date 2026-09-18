// Employee earnings statement (paystub) as a PDF.
//
// Alayda: "our paystubs suck compared to Gusto" (feedback bfb724e9) — she
// sent a Gusto stub as the bar. Then Bryce, looking at Mike Thompson's:
// "the dates were wrong and it gave no details… it should show the bonus and
// hours worked… even though he is 1099, bonus is motivating… put the logos on
// the stubs, make them pop, nobody ever prints them so make them cool."
//
// So this is one statement for everyone, built on the company's own colour
// and logo. A contractor gets the same itemised earnings — hours, bonus,
// commission — and simply no tax tables, instead of the bare "Amount"
// line that told Mike nothing. The bonus is the one number a tech looks for,
// so it has its own tile up top, with the year's total beside it.
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

// ── Brand colour ──────────────────────────────────────────────────────
// The company's primary_color when it has one; JobScout's olive otherwise.
const DEFAULT_BRAND = [90, 99, 73]
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
// Blend toward white: t=0 is the colour, t=1 is white.
const tint = (rgb, t) => rgb.map(c => Math.round(c + (255 - c) * t))
// Blend toward black, for text that has to sit on a light tint of the brand.
const shade = (rgb, t) => rgb.map(c => Math.round(c * (1 - t)))

// ── Logo ──────────────────────────────────────────────────────────────
// Fetched once per statement and flattened onto the band colour first.
// jsPDF only reads plain PNG/JPEG: HHH's "logo-white.png" is really a WebP,
// and a transparent PNG comes out on a black box. Drawing it through a
// canvas filled with the brand colour hands jsPDF an opaque PNG every time —
// the browser decodes whatever the file is, and in Node @napi-rs/canvas does
// the same for tests. Anything that fails — no URL, CORS, a bad file — comes
// back null and the band shows the company name instead, so a logo problem
// can never stop a paystub.
const LOGO_MAX_PX = 600
async function loadLogoDataUrl(url, brandRgb) {
  if (!url) return null
  const bg = `rgb(${brandRgb.join(',')})`
  try {
    if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
      const s = Math.min(1, LOGO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * s))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * s))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.92)
    }
    // Node (tests, scripts): same flattening through a native canvas when it
    // is installed. The module name goes through a variable so Vite does not
    // try to bundle it for the browser.
    const res = await fetch(url)
    if (!res.ok) return null
    // No bare Buffer: this file ships to the browser too, and the ship guard
    // treats a Node global as an undefined reference there.
    const B = globalThis.Buffer
    const bytes = new Uint8Array(await res.arrayBuffer())
    const buf = B ? B.from(bytes) : bytes
    try {
      const name = '@napi-rs/canvas'
      const { createCanvas, loadImage } = await import(/* @vite-ignore */ name)
      const img = await loadImage(buf)
      const s = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height))
      const canvas = createCanvas(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.92)
    } catch {
      if (!B) return null
      return `data:${res.headers.get('content-type') || 'image/png'};base64,${B.from(bytes).toString('base64')}`
    }
  } catch { return null }
}

export async function generatePaystubPdf({ paystub, employee, company, ytd }) {
  const mod = await import('jspdf')
  // Pick whichever export is actually the constructor: browser (Vite) exposes
  // it as .default, Node exposes .default as an object and .jsPDF as the fn.
  const jsPDF = [mod.jsPDF, mod.default, mod.default && mod.default.jsPDF].find((x) => typeof x === 'function')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 40
  const RIGHT = PW - M
  const CW = PW - M * 2

  const p = paystub || {}
  const e = employee || {}
  const c = company || {}
  const yt = ytd || {}
  const rate = num(p.hourly_rate)
  const brand = hexToRgb(c.primary_color) || DEFAULT_BRAND
  const ink = [40, 44, 46]
  const muted = [125, 130, 128]
  const line = tint(brand, 0.72)
  const white = [255, 255, 255]

  // Source of truth is is_salary / is_hourly — the same flags Payroll.jsx
  // computes pay from. `pay_type` is a legacy column that reads ["hourly"] for
  // EVERY employee including salaried ones, so trusting it rendered a $0.00
  // "Regular" line instead of Salary for the 5 salaried staff. Fall back to
  // pay_type only when the flags are absent.
  const isSalary = e.is_salary === true
    || (e.is_salary == null && e.is_hourly == null
        && (Array.isArray(e.pay_type) ? e.pay_type.includes('salary') : /salary/i.test(String(e.pay_type || ''))))
  const isContractor = /1099|contractor/i.test(String(e.tax_classification || ''))

  const fmtDate = (s) => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const set = (size, style = 'normal', color = ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color) }
  const rule = (yy, x1 = M, x2 = RIGHT, col = line) => { doc.setDrawColor(...col); doc.setLineWidth(0.6); doc.line(x1, yy, x2, yy) }
  const fill = (rgb) => doc.setFillColor(...rgb)

  // ── The figures every tile and row reads ──────────────────────────────
  const regularPay = num(p.regular_hours) * rate
  const overtimePay = num(p.overtime_hours) * rate * 1.5
  const ptoPay = num(p.pto_hours) * rate
  const totalHours = num(p.regular_hours) + num(p.overtime_hours) + num(p.pto_hours)
  const bonus = num(p.bonus_pay)
  const reimb = num(p.reimbursement_pay)
  const takeHome = num(p.net_pay) + reimb

  // ── Band: brand colour, logo, the one number that matters ─────────────
  const BAND = 96
  fill(brand); doc.rect(0, 0, PW, BAND, 'F')
  // A thin lighter stripe under the band, so it reads as designed, not just filled.
  fill(tint(brand, 0.55)); doc.rect(0, BAND, PW, 3, 'F')

  let logoDrawn = false
  const logo = await loadLogoDataUrl(c.logo_url, brand)
  if (logo) {
    try {
      const props = doc.getImageProperties(logo)
      const maxW = 170, maxH = 44
      const s = Math.min(maxW / props.width, maxH / props.height, 1e9)
      const w = props.width * s, h = props.height * s
      doc.addImage(logo, props.fileType || 'PNG', M, (BAND - h) / 2, w, h)
      logoDrawn = true
    } catch { logoDrawn = false }
  }
  if (!logoDrawn) {
    // No usable logo: a badge with the company's initial, then its name.
    const name = String(c.company_name || c.legal_name || 'Company')
    fill(white); doc.circle(M + 18, BAND / 2, 18, 'F')
    set(16, 'bold', brand); doc.text(name.charAt(0).toUpperCase(), M + 18, BAND / 2 + 6, { align: 'center' })
    set(15, 'bold', white); doc.text(name, M + 46, BAND / 2 + 5)
  }

  set(8, 'bold', tint(brand, 0.82))
  doc.text(isContractor ? 'CONTRACTOR PAYMENT' : 'EARNINGS STATEMENT', RIGHT, 30, { align: 'right' })
  set(9, 'normal', tint(brand, 0.9))
  doc.text('Pay date ' + fmtDate(p.pay_date), RIGHT, 44, { align: 'right' })
  set(7.5, 'bold', tint(brand, 0.82))
  doc.text(isContractor ? 'PAYMENT' : 'TAKE-HOME', RIGHT, 62, { align: 'right' })
  set(22, 'bold', white)
  doc.text(money(takeHome), RIGHT, 84, { align: 'right' })

  // ── Identity: company (left) + person (right) + period ────────────────
  let y = BAND + 3 + 22
  const colR = M + 300
  set(10, 'bold'); doc.text(String(c.company_name || c.legal_name || 'Company'), M, y)
  const who = isContractor ? (e.w9_business_name || e.w9_legal_name || e.name || 'Contractor') : (e.name || 'Employee')
  doc.text(String(who), colR, y)
  set(8.5, 'normal', muted)
  const coLines = [c.address, [c.city, c.state].filter(Boolean).join(', ') + (c.zip ? ' ' + c.zip : ''), c.ein ? 'EIN ' + c.ein : null, c.phone].filter(x => x && String(x).trim())
  const empLines = [
    isContractor ? ((e.w9_legal_name && e.w9_business_name) ? e.w9_legal_name : null) : (e.ssn_last4 ? 'SSN •••-••-' + e.ssn_last4 : null),
    e.role,
    e.home_address,
    [e.home_city, e.home_state].filter(Boolean).join(', ') + (e.home_zip ? ' ' + e.home_zip : ''),
  ].filter(x => x && String(x).trim())
  let yl = y + 12
  for (let i = 0; i < Math.max(coLines.length, empLines.length); i++) {
    if (coLines[i]) doc.text(String(coLines[i]), M, yl)
    if (empLines[i]) doc.text(String(empLines[i]), colR, yl)
    yl += 11.5
  }
  y = yl + 4
  set(9, 'normal', ink)
  doc.text(`${isContractor ? 'Service period' : 'Pay period'}: ${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}`, M, y)
  y += 16

  // ── Tiles: hours, bonus, gross, take-home ─────────────────────────────
  // The bonus tile is the loud one on purpose — it is the number a tech
  // looks for, and the year's total beside it is what keeps it worth chasing.
  const tileGap = 10, tileH = 58
  const tileW = (CW - tileGap * 3) / 4
  const tiles = [
    { label: isSalary ? 'HOURS' : 'HOURS WORKED', value: isSalary && totalHours === 0 ? 'Salary' : hrs(totalHours), sub: num(p.overtime_hours) > 0 ? `${hrs(p.overtime_hours)} overtime` : (num(p.pto_hours) > 0 ? `${hrs(p.pto_hours)} PTO` : (isSalary && totalHours === 0 ? 'paid by the period' : `${hrs(yt.regular_hours + yt.overtime_hours + yt.pto_hours)} this year`)) },
    { label: 'BONUS', value: money(bonus), sub: bonus > 0 ? `${money(yt.bonus_pay)} this year` : (num(yt.bonus_pay) > 0 ? `${money(yt.bonus_pay)} this year` : 'finish under allotted hours'), loud: bonus > 0 },
    { label: 'GROSS', value: money(p.gross_pay), sub: `${money(yt.gross_pay)} this year` },
    { label: isContractor ? 'PAYMENT' : 'TAKE-HOME', value: money(takeHome), sub: `${money(num(yt.net_pay) + num(yt.reimbursement_pay))} this year` },
  ]
  tiles.forEach((t, i) => {
    const x = M + i * (tileW + tileGap)
    fill(t.loud ? tint(brand, 0.78) : tint(brand, 0.93))
    doc.setDrawColor(...(t.loud ? tint(brand, 0.4) : line)); doc.setLineWidth(0.6)
    doc.roundedRect(x, y, tileW, tileH, 6, 6, 'FD')
    set(7, 'bold', t.loud ? shade(brand, 0.25) : muted); doc.text(t.label, x + 10, y + 15)
    set(15, 'bold', t.loud ? shade(brand, 0.35) : ink); doc.text(String(t.value), x + 10, y + 36)
    set(7.5, 'normal', t.loud ? shade(brand, 0.15) : muted); doc.text(String(t.sub), x + 10, y + 49)
  })
  y += tileH + 20

  // ── Earnings table ────────────────────────────────────────────────────
  // No rate column. Bryce: "don't put their rates on the check stubs" — a
  // stub travels (landlords, lenders, other techs) and the rate is between
  // the company and the person. Hours and dollars say everything needed.
  const cols = { desc: M, hours: M + 300, cur: M + 410, ytd: RIGHT }
  const headRow = (label) => {
    set(8, 'bold', muted)
    doc.text(label, cols.desc, y)
    doc.text('Hours', cols.hours, y, { align: 'right' })
    doc.text('Current', cols.cur, y, { align: 'right' })
    doc.text('YTD', cols.ytd, y, { align: 'right' })
    y += 4; rule(y); y += 12
  }
  const earnRow = (label, { hours: h, cur, ytdv, bold, highlight } = {}) => {
    if (highlight) { fill(tint(brand, 0.9)); doc.rect(M - 4, y - 9.5, CW + 8, 14, 'F') }
    set(9, bold ? 'bold' : 'normal', ink)
    doc.text(String(label), cols.desc, y)
    if (h != null) doc.text(hrs(h), cols.hours, y, { align: 'right' })
    doc.text(money(cur), cols.cur, y, { align: 'right' })
    doc.text(money(ytdv), cols.ytd, y, { align: 'right' })
    y += 13
  }

  headRow('EARNINGS')
  let itemised = 0
  if (isSalary && num(p.salary_amount) > 0) {
    earnRow('Salary' + (e.role ? ` — ${e.role}` : ''), { cur: p.salary_amount, ytdv: yt.salary_amount })
    itemised += num(p.salary_amount)
  } else if (regularPay > 0 || num(p.regular_hours) > 0 || (!isSalary && bonus === 0 && num(p.commission_pay) === 0)) {
    earnRow('Regular' + (e.role ? ` — ${e.role}` : ''), { hours: p.regular_hours, cur: regularPay, ytdv: yt.regular_pay })
    itemised += regularPay
    if (num(p.overtime_hours) > 0) { earnRow('Overtime', { hours: p.overtime_hours, cur: overtimePay, ytdv: yt.overtime_pay }); itemised += overtimePay }
  }
  if (num(p.pto_hours) > 0) {
    // Hourly: paid at the rate. Salary: recorded, already in the salary.
    earnRow('Paid Time Off' + (isSalary ? ' (in salary)' : ''), { hours: p.pto_hours, cur: isSalary ? 0 : ptoPay, ytdv: isSalary ? 0 : yt.pto_pay })
    if (!isSalary) itemised += ptoPay
  }
  if (bonus > 0) { earnRow('Efficiency bonus', { cur: bonus, ytdv: yt.bonus_pay, highlight: true, bold: true }); itemised += bonus }
  if (num(p.commission_pay) > 0) { earnRow('Commission', { cur: p.commission_pay, ytdv: yt.commission_pay }); itemised += num(p.commission_pay) }
  // Never let Gross Earnings exceed what's itemised above it — a stub whose
  // lines don't add up to the total is worse than no stub. Anything not
  // attributable to a known line shows as Other earnings.
  const unaccounted = Math.round((num(p.gross_pay) - itemised) * 100) / 100
  if (unaccounted > 0.01) {
    earnRow('Other earnings', { cur: unaccounted, ytdv: Math.max(0, num(yt.gross_pay) - (num(yt.salary_amount) + num(yt.regular_pay) + num(yt.overtime_pay) + num(yt.pto_pay) + num(yt.bonus_pay) + num(yt.commission_pay))) })
  }
  y += 2; rule(y); y += 12
  earnRow('Gross Earnings', { hours: totalHours || null, cur: p.gross_pay, ytdv: yt.gross_pay, bold: true })
  y += 10

  if (isContractor) {
    // ── Contractor: no tax tables. Say so, then the payment. ─────────────
    fill(tint(brand, 0.93)); doc.setDrawColor(...line); doc.setLineWidth(0.6)
    doc.roundedRect(M, y, CW, 34, 6, 6, 'FD')
    set(8.5, 'bold', ink); doc.text('1099 contractor — no taxes withheld', M + 12, y + 14)
    set(8, 'normal', muted); doc.text('You handle your own income and self-employment tax at filing. A 1099-NEC is issued at year end when payments reach $600.', M + 12, y + 26)
    y += 34 + 16
    const sumRow = (label, cur, ytdv, opts = {}) => {
      set(9, opts.bold ? 'bold' : 'normal', opts.color || ink)
      doc.text(String(label), cols.desc, y)
      doc.text(money(cur), cols.cur, y, { align: 'right' })
      doc.text(money(ytdv), cols.ytd, y, { align: 'right' })
      y += 13.5
    }
    set(8, 'bold', muted); doc.text('PAYMENT', cols.desc, y); doc.text('Current', cols.cur, y, { align: 'right' }); doc.text('YTD', cols.ytd, y, { align: 'right' })
    y += 4; rule(y); y += 12
    sumRow('Earnings', p.gross_pay, yt.gross_pay)
    if (reimb > 0 || num(yt.reimbursement_pay) > 0) sumRow('Reimbursements', reimb, yt.reimbursement_pay)
    y += 2; rule(y); y += 12
    sumRow('Total payment', takeHome, num(yt.gross_pay) + num(yt.reimbursement_pay), { bold: true, color: shade(brand, 0.2) })
  } else {
    // ── Two-column tax tables: employee (left) | employer (right) ───────
    const boxTop = y
    const lx = M, rx = M + 270
    let ty = boxTop
    const taxRow = (x, label, cur, ytdv) => {
      set(8.5, 'normal', ink)
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
    taxHead(lx, 'TAXES WITHHELD'); taxHead(rx, 'PAID BY ' + String(c.company_name || 'EMPLOYER').toUpperCase())
    ty += 4; rule(ty, lx, lx + 250); rule(ty, rx, rx + 250); ty += 12
    const tyStart = ty
    taxRow(lx, 'Federal income tax', p.federal_income_tax, yt.federal_income_tax)
    taxRow(lx, 'Social Security', p.social_security_employee, yt.social_security_employee)
    taxRow(lx, 'Medicare', p.medicare_employee, yt.medicare_employee)
    if (num(p.additional_medicare) > 0) taxRow(lx, 'Add’l Medicare', p.additional_medicare, yt.additional_medicare)
    taxRow(lx, 'State income tax', p.state_income_tax, yt.state_income_tax)
    const empEnd = ty
    ty = tyStart
    taxRow(rx, 'Social Security', p.social_security_employer, yt.social_security_employer)
    taxRow(rx, 'Medicare', p.medicare_employer, yt.medicare_employer)
    taxRow(rx, 'FUTA', p.futa, yt.futa)
    taxRow(rx, 'State unemployment', p.sui, yt.sui)
    y = Math.max(empEnd, ty) + 6
    rule(y); y += 16

    // ── Summary ─────────────────────────────────────────────────────────
    const sumRow = (label, cur, ytdv, opts = {}) => {
      set(9, opts.bold ? 'bold' : 'normal', opts.color || ink)
      doc.text(String(label), cols.desc, y)
      doc.text((opts.neg ? '- ' : '') + money(Math.abs(num(cur))), cols.cur, y, { align: 'right' })
      doc.text((opts.neg ? '- ' : '') + money(Math.abs(num(ytdv))), cols.ytd, y, { align: 'right' })
      y += 13.5
    }
    set(8, 'bold', muted)
    doc.text('SUMMARY', cols.desc, y)
    doc.text('Current', cols.cur, y, { align: 'right' })
    doc.text('YTD', cols.ytd, y, { align: 'right' })
    y += 4; rule(y); y += 12
    const totalTax = num(p.federal_income_tax) + num(p.state_income_tax) + num(p.social_security_employee) + num(p.medicare_employee) + num(p.additional_medicare)
    const ytdTax = num(yt.federal_income_tax) + num(yt.state_income_tax) + num(yt.social_security_employee) + num(yt.medicare_employee) + num(yt.additional_medicare)
    sumRow('Gross earnings', p.gross_pay, yt.gross_pay)
    if (num(p.pre_tax_deductions) > 0 || num(yt.pre_tax_deductions) > 0) sumRow('Pre-tax deductions', p.pre_tax_deductions, yt.pre_tax_deductions, { neg: true, color: [180, 60, 40] })
    sumRow('Taxes', totalTax, ytdTax, { neg: true, color: [180, 60, 40] })
    if (num(p.post_tax_deductions) > 0 || num(yt.post_tax_deductions) > 0) sumRow('Post-tax deductions', p.post_tax_deductions, yt.post_tax_deductions, { neg: true, color: [180, 60, 40] })
    y += 2; rule(y); y += 12
    sumRow('Net pay', p.net_pay, yt.net_pay, { bold: true, color: shade(brand, 0.2) })
    if (reimb > 0 || num(yt.reimbursement_pay) > 0) sumRow('Reimbursements', reimb, yt.reimbursement_pay)
    sumRow('Check amount', takeHome, num(yt.net_pay) + num(yt.reimbursement_pay), { bold: true })
  }

  // ── Footer ────────────────────────────────────────────────────────────
  fill(brand); doc.rect(0, PH - 14, PW, 14, 'F')
  set(7.5, 'normal', muted)
  doc.text(isContractor
    ? '1099 contractor payment — no taxes withheld. Generated by JobScout.'
    : 'Generated by JobScout · This statement reflects the amounts recorded for this pay period.', M, PH - 24)

  return doc.output('blob')
}
