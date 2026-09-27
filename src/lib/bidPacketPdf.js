// The two pages we write ourselves for a bid packet: the transmittal (cover)
// letter and the qualification statement (SAL_SCOUT_PLAN.md §5.7). Same
// jsPDF, same ink as lib/bidPdf, so the packet reads as one document.

import { jsPDF } from 'jspdf'
import { fmtMoney } from './bidSchedule'

const INK = [44, 53, 48], MUTED = [125, 138, 127], ACCENT = [90, 99, 73], LINE = [214, 205, 184]

/** jsPDF's standard fonts are WinAnsi: a spec's ≥ or → would print as junk. */
export const pdfSafe = (s) => String(s ?? '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')

function header(doc, { company, businessUnit }, y) {
  const pw = doc.internal.pageSize.getWidth(), m = 18
  const name = businessUnit?.name || company?.company_name || company?.legal_name || 'Bidder'
  const address = businessUnit?.address || company?.address || ''
  // companies.address often carries the city already; do not print it twice.
  const cityLine = company?.city && !address.includes(company.city) ? [company.city, company.state, company.zip].filter(Boolean).join(', ') : null
  const lines = [address, cityLine, businessUnit?.phone || company?.phone, businessUnit?.email || company?.owner_email, company?.website].filter(Boolean)
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(name, m, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  lines.forEach((l, i) => doc.text(String(l), m, y + 10 + i * 4.2))
  const bottom = y + 10 + lines.length * 4.2 + 4
  doc.setDrawColor(...LINE); doc.line(m, bottom, pw - m, bottom)
  return bottom + 8
}

function paragraphs(doc, text, x, y, w, size = 10.5) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...INK)
  const ph = doc.internal.pageSize.getHeight()
  for (const para of String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = doc.splitTextToSize(para.replace(/\n/g, ' ').trim(), w)
    if (!lines.length) continue
    if (y + lines.length * 5 > ph - 20) { doc.addPage(); y = 18 }
    doc.text(lines, x, y); y += lines.length * 5 + 4
  }
  return y
}

/**
 * The cover letter as a PDF page.
 * @param {{ company, businessUnit?, opportunity?, intake?, coverLetter: string, total?: number, signer?: { name, title } }} args
 */
export function generateCoverLetterPdf({ company, businessUnit, opportunity, intake, coverLetter, total, signer }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const m = 18, pw = doc.internal.pageSize.getWidth(), w = pw - m * 2
  let y = header(doc, { company, businessUnit }, m)
  doc.setFontSize(10); doc.setTextColor(...INK); doc.text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), m, y); y += 8
  const to = [opportunity?.buyer || intake?.buyer, opportunity?.submit_to?.contact_name, opportunity?.submit_to?.address || intake?.submit_to].filter(Boolean)
  if (to.length) { doc.setFontSize(10); to.forEach((l) => { const ls = doc.splitTextToSize(pdfSafe(l), w); doc.text(ls, m, y); y += ls.length * 5 }); y += 3 }
  const re = [opportunity?.solicitation_number || intake?.bid_number, opportunity?.title || intake?.project || intake?.title].filter(Boolean).join(' — ')
  if (re) { doc.setFont('helvetica', 'bold'); const ls = doc.splitTextToSize(`Re: ${pdfSafe(re)}`, w); doc.text(ls, m, y); y += ls.length * 5 + 3 }
  y = paragraphs(doc, pdfSafe(coverLetter || ''), m, y, w)
  if (total != null) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(`Total bid: ${fmtMoney(total)}`, m, y); y += 8 }
  y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Respectfully submitted,', m, y); y += 16
  doc.setDrawColor(...INK); doc.line(m, y, m + 70, y); y += 5
  doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text([signer?.name, signer?.title, businessUnit?.name || company?.company_name].filter(Boolean).join(' · ') || 'Authorized signature', m, y)
  return doc
}

/**
 * The qualification statement: who we are, what we hold, what we have done.
 * @param {{ company, businessUnit?, profile?: { capability_statement, past_performance, key_personnel, licenses, bonding, federal }, certs?: Array<{label, present, expires}> }} args
 */
export function generateQualificationsPdf({ company, businessUnit, profile = {}, certs = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const m = 18, pw = doc.internal.pageSize.getWidth(), w = pw - m * 2
  let y = header(doc, { company, businessUnit }, m)
  const H = (t) => { if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18 } doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ACCENT); doc.text(t.toUpperCase(), m, y); y += 6 }
  const row = (k, v) => { if (!v) return; doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...MUTED); doc.text(k, m, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); const ls = doc.splitTextToSize(String(v), w - 48); doc.text(ls, m + 48, y); y += ls.length * 4.6 + 1.5 }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK); doc.text('Statement of Qualifications', m, y); y += 10

  H('The firm')
  row('Legal name', company?.legal_name || company?.company_name)
  row('Entity', [company?.entity_type || company?.business_type, company?.state_of_incorporation ? `organized in ${company.state_of_incorporation}` : null].filter(Boolean).join(', '))
  row('EIN', company?.ein)
  row('NAICS', company?.naics_code)
  row('UEI / CAGE', [profile?.federal?.uei, profile?.federal?.cage].filter(Boolean).join(' / '))
  row('License', company?.license_number)
  ;(profile?.licenses || []).forEach((l) => row(`${l.state || ''} license`, [l.type, l.number, l.limit ? `limit ${l.limit}` : null, l.expires ? `expires ${l.expires}` : null].filter(Boolean).join(' · ')))
  if (profile?.bonding?.single_limit || profile?.bonding?.aggregate_limit) row('Bonding', [profile.bonding.single_limit ? `single ${fmtMoney(profile.bonding.single_limit)}` : null, profile.bonding.aggregate_limit ? `aggregate ${fmtMoney(profile.bonding.aggregate_limit)}` : null, profile.bonding.surety_agent ? `surety: ${profile.bonding.surety_agent}` : null].filter(Boolean).join(' · '))
  row('Insurance', [company?.insurance_provider, company?.insurance_policy_number ? `policy ${company.insurance_policy_number}` : null, company?.insurance_expiration ? `through ${company.insurance_expiration}` : null].filter(Boolean).join(' · '))
  y += 3

  if (profile?.capability_statement) { H('Capability statement'); y = paragraphs(doc, profile.capability_statement, m, y, w, 10); y += 2 }

  const pp = profile?.past_performance || []
  if (pp.length) {
    H('Past performance')
    for (const p of pp) {
      const line = [p.project || p.title, p.customer || p.buyer, p.value != null ? fmtMoney(p.value) : null, p.year || p.completed, p.contact ? `ref: ${p.contact}` : null].filter(Boolean).join(' · ')
      const ls = doc.splitTextToSize(`• ${line}`, w); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(ls, m, y); y += ls.length * 4.8 + 1
      if (p.description) { const d = doc.splitTextToSize(String(p.description), w - 6); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(d, m + 6, y); y += d.length * 4.2 + 2 }
      if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18 }
    }
    y += 2
  }

  const kp = profile?.key_personnel || []
  if (kp.length) { H('Key personnel'); for (const k of kp) row(k.name || '', [k.title || k.role, k.years ? `${k.years} yrs` : null, k.licenses].filter(Boolean).join(' · ')); y += 2 }

  if (certs.length) {
    H('Certificates on file')
    for (const c of certs) row(c.label, c.present ? (c.expires ? `on file, expires ${c.expires}` : 'on file') : 'not on file')
  }
  return doc
}
