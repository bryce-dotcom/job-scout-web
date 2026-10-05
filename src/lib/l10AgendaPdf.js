// The printed L10 itinerary — one page you can put in front of six people.
//
// Everything on it comes from buildL10Agenda (src/lib/l10Agenda.js); this file
// only draws. Two deliberate choices about a document people write on:
//
//   • Where a number is not known, print the RULE and leave a rule-off line.
//     A paper L10 agenda is filled in as the owners read their numbers out, and
//     a blank beats a stale figure from whenever the PDF was made.
//   • Checkboxes against rocks and to-dos, because the review is binary —
//     done or not done, on track or off track. Nothing to write a sentence in.
//
// Pure: takes the agenda, returns a jsPDF document. Rendered headless in tests.

import { jsPDF } from 'jspdf'
// The goal wording is the email's too — one phrasing, so the printed copy and
// the emailed copy never disagree about what a metric has to hit.
import { goalText } from './l10AgendaEmail.js'

const PAGE = { w: 210, h: 297, m: 14 }
const GREY = [125, 138, 127]
const INK = [44, 53, 48]
const ACCENT = [90, 99, 73]
const RED = [239, 68, 68]
const AMBER = [234, 179, 8]
const GREEN = [34, 197, 94]

const statusColour = (s) => (s === 'off-track' ? RED : s === 'at-risk' ? AMBER : GREEN)
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * @param {object} agenda  from buildL10Agenda()
 * @param {object} [company]  the companies row, for the name in the header
 * @returns {jsPDF}
 */
export function generateL10AgendaPdf(agenda, company = null) {
  const doc = new jsPDF()
  let y = PAGE.m

  const line = (x1, yy, x2) => { doc.setDrawColor(214, 205, 184); doc.setLineWidth(0.2); doc.line(x1, yy, x2, yy) }
  const page = () => { doc.addPage(); y = PAGE.m }
  const room = (need) => { if (y + need > PAGE.h - PAGE.m) page() }
  const text = (s, x, size = 10, style = 'normal', colour = INK) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...colour)
    doc.text(String(s ?? ''), x, y)
  }
  // A long row wraps rather than running off the page; returns the height used.
  const wrapped = (s, x, width, size = 10, style = 'normal', colour = INK) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...colour)
    const lines = doc.splitTextToSize(String(s ?? ''), width)
    doc.text(lines, x, y)
    return lines.length * (size * 0.42)
  }
  const box = (x, yy, side = 3.4) => { doc.setDrawColor(...GREY); doc.setLineWidth(0.3); doc.rect(x, yy - side + 0.6, side, side) }
  const blank = (x, width) => { doc.setDrawColor(...GREY); doc.setLineWidth(0.2); doc.line(x, y + 0.8, x + width, y + 0.8) }

  // ── Header
  text(agenda.title, PAGE.m, 18, 'bold')
  text(`${agenda.minutes} min`, PAGE.w - PAGE.m - 16, 10, 'bold', ACCENT)
  y += 6
  text(agenda.when_label, PAGE.m, 11, 'normal', ACCENT)
  y += 5
  const sub = [company?.company_name, agenda.quarter, agenda.entity].filter(Boolean).join('  ·  ')
  text(sub, PAGE.m, 9, 'normal', GREY)
  y += 4
  line(PAGE.m, y, PAGE.w - PAGE.m)
  y += 6

  // ── Who is in the room
  if (agenda.attendees.length) {
    text('In the room', PAGE.m, 8, 'bold', GREY)
    y += 4.5
    for (const a of agenda.attendees) {
      room(6)
      box(PAGE.m, y)
      text(a.name, PAGE.m + 6, 9.5, 'bold')
      const w = doc.getTextWidth(a.name)
      text(`— ${a.why}`, PAGE.m + 8 + w, 8.5, 'normal', GREY)
      y += 5
    }
    y += 3
  }

  // ── The sections, in their fixed order with their fixed minutes
  for (const s of agenda.sections) {
    room(16)
    line(PAGE.m, y - 1, PAGE.w - PAGE.m)
    y += 5
    text(s.title, PAGE.m, 12, 'bold')
    text(`${s.minutes} min`, PAGE.w - PAGE.m - 12, 9, 'bold', ACCENT)
    y += 4.5
    if (s.note) { y += wrapped(s.note, PAGE.m, PAGE.w - PAGE.m * 2, 8.5, 'italic', GREY) + 2.5 }

    if (s.key === 'scorecard') {
      for (const r of s.rows || []) {
        room(7)
        text(r.metric, PAGE.m + 2, 9.5, 'normal')
        text(r.owner || 'unassigned', PAGE.m + 96, 9, 'normal', r.owner ? INK : RED)
        text(goalText(r), PAGE.m + 132, 8.5, 'normal', GREY)
        // The week's number: printed when the caller had it, a blank to fill
        // in when it did not.
        if (r.value == null) blank(PAGE.w - PAGE.m - 22, 20)
        else {
          const v = Math.abs(r.value) >= 1000 ? money(r.value) : String(Math.round(r.value * 100) / 100)
          text(v, PAGE.w - PAGE.m - 20, 9.5, 'bold', r.on_goal === false ? RED : r.on_goal ? GREEN : INK)
        }
        y += 5.6
      }
      if (!(s.rows || []).length) { text('No metrics on the scorecard yet.', PAGE.m + 2, 9, 'italic', RED); y += 5 }
    } else if (s.key === 'rocks') {
      for (const r of s.rows || []) {
        room(7)
        box(PAGE.m + 2, y)
        text(r.title, PAGE.m + 8, 9.5)
        text(r.owner || 'unassigned', PAGE.m + 110, 9, 'normal', r.owner ? INK : RED)
        text(r.status === 'done' ? 'done' : r.status.replace('-', ' '), PAGE.w - PAGE.m - 22, 8.5, 'bold', statusColour(r.status))
        y += 5.6
      }
      if (!(s.rows || []).length) { text(`No rocks set for ${agenda.quarter}.`, PAGE.m + 2, 9, 'italic', RED); y += 5 }
    } else if (s.key === 'todos') {
      for (const r of s.rows || []) {
        room(7)
        box(PAGE.m + 2, y)
        const h = wrapped(r.text, PAGE.m + 8, 100, 9.5)
        text(r.owner || 'unassigned', PAGE.m + 112, 9, 'normal', r.owner ? INK : RED)
        if (r.due) text(r.overdue ? `due ${r.due} — overdue` : `due ${r.due}`, PAGE.w - PAGE.m - 34, 8.5, r.overdue ? 'bold' : 'normal', r.overdue ? RED : GREY)
        y += Math.max(5.6, h + 1.5)
      }
      if (!(s.rows || []).length) { text('Nothing outstanding.', PAGE.m + 2, 9, 'italic', GREY); y += 5 }
    } else if (s.key === 'ids') {
      let i = 1
      for (const r of s.rows || []) {
        room(9)
        text(`${i++}.`, PAGE.m + 2, 9.5, 'bold', GREY)
        const h = wrapped(r.title, PAGE.m + 9, 118, 9.5, 'bold')
        text(r.priority, PAGE.m + 132, 8.5, 'normal', r.priority === 'high' ? RED : GREY)
        text(r.kind, PAGE.m + 152, 8.5, 'normal', GREY)
        y += Math.max(5.2, h + 1)
        // Room to write the solve. An IDS with nowhere to record the to-do is
        // how an issue gets discussed three weeks running.
        text('to-do:', PAGE.m + 9, 7.5, 'normal', GREY)
        blank(PAGE.m + 21, PAGE.w - PAGE.m * 2 - 21)
        y += 6
      }
      if (!(s.rows || []).length) { text('No open issues. Ask what nobody is saying.', PAGE.m + 2, 9, 'italic', GREY); y += 5 }
    } else if (s.key === 'headlines' || s.key === 'segue') {
      for (let k = 0; k < (s.key === 'segue' ? 2 : 2); k++) { room(7); blank(PAGE.m + 2, PAGE.w - PAGE.m * 2 - 4); y += 6 }
    } else {
      // Conclude: the three things, each with a line.
      for (const label of ['to-dos recapped', 'cascading message', 'rating (1-10)']) {
        room(7)
        text(label, PAGE.m + 2, 8.5, 'normal', GREY)
        blank(PAGE.m + 40, PAGE.w - PAGE.m * 2 - 42)
        y += 6
      }
    }
    y += 2
  }

  if (agenda.gaps?.length) {
    room(14)
    y += 2
    text('Worth fixing before next week', PAGE.m, 8, 'bold', RED)
    y += 4.5
    for (const g of agenda.gaps) { room(6); y += wrapped(`· ${g}`, PAGE.m + 2, PAGE.w - PAGE.m * 2 - 4, 8.5, 'normal', GREY) + 1.5 }
  }

  // Footer on every page: where the numbers came from, and the count.
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY)
    doc.text(agenda.numbers_included ? 'Scorecard numbers as of the last completed week.' : 'Scorecard numbers are filled in during the meeting.', PAGE.m, PAGE.h - 8)
    doc.text(`${p} / ${pages}`, PAGE.w - PAGE.m - 8, PAGE.h - 8)
  }
  return doc
}

export function l10AgendaFilename(agenda) {
  return `L10-${agenda.meeting_on || 'agenda'}.pdf`
}
