// A NACHA (ACH) file for one payroll run — PPD credits to each employee's
// account, for the admin to upload to their business bank's ACH service.
//
// Bryce: "we ran payroll for the first time and we don't know if ACH is going
// out or we got no option to choose how to pay so we wrote checks." JobScout
// does not move money and cannot originate ACH itself (that is an ODFI bank
// under NACHA rules, or a licensed provider — docs/ROADMAP.md #4). What it can
// do today is build the exact file the bank's ACH upload wants, so direct
// deposit is one upload instead of twenty-four checks.
//
// Everything here is the NACHA record layout, nothing else:
//   1  file header        who is sending, to which bank, when
//   5  batch header       the company, "PAYROLL", the effective date
//   6  entry detail       one per employee: routing, account, amount, name
//   6  offset (optional)  a debit to the company account so the batch nets
//                         to zero — some banks want it ("balanced"), most
//                         build it themselves ("unbalanced"). A setting.
//   8  batch control      counts, hash, totals for the batch
//   9  file control       counts, hash, totals for the file
//   then 9-filled lines so the file is a whole number of 10-record blocks
//
// Every record is exactly 94 characters. Amounts are whole cents. The entry
// hash is the sum of the first 8 digits of every receiving routing number,
// last 10 digits kept. Trace numbers are the ODFI's first 8 digits plus a
// 7-digit sequence. Pure: no fetch, no DOM.

const digits = (v) => String(v ?? '').replace(/\D/g, '')
const padL = (v, n, ch = '0') => String(v ?? '').slice(-n).padStart(n, ch)
const padR = (v, n, ch = ' ') => String(v ?? '').slice(0, n).padEnd(n, ch)
const upper = (s) => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').toUpperCase()

/** ABA routing check digit (mod 10, weights 3 7 1). True for a valid 9-digit number. */
export function isValidRouting(routing) {
  const r = digits(routing)
  if (r.length !== 9) return false
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  const sum = [...r].reduce((s, d, i) => s + Number(d) * w[i], 0)
  return sum % 10 === 0
}

/** Transaction code for a credit to the given account type. */
export function creditCode(accountType) {
  return /sav/i.test(String(accountType || '')) ? '32' : '22'
}

/** YYMMDD from a Date or a YYYY-MM-DD string, no timezone surprises. */
export function yymmdd(d) {
  if (!d) return ''
  if (typeof d === 'string') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? m[1].slice(2) + m[2] + m[3] : '' }
  return String(d.getFullYear()).slice(2) + padL(d.getMonth() + 1, 2) + padL(d.getDate(), 2)
}

/**
 * Turn the direct-deposit export (the CSV payroll-dd-export already
 * returns) into entries. Rows with no routing/account are the "pay by
 * check" people; they come back under `skipped` so the screen can say so.
 */
export function entriesFromDdCsv(csvText) {
  const lines = String(csvText || '').split(/\r?\n/).filter((l) => l.trim())
  const parse = (line) => {
    const out = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
      else if (c === '"') q = true
      else if (c === ',') { out.push(cur); cur = '' }
      else cur += c
    }
    out.push(cur); return out
  }
  const head = parse(lines[0] || []).map((h) => h.trim().toLowerCase())
  const col = (name) => head.findIndex((h) => h === name)
  const iName = col('employee'), iRt = col('routing number'), iAc = col('account number'), iTy = col('account type'), iAmt = col('net amount')
  const entries = [], skipped = []
  for (const line of lines.slice(1)) {
    const c = parse(line)
    const name = c[iName] || '', routing = digits(c[iRt]), account = String(c[iAc] || '').trim()
    const amountCents = Math.round((parseFloat(c[iAmt]) || 0) * 100)
    if (!routing || !account || amountCents <= 0) { skipped.push({ name, amountCents, reason: !amountCents ? 'nothing to pay' : 'no direct deposit on file' }); continue }
    if (!isValidRouting(routing)) { skipped.push({ name, amountCents, reason: `routing number ${routing} fails its check digit` }); continue }
    entries.push({ name, routing, account, accountType: c[iTy] || 'checking', amountCents })
  }
  return { entries, skipped }
}

/**
 * Build the file.
 *
 * settings — the company's ACH setup (what the bank gives you):
 *   odfiRouting       the bank's 9-digit routing (immediate destination)
 *   immediateOrigin   10 characters, usually "1" + EIN digits, unless the
 *                     bank assigns one
 *   companyId         10 characters, usually the same as immediateOrigin
 *   companyName       up to 16 characters as the bank knows the company
 *   destinationName   the bank's name (23 chars)
 *   balanced          true to add an offsetting debit to the company account
 *   offsetAccount, offsetAccountType   used only when balanced
 *   entryDescription  10 chars shown on the employee's statement, "PAYROLL"
 * effectiveDate — YYYY-MM-DD the money lands (the pay date)
 * entries — from entriesFromDdCsv
 * now, fileIdModifier — file creation stamp; the modifier distinguishes two
 *   files sent the same day ("A", then "B", ...)
 */
export function buildNachaFile({ settings = {}, effectiveDate, entries = [], now = new Date(), fileIdModifier = 'A' }) {
  const odfi = digits(settings.odfiRouting)
  if (!isValidRouting(odfi)) throw new Error('The bank routing number (ODFI) is missing or fails its check digit.')
  const origin = padL(digits(settings.immediateOrigin) || ('1' + digits(settings.ein)), 10)
  const companyId = padL(digits(settings.companyId) || origin, 10)
  if (origin.replace(/0/g, '') === '' || companyId.replace(/0/g, '') === '') throw new Error('The ACH company ID is missing. Set it in Payroll settings.')
  if (!entries.length) throw new Error('No employees with direct deposit on file for this run.')
  const eff = yymmdd(effectiveDate)
  if (eff.length !== 6) throw new Error('The effective date is missing.')
  const balanced = !!settings.balanced
  if (balanced && !String(settings.offsetAccount || '').trim()) throw new Error('A balanced file needs the company account number for the offset.')
  const desc = padR(upper(settings.entryDescription || 'PAYROLL'), 10)
  const compName = padR(upper(settings.companyName || 'COMPANY'), 16)
  const lines = []

  // 1 — file header
  lines.push(
    '1' + '01' + padR(' ' + odfi, 10) + padR(origin, 10) + yymmdd(now) + padL(now.getHours(), 2) + padL(now.getMinutes(), 2)
    + padR(String(fileIdModifier || 'A').slice(0, 1).toUpperCase(), 1) + '094' + '10' + '1'
    + padR(upper(settings.destinationName || 'BANK'), 23) + padR(upper(settings.companyName || 'COMPANY'), 23) + padR('', 8)
  )
  // 5 — batch header. 220 = credits only; 200 = mixed (credits plus the offset debit).
  const serviceClass = balanced ? '200' : '220'
  const batchNo = 1
  lines.push(
    '5' + serviceClass + compName + padR('', 20) + companyId + 'PPD' + desc + padR(yymmdd(effectiveDate), 6) + eff + padR('', 3) + '1' + odfi.slice(0, 8) + padL(batchNo, 7)
  )
  // 6 — one entry per employee
  let seq = 0, hash = 0, credits = 0, debits = 0
  const trace = () => odfi.slice(0, 8) + padL(++seq, 7)
  for (const e of entries) {
    const rt = digits(e.routing)
    hash += Number(rt.slice(0, 8))
    credits += e.amountCents
    lines.push(
      '6' + creditCode(e.accountType) + rt.slice(0, 8) + rt.slice(8, 9) + padR(String(e.account).replace(/[^A-Za-z0-9-]/g, ''), 17)
      + padL(e.amountCents, 10) + padR(String(e.id ?? ''), 15) + padR(upper(e.name), 22) + padR('', 2) + '0' + trace()
    )
  }
  // 6 — the offset debit, when the bank wants a balanced batch
  if (balanced) {
    const rt = odfi
    hash += Number(rt.slice(0, 8))
    debits += credits
    lines.push(
      '6' + (/sav/i.test(String(settings.offsetAccountType || '')) ? '37' : '27') + rt.slice(0, 8) + rt.slice(8, 9)
      + padR(String(settings.offsetAccount).replace(/[^A-Za-z0-9-]/g, ''), 17) + padL(credits, 10) + padR('', 15) + padR('OFFSET', 22) + padR('', 2) + '0' + trace()
    )
  }
  const entryCount = seq
  const hash10 = padL(hash, 10)
  // 8 — batch control
  lines.push(
    '8' + serviceClass + padL(entryCount, 6) + hash10 + padL(debits, 12) + padL(credits, 12) + companyId + padR('', 19) + padR('', 6) + odfi.slice(0, 8) + padL(batchNo, 7)
  )
  // 9 — file control, then pad to a multiple of 10 records
  const blocks = Math.ceil((lines.length + 1) / 10)
  lines.push(
    '9' + padL(1, 6) + padL(blocks, 6) + padL(entryCount, 8) + hash10 + padL(debits, 12) + padL(credits, 12) + padR('', 39)
  )
  while (lines.length % 10 !== 0) lines.push('9'.repeat(94))

  const bad = lines.find((l) => l.length !== 94)
  if (bad) throw new Error('Internal: a record is not 94 characters: ' + JSON.stringify(bad))
  return {
    text: lines.join('\r\n') + '\r\n',
    entryCount,
    totalCents: credits,
    blocks,
    effectiveDate: eff,
  }
}
