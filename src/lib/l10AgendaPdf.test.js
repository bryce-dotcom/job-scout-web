// The printed copy and the emailed copy of the same itinerary. Both are
// documents people act on in a room, so the tests are about what reaches the
// paper: every owner, every status, the blanks where a number is not known, and
// nothing silently dropped off the page.
import { describe, it, expect } from 'vitest'
import { buildL10Agenda } from './l10Agenda.js'
import { generateL10AgendaPdf, l10AgendaFilename } from './l10AgendaPdf.js'
import { agendaHtml, agendaText, agendaSubject, goalText } from './l10AgendaEmail.js'

const textRuns = (doc) => [...doc.output().matchAll(/\(((?:\\\)|[^)])*)\) Tj/g)].map((m) => m[1].replace(/\\\)/g, ')').replace(/\\\(/g, '('))
const allText = (doc) => textRuns(doc).join('\n')

const NOW = new Date(2026, 9, 5, 9, 0)
const employees = [{ id: 14, name: 'Doug Webb', email: 'doug@hhh.services' }, { id: 15, name: 'Cole Westcott', email: 'cole@hhh.services' }]
const eos = {
  meetings: { l10_day: 'Monday', l10_time: '08:30' },
  scorecard: [
    { id: 'm1', metric: 'Job Revenue', owner_id: 14, goal: '80000', type: 'gte' },
    { id: 'm2', metric: 'Callbacks', owner_id: 14, goal: '2', type: 'lte' },
    { id: 'm3', metric: 'New Leads', owner_id: 15, goal: '', type: 'gte' },
  ],
  rocks: [{ id: 'r1', title: 'Fix the job board', owner_id: 15, quarter: 4, year: 2026, status: 'off-track' }],
  issues: [{ id: 'i1', title: 'Transaction approval over 2k', priority: 'high', type: 'short', resolved: false, created_at: '2026-09-10T00:00:00Z' }],
  todos: [{ id: 't1', text: 'Job board', owner_id: 14, due_date: '2026-05-18', done: false }],
  accountability: [],
}
const company = { company_name: 'HHH Services' }
const agenda = buildL10Agenda({ eos, employees, now: NOW })
const graded = buildL10Agenda({ eos, employees, now: NOW, numbers: { m1: { thisWeek: 91000, lastWeek: 70000 }, m2: { thisWeek: 5 } } })

describe('the printed itinerary', () => {
  const text = allText(generateL10AgendaPdf(agenda, company))

  it('leads with what it is and when, and whose company it is', () => {
    expect(text).toContain('Level 10 Meeting')
    expect(text).toContain('Monday 5 October, 8:30 AM')
    expect(text).toContain('HHH Services')
    expect(text).toContain('90 min')
  })

  it('carries all seven sections with their minutes', () => {
    for (const t of ['Segue', 'Scorecard', 'Rock Review', 'Customer & Employee Headlines', 'To-Do List', 'Conclude']) expect(text).toContain(t)
    expect(text).toMatch(/IDS/)
    expect(text).toContain('60 min')
  })

  it('names who is in the room and what each of them owns', () => {
    expect(text).toContain('Doug Webb')
    expect(text).toContain('Cole Westcott')
    expect(text).toMatch(/a scorecard number/)
  })

  it('prints every scorecard row with its owner and its goal', () => {
    expect(text).toContain('Job Revenue')
    expect(text).toContain('at or over $80,000')
    expect(text).toContain('at or under 2')
    expect(text).toContain('no goal set')
  })

  it('says a rock is off track, and that nothing is outstanding when nothing is', () => {
    expect(text).toContain('Fix the job board')
    expect(text).toContain('off track')
  })

  it('flags an overdue to-do as overdue', () => {
    expect(text).toMatch(/due 2026-05-18 . overdue|due 2026-05-18 — overdue/)
  })

  it('numbers the issues and leaves a line to write the to-do on', () => {
    expect(text).toContain('1.')
    expect(text).toContain('Transaction approval over 2k')
    expect(text).toContain('to-do:')
  })

  it('tells the reader the numbers are filled in during the meeting', () => {
    expect(text).toContain('Scorecard numbers are filled in during the meeting.')
  })

  it('prints the numbers instead when it has them', () => {
    const t = allText(generateL10AgendaPdf(graded, company))
    expect(t).toContain('$91,000')
    expect(t).toContain('Scorecard numbers as of the last completed week.')
  })

  it('names the gaps, so a half-built EOS page is not hidden by a tidy document', () => {
    expect(text).toContain('Worth fixing before next week')
    expect(text).toMatch(/no rocks are set|no goal/)
  })

  it('is named for the meeting it is for', () => {
    expect(l10AgendaFilename(agenda)).toBe('L10-2026-10-05.pdf')
  })

  it('never runs text off the bottom of a page', () => {
    // A tenant with a long scorecard and a full issues list: every run has to
    // land inside the printable area or it is simply not on the paper.
    const big = buildL10Agenda({
      eos: {
        ...eos,
        scorecard: Array.from({ length: 19 }, (_, i) => ({ id: `s${i}`, metric: `Metric number ${i} with a fairly long name`, owner_id: 14, goal: '1000', type: 'gte' })),
        issues: Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, title: `Issue ${i} — ${'long '.repeat(12)}`, priority: 'medium', resolved: false, created_at: '2026-09-01' })),
        todos: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, text: `To-do ${i} ${'x'.repeat(60)}`, owner_id: 15, due_date: '2026-10-01', done: false })),
      },
      employees, now: NOW,
    })
    const doc = generateL10AgendaPdf(big, company)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    // The y of every text run, straight out of the content stream. jsPDF emits
    // "<x> <y> Td" in points before each run.
    const ys = [...doc.output().matchAll(/([\d.]+) ([\d.]+) Td/g)].map((m) => Number(m[2]))
    expect(ys.length).toBeGreaterThan(50)
    // jsPDF's y is measured from the bottom, so "off the bottom" is y < 0.
    expect(Math.min(...ys)).toBeGreaterThan(0)
  })
})

describe('the emailed itinerary', () => {
  const html = agendaHtml(agenda, company)
  const txt = agendaText(agenda, company)

  it('says in the subject what the meeting is facing', () => {
    expect(agendaSubject(agenda)).toContain('L10 agenda — Monday 5 October, 8:30 AM')
    expect(agendaSubject(agenda)).toMatch(/1 rock off track/)
    expect(agendaSubject(agenda)).toMatch(/1 overdue/)
  })

  it('is one self-contained document — no images, no external anything', () => {
    expect(html).not.toMatch(/<img|<script|<link|url\(/)
    expect(html).toContain('<!doctype html>')
  })

  it('carries the same sections, owners and goals as the paper copy', () => {
    for (const s of ['Segue', 'Scorecard', 'Rock Review', 'To-Do List', 'Conclude']) expect(html).toContain(s)
    expect(html).toContain('Doug Webb')
    expect(html).toContain('at or over $80,000')
    expect(html).toContain('no goal set')
    expect(txt).toContain('· Job Revenue — Doug Webb — at or over $80,000 — ____')
  })

  it('shows a blank where the number is not known and the number when it is', () => {
    expect(html).toContain('________')
    expect(agendaHtml(graded, company)).toContain('$91,000')
    // 5 callbacks against "at or under 2" has to read as a miss.
    expect(agendaHtml(graded, company)).toContain('#ef4444')
  })

  it('escapes what people typed — an issue title is not markup', () => {
    const nasty = buildL10Agenda({ eos: { ...eos, issues: [{ id: 'x', title: '<script>alert(1)</script> & "quotes"', resolved: false, priority: 'high' }] }, employees, now: NOW })
    const out = agendaHtml(nasty, company)
    expect(out).not.toContain('<script>alert(1)')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('&amp;')
  })

  it('says plainly when a section has nothing in it', () => {
    const bare = buildL10Agenda({ eos: { meetings: { l10_day: 'Monday' } }, employees, now: NOW })
    expect(agendaHtml(bare, company)).toContain('No metrics on the scorecard yet.')
    expect(agendaHtml(bare, company)).toContain('No rocks set for Q4 2026.')
  })

  it('uses the one goal phrasing, shared with the PDF', () => {
    expect(goalText({ goal: null })).toBe('no goal set')
    expect(goalText({ goal: 2, direction: 'at or under' })).toBe('at or under 2')
  })
})
