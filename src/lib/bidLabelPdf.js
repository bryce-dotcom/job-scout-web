// The label sheet for a sealed bid in the mail (SAL_SCOUT_PLAN.md §5.8):
// the buyer's address, the solicitation number, the envelope wording the
// notice demands, our return address, and the ship-by date.

import { jsPDF } from 'jspdf'
import { labelLines, shipByDate } from './bidSubmit'
import { pdfSafe } from './bidPacketPdf'

export function generateBidLabelPdf({ opportunity, intake, company, requirements, dueAt }) {
  const l = labelLines({ opportunity, intake, company, requirements })
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth(), m = 20, w = pw - m * 2
  let y = m
  const box = (title, lines, big = false) => {
    const h = 14 + lines.length * (big ? 8 : 6)
    doc.setDrawColor(44, 53, 48); doc.setLineWidth(0.5); doc.rect(m, y, w, h)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(125, 138, 127); doc.text(title.toUpperCase(), m + 4, y + 6)
    doc.setFont('helvetica', big ? 'bold' : 'normal'); doc.setFontSize(big ? 14 : 11); doc.setTextColor(44, 53, 48)
    lines.forEach((t, i) => doc.text(pdfSafe(t), m + 4, y + 13 + i * (big ? 8 : 6)))
    y += h + 8
  }
  box('Ship to', l.to.length ? l.to : ['(address not in the notice — read the package)'])
  box('Mark the envelope', [l.notice, ...(l.number ? [`Solicitation ${l.number}`] : []), ...(l.title ? [l.title] : [])], true)
  box('From', l.from.length ? l.from : ['(company address not set — Settings → Company Profile)'])
  const due = dueAt || opportunity?.due_at || intake?.due_at
  const ship = due ? shipByDate(due) : null
  const info = [
    due ? `Due: ${new Date(due).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Due: not in the notice',
    ship ? `Ship by: ${ship.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} (two business days before)` : '',
    (requirements?.copies || opportunity?.requirements?.copies) ? `Copies: ${requirements?.copies || opportunity?.requirements?.copies}` : '',
    'Record the tracking number on the bid page once it ships.',
  ].filter(Boolean)
  box('Shipping', info)
  return doc
}
