// The crew sheet, printed — what a crew lead takes into the day (Bryce,
// 2026-10-26: London was having Grok build this from JobScout exports).
//
// Drawn from the sheet the crew-sheet function returns (supabase/functions/
// _shared/crewSheet.ts): each job's who / where / when, how long it should take
// from crews' CLOCKED hours beside the plan, ladder or lift, what to confirm
// before rolling, every line with its area and the parts inside it, then one
// pull list for the trailer. No prices — it is instructions, like the work
// order (workOrderPdf.js), whose look it follows.
//
// Pure: a sheet in, a jsPDF document out. Rendered headless in tests.

import { jsPDF } from 'jspdf'

// The PDF's built-in fonts cannot draw → ≈ ≥ ≤ × or curly quotes: jsPDF writes
// the whole string out encoded and it prints as garbage. Plain stand-ins.
export const pdfSafe = (s) => String(s ?? '')
  .replace(/→/g, '->').replace(/≈/g, '~').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/×/g, 'x')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/[^\x00-\xFF–—•·]/g, '')

const when = (iso, tz, opts) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { timeZone: tz, ...opts })
}
const day = (iso, tz) => when(iso, tz, { weekday: 'short', month: 'short', day: 'numeric' })
const time = (iso, tz) => when(iso, tz, { hour: 'numeric', minute: '2-digit' })
const range = (s) => {
  const f = new Date(`${s.from}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (s.from === s.to) return f
  const t = new Date(`${s.to}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
  return `${f} – ${t}`
}

/** Plain words for a labor estimate, the same on the page and the paper. */
export function laborWords(l) {
  if (!l) return null
  const est = `${l.crewHours.median} crew-hrs (most similar jobs: ${l.crewHours.low}–${l.crewHours.high}) ≈ ${l.onSiteHours.median} h on site with ${l.crewSize}, about ${l.days} day${l.days === 1 ? '' : 's'}`
  const plan = l.planned ? `Planned: ${l.planned.hours} h × ${l.crewSize} = ${l.planned.crewHours} crew-hrs (${l.planned.perFixture} a fixture).` : ''
  const far = l.planned && l.planned.crewHours < l.crewHours.low * 0.8 ? ' The plan is well under what past jobs took.' : ''
  return { est, plan: plan + far, basis: `${l.fixtures} fixtures · ${l.basis}${l.allotted ? ` · JobScout allotted ${l.allotted} crew-hrs` : ''}` }
}

export function reachWords(r) {
  if (!r) return ''
  const bits = []
  if (r.boom) bits.push(`BOOM LIFT for ${r.boom}`)
  if (r.scissor) bits.push(`SCISSOR LIFT for ${r.scissor}`)
  if (r.ladder) bits.push(`ladder for ${r.ladder}`)
  return bits.length ? `${bits.join(' · ')}${r.maxHeight ? ` (highest ${r.maxHeight} ft)` : ''}` : ''
}

/**
 * @param {object} sheet  what the crew-sheet function returns
 * @param {object} [o]
 * @param {string} [o.company]  the name for the header
 */
export function generateCrewSheetPdf(sheet, { company = '' } = {}) {
  const doc = new jsPDF()
  const tz = sheet?.tz || 'America/Denver'
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const right = pageW - margin
  const W = pageW - margin * 2
  let y = 18

  const ensure = (need) => { if (y + need > pageH - 16) { doc.addPage(); y = 18 } }
  const text = (s, x, opts = {}) => doc.text(pdfSafe(s), x, y, opts)
  const para = (s, x, width, lineH = 4.4) => {
    const ls = doc.splitTextToSize(pdfSafe(s), width)
    for (const l of ls) { ensure(lineH + 2); doc.text(l, x, y); y += lineH }
  }
  const label = (s, x = margin) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(110); text(s, x); doc.setTextColor(0) }
  const box = (lines, fill, stroke, ink) => {
    const ls = lines.flatMap((s) => doc.splitTextToSize(pdfSafe(s), W - 6))
    const h = ls.length * 4.4 + 3
    ensure(h + 2)
    doc.setFillColor(...fill); doc.setDrawColor(...stroke); doc.rect(margin, y - 3.4, W, h, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink)
    ls.forEach((l, i) => doc.text(l, margin + 3, y + i * 4.4))
    y += h + 1.5; doc.setTextColor(0)
  }

  // ── Header ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); text('CREW SHEET', margin)
  doc.setFontSize(11); text(company, right, { align: 'right' }); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60)
  text(`${range(sheet)}  ·  ${sheet.jobs.length} job${sheet.jobs.length === 1 ? '' : 's'}${sheet.scope === 'mine' ? '  ·  your jobs' : ''}`, margin); y += 4.5
  doc.setFontSize(8); doc.setTextColor(120)
  para(`Reach: ladder up to ${sheet.reach?.ladderMaxFt ?? 12} ft, scissor lift to ${sheet.reach?.scissorMaxFt ?? 26} ft, boom above — or a lift wherever the bid carries lift hours. Labor is from hours crews actually clocked on past jobs. No prices on this sheet.`, margin, W, 3.8)
  y += 1; doc.setDrawColor(190); doc.line(margin, y, right, y); y += 7; doc.setTextColor(0)

  if (!sheet.jobs.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(110)
    text('Nothing on the schedule for these days.', margin); y += 8; doc.setTextColor(0)
  }

  // ── Each job ───────────────────────────────────────────────────────────
  for (const j of sheet.jobs) {
    ensure(40)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0)
    para(j.title || 'Job', margin, W - 40, 5.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
    text(`${j.job_id || ''}${j.status ? `  ·  ${j.status}` : ''}`, margin); y += 6; doc.setTextColor(0)

    const colW = W / 3, top = y, ends = []
    y = top; label('WHEN & WHO')
    y += 4.4; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    para(`${day(j.start, tz)} ${time(j.start, tz)}${j.end ? `–${time(j.end, tz)}` : ''}`, margin, colW - 4)
    para(j.crew.length ? j.crew.join(', ') : 'No crew assigned', margin, colW - 4)
    if (j.lead) para(`Lead: ${j.lead}`, margin, colW - 4)
    ends.push(y)
    y = top; label('SITE', margin + colW)
    y += 4.4; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    para(j.customer || '', margin + colW, colW - 4); para(j.address || '—', margin + colW, colW - 4)
    ends.push(y)
    y = top; label('ON-SITE CONTACT', margin + colW * 2)
    y += 4.4; doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const s of [j.contact?.name, j.contact?.phone, j.contact?.email].filter(Boolean)) para(s, margin + colW * 2, colW - 2)
    if (j.sales) para(`Sold by ${j.sales}`, margin + colW * 2, colW - 2)
    ends.push(y)
    y = Math.max(...ends) + 2

    const lw = laborWords(j.labor)
    if (lw) box([`HOW LONG: ${lw.est}`, lw.plan, lw.basis].filter(Boolean), [236, 244, 236], [170, 200, 170], [30, 60, 30])
    const rw = reachWords(j.reach)
    if (rw) box([`LADDER OR LIFT: ${rw}`], [240, 240, 248], [190, 190, 215], [40, 40, 80])
    if (j.flags?.length) box(['CONFIRM BEFORE ROLLING:', ...j.flags.map((f) => `•  ${f}`)], [255, 247, 214], [230, 200, 90], [90, 60, 0])
    if (j.pos?.length) { doc.setFontSize(8.5); doc.setTextColor(90); para(`Parts: ${j.pos.map((p) => `${p.po_number} (${p.status || 'open'})`).join(', ')}`, margin, W); doc.setTextColor(0) }

    // Lines
    y += 2; ensure(14)
    const xQ = margin, xP = margin + 12, xR = right - 26
    const head = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(110)
      text('QTY', xQ); text('WHAT · WHERE · PARTS', xP); text('REACH', xR); y += 2
      doc.setDrawColor(200); doc.line(margin, y, right, y); y += 4.5; doc.setTextColor(0)
    }
    head()
    for (const l of j.lines) {
      const where = l.note ? doc.splitTextToSize(pdfSafe(l.note), xR - xP - 4) : []
      const parts = l.parts?.length ? doc.splitTextToSize(pdfSafe(`Parts: ${l.parts.map((p) => p.order_code ? `${p.name} [${p.order_code}]` : p.name).join(' + ')}`), xR - xP - 4) : []
      const need = 5 + where.length * 4.2 + parts.length * 3.8
      if (y + need > pageH - 16) { doc.addPage(); y = 18; head() }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); text(String(l.qty), xQ)
      para(l.product, xP, xR - xP - 4, 4.4)
      doc.setFont('helvetica', 'normal')
      if (l.reach) { doc.setFontSize(8.5); const yy = y; y -= 4.4; text(l.reach === 'ladder' ? 'ladder' : l.reach.toUpperCase(), xR); y = yy }
      doc.setFontSize(8.5); doc.setTextColor(60)
      for (const s of where) { doc.text(s, xP, y); y += 4.2 }
      doc.setFontSize(7.5); doc.setTextColor(120)
      for (const s of parts) { doc.text(s, xP, y); y += 3.8 }
      doc.setTextColor(0); y += 1.5
      doc.setDrawColor(235); doc.line(margin, y - 1, right, y - 1); y += 1.5
    }
    if (!j.lines.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(110); text('No line items on this job.', xP); y += 5; doc.setTextColor(0) }
    y += 6
  }

  // ── Pull list ──────────────────────────────────────────────────────────
  if (sheet.pull_list?.length) {
    ensure(24)
    doc.setDrawColor(190); doc.line(margin, y, right, y); y += 7
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); text('Pull list — load the trailer', margin); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
    text('Every part on these jobs: the fixtures and the sensors inside each bundle. Check off as it goes on.', margin); y += 6; doc.setTextColor(0)
    for (const p of sheet.pull_list) {
      ensure(7)
      doc.setDrawColor(140); doc.rect(margin, y - 3, 3.2, 3.2)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); text(String(p.qty), margin + 6)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      text(`${p.name}${p.order_code ? `   [${p.order_code}]` : ''}`, margin + 16)
      if (sheet.jobs.length > 1 && p.jobs?.length) { doc.setFontSize(7.5); doc.setTextColor(120); text(p.jobs.join(', ').slice(0, 60), right, { align: 'right' }); doc.setTextColor(0) }
      y += 5.5
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140)
    doc.text(pdfSafe(`${company ? company + '  ·  ' : ''}Crew sheet ${range(sheet)}  ·  Made by JobScout ${when(sheet.generated_at || new Date().toISOString(), tz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}  ·  Page ${p} of ${pages}`), pageW / 2, pageH - 7, { align: 'center' })
  }
  doc.setTextColor(0)
  return doc
}

export function crewSheetFilename(sheet) {
  return `Crew_Sheet_${sheet.from}${sheet.to !== sheet.from ? `_to_${sheet.to}` : ''}.pdf`
}
