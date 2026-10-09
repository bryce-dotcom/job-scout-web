// The itinerary as words: HTML for the email, plain text for the in-app
// message and for Arnie's reply.
//
// In _shared because Arnie sends this from an edge function and the EOS page
// sends it from the browser, and an email that differs depending on who pressed
// the button is the kind of thing nobody notices until a customer does. Takes
// what buildL10Agenda returns and only formats — no reading, no deciding.
//
// The HTML is deliberately plain: a table, system fonts, no images, no dark
// theme. It has to survive Outlook and it has to PRINT, because "print it" is
// half of what this was asked for and most people will print the email.

import type { Agenda } from './l10Agenda.ts'

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const figure = (n: number | null) => (n == null ? '' : Math.abs(n) >= 1000 ? money(n) : String(Math.round(n * 100) / 100))

/** The goal said the way the owner has to meet it. */
export function goalText(row: any): string {
  if (row.goal == null) return 'no goal set'
  return `${row.direction} ${figure(row.goal)}`
}

const STATUS_WORD: Record<string, string> = { 'off-track': 'OFF TRACK', 'at-risk': 'at risk', 'on-track': 'on track', done: 'done' }

/** The subject line: what it is, when, and the one number worth the subject. */
export function agendaSubject(agenda: Agenda): string {
  const bits = [`L10 agenda — ${agenda.when_label}`]
  const c = agenda.counts
  const worth = [c.rocks_off_track ? `${c.rocks_off_track} rock${c.rocks_off_track === 1 ? '' : 's'} off track` : '', c.issues_open ? `${c.issues_open} issue${c.issues_open === 1 ? '' : 's'}` : '', c.todos_overdue ? `${c.todos_overdue} overdue` : ''].filter(Boolean)
  if (worth.length) bits.push(worth.join(', '))
  return bits.join(' · ')
}

export function agendaText(agenda: Agenda, company: any = null): string {
  const out: string[] = []
  out.push(`${agenda.title} — ${agenda.when_label}`)
  out.push([company?.company_name, agenda.quarter, agenda.entity].filter(Boolean).join('  ·  '))
  out.push(`${agenda.minutes} minutes`)
  if (agenda.attendees.length) out.push(`\nIn the room: ${agenda.attendees.map((a) => a.name).join(', ')}`)
  for (const s of agenda.sections) {
    out.push(`\n${s.minutes} min — ${s.title}`)
    if (s.note) out.push(`  ${s.note}`)
    if (!s.rows) continue
    if (!s.rows.length) { out.push('  (nothing)'); continue }
    for (const r of s.rows) {
      if (s.key === 'scorecard') out.push(`  · ${r.metric} — ${r.owner || 'unassigned'} — ${goalText(r)}${r.value == null ? ' — ____' : ` — ${figure(r.value)}${r.on_goal === false ? ' (off goal)' : ''}`}`)
      else if (s.key === 'rocks') out.push(`  · ${r.title} — ${r.owner || 'unassigned'} — ${STATUS_WORD[r.status] || r.status}`)
      else if (s.key === 'todos') out.push(`  · ${r.text} — ${r.owner || 'unassigned'}${r.due ? ` — due ${r.due}${r.overdue ? ' (overdue)' : ''}` : ''}`)
      else out.push(`  · ${r.title} — ${r.priority}, ${r.kind}`)
    }
  }
  if (agenda.gaps.length) out.push(`\nWorth fixing before next week:\n${agenda.gaps.map((g) => `  · ${g}`).join('\n')}`)
  out.push(`\n${agenda.numbers_included ? 'Scorecard numbers are as of the last completed week.' : 'Scorecard numbers get filled in during the meeting.'}`)
  return out.join('\n')
}

export function agendaHtml(agenda: Agenda, company: any = null): string {
  const head = `<tr><td style="padding:14px 0 6px;border-top:1px solid #d6cdb8">
      <span style="font:700 15px/1.3 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530">%T%</span>
      <span style="float:right;font:700 11px/1.3 -apple-system,Segoe UI,Arial,sans-serif;color:#5a6349">%M% min</span>
    </td></tr>`
  const note = (s: string) => `<tr><td style="padding:0 0 8px;font:italic 12px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">${esc(s)}</td></tr>`
  const rows: string[] = []

  for (const s of agenda.sections) {
    rows.push(head.replace('%T%', esc(s.title)).replace('%M%', String(s.minutes)))
    if (s.note) rows.push(note(s.note))
    if (!s.rows) continue
    if (!s.rows.length) {
      const empty = s.key === 'rocks' ? `No rocks set for ${agenda.quarter}.` : s.key === 'scorecard' ? 'No metrics on the scorecard yet.' : s.key === 'ids' ? 'No open issues.' : 'Nothing outstanding.'
      rows.push(`<tr><td style="padding:0 0 8px;font:13px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">${esc(empty)}</td></tr>`)
      continue
    }
    const cells = s.rows.map((r: any, i: number) => {
      const owner = `<span style="color:${r.owner ? '#4d5a52' : '#ef4444'}">${esc(r.owner || 'unassigned')}</span>`
      if (s.key === 'scorecard') {
        const val = r.value == null
          ? '<span style="color:#7d8a7f">________</span>'
          : `<b style="color:${r.on_goal === false ? '#ef4444' : r.on_goal ? '#22c55e' : '#2c3530'}">${esc(figure(r.value))}</b>`
        return `<tr><td style="padding:3px 0;font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530">${esc(r.metric)}</td><td style="padding:3px 8px;font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif">${owner}</td><td style="padding:3px 8px;font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">${esc(goalText(r))}</td><td style="padding:3px 0;text-align:right;font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif">${val}</td></tr>`
      }
      if (s.key === 'rocks') {
        const colour = r.status === 'off-track' ? '#ef4444' : r.status === 'at-risk' ? '#eab308' : '#22c55e'
        return `<tr><td style="padding:3px 0;font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530">☐ ${esc(r.title)}</td><td style="padding:3px 8px;font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif">${owner}</td><td style="padding:3px 0;text-align:right;font:700 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:${colour}">${esc(STATUS_WORD[r.status] || r.status)}</td></tr>`
      }
      if (s.key === 'todos') {
        return `<tr><td style="padding:3px 0;font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530">☐ ${esc(r.text)}</td><td style="padding:3px 8px;font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif">${owner}</td><td style="padding:3px 0;text-align:right;font:${r.overdue ? '700' : '400'} 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:${r.overdue ? '#ef4444' : '#7d8a7f'}">${r.due ? esc(r.overdue ? `due ${r.due} — overdue` : `due ${r.due}`) : ''}</td></tr>`
      }
      return `<tr><td style="padding:4px 0;font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530"><b>${i + 1}.</b> ${esc(r.title)}</td><td style="padding:4px 8px;font:11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:${r.priority === 'high' ? '#ef4444' : '#7d8a7f'}">${esc(r.priority)}</td><td style="padding:4px 0;text-align:right;font:11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">${esc(r.kind)}</td></tr>`
    }).join('')
    rows.push(`<tr><td style="padding:0 0 8px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${cells}</table></td></tr>`)
  }

  const who = agenda.attendees.length
    ? `<tr><td style="padding:0 0 14px;font:13px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#4d5a52"><b style="color:#2c3530">In the room:</b> ${agenda.attendees.map((a) => esc(a.name)).join(', ')}</td></tr>`
    : ''
  const gaps = agenda.gaps.length
    ? `<tr><td style="padding:12px 0 0;border-top:1px solid #d6cdb8"><div style="font:700 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#ef4444;padding-bottom:4px">WORTH FIXING BEFORE NEXT WEEK</div>${agenda.gaps.map((g) => `<div style="font:12px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">· ${esc(g)}</div>`).join('')}</td></tr>`
    : ''

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f5ef">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f7f5ef;padding:24px 12px">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background:#ffffff;border:1px solid #d6cdb8;border-radius:10px;padding:24px">
      <tr><td style="font:800 22px/1.2 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530">${esc(agenda.title)}</td></tr>
      <tr><td style="padding:4px 0 2px;font:600 14px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#5a6349">${esc(agenda.when_label)} · ${esc(agenda.minutes)} min</td></tr>
      <tr><td style="padding:0 0 14px;font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">${esc([company?.company_name, agenda.quarter, agenda.entity].filter(Boolean).join('  ·  '))}</td></tr>
      ${who}
      ${rows.join('')}
      ${gaps}
      <tr><td style="padding:14px 0 0;font:11px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#7d8a7f">${agenda.numbers_included ? 'Scorecard numbers are as of the last completed week.' : 'Scorecard numbers get filled in during the meeting.'}</td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// The Quarterly / Annual session as plain text.
//
// Bryce asked for it "in a format I can copy and paste via txt", which is also
// the format a two-day session actually gets used in: printed, or pasted into
// a message. Clock times when the days are known, the real rows underneath, and
// the gaps named at the end rather than tidied away.
// ─────────────────────────────────────────────────────────────────────────────

const rule = (c = '=') => c.repeat(72)
//  is the one already defined at the top of this file.
const goalPhrase = (m: any) => (m.goal == null ? 'NO GOAL SET — agree one today' : `${m.direction} ${Math.abs(m.goal) >= 1000 ? money(m.goal) : m.goal}`)

export function sessionText(a: any, company: any = null): string {
  const out: string[] = []
  const name = company?.company_name ? String(company.company_name).toUpperCase() : ''
  out.push(rule())
  out.push(`${name ? name + ' — ' : ''}${a.title.toUpperCase()}`)
  if (a.days?.length) out.push(a.days.map((d: any) => `${d.label}  ${d.start || '8:00'}–${d.end || ''}`).join('   |   '))
  out.push(`${a.hours} hours of agenda · reviewing ${a.reviewing}${a.entity ? ` · ${a.entity}` : ''}`)
  out.push(rule())

  const byDay: Record<number, any[]> = {}
  const all = [...(a.sections || []), ...(a.breaks || [])].filter((s: any) => s.start)
  for (const s of all) (byDay[s.day] ||= []).push(s)
  // By the clock, not by the label: "10:00 AM" sorts before "8:00 AM" as text.
  for (const d of Object.keys(byDay)) byDay[Number(d)].sort((x, y) => (x.startMin ?? 0) - (y.startMin ?? 0))

  const renderSection = (s: any) => {
    const head = s.start ? `${s.start} — ${s.title.toUpperCase()} (${s.minutes} min)` : `${s.title.toUpperCase()} (${s.minutes} min)`
    out.push('')
    out.push(head)
    if (s.note) out.push(wrapText(s.note, 70, '  '))
    if (!s.rows) return
    if (!s.rows.length) { out.push('  (nothing on the page yet)'); return }
    out.push('')
    for (const r of s.rows) {
      if (s.key === 'vto') out.push(`  [${r.set ? 'x' : ' '}] ${r.field}${r.value ? `: ${String(r.value).slice(0, 90)}` : '  — EMPTY, fill it in this session'}`)
      else if (s.key === 'team_health') out.push(`  ${r.seat}: ${r.person || 'VACANT'}${r.roles?.length ? `  (${r.roles.slice(0, 3).join('; ')})` : ''}`)
      else if (s.key === 'issues') out.push(`  [ ] ${r.title}  — ${r.priority}, ${r.kind}${r.owners?.length ? `, ${r.owners.join(' & ')}` : ''}`)
      else out.push(`  [ ] ${r.title}  — ${r.owner || 'NOBODY'}${r.due ? `, due ${r.due}` : ''}${r.status ? `, ${String(r.status).replace('-', ' ')}` : ''}${r.quarter ? ` (${r.quarter})` : ''}`)
    }
  }

  const unplaced = (a.sections || []).filter((s: any) => !s.start)
  const renderUnplaced = () => {
    if (!unplaced.length) return
    out.push('')
    out.push(rule())
    out.push('DID NOT FIT IN THE DAYS — DECIDE WHAT TO CUT OR ADD TIME')
    out.push(rule())
    for (const s of unplaced) renderSection(s)
  }

  if (Object.keys(byDay).length) {
    for (const d of Object.keys(byDay).map(Number).sort()) {
      out.push('')
      out.push(rule())
      out.push(`DAY ${d + 1} — ${(a.days[d]?.label || '').toUpperCase()}`)
      out.push(rule())
      for (const s of byDay[d]) {
        if (s.key === 'lunch' || s.key === 'break') { out.push(''); out.push(`${s.start} — ${s.title.toUpperCase()} (${s.minutes} min)`); continue }
        renderSection(s)
      }
    }
    renderUnplaced()
  } else {
    for (const s of a.sections || []) renderSection(s)
  }

  // The scorecard belongs on the table for the review, in full.
  if (a.scorecard?.length) {
    out.push('')
    out.push(rule())
    out.push(`SCORECARD — ${a.scorecard.length} METRICS, AS THEY STAND ON THE EOS PAGE`)
    out.push(rule())
    out.push('Fill the quarter\'s numbers in as each owner reads them out.')
    out.push('')
    let owner = '\u0000'
    for (const m of a.scorecard) {
      if (m.owner !== owner) { owner = m.owner; out.push(`  ${owner || 'NOBODY ASSIGNED'}:`) }
      out.push(`    ${m.metric}`)
      out.push(`        ${goalPhrase(m)}        actual: ____________`)
    }
  }

  if (a.gaps?.length) {
    out.push('')
    out.push(rule())
    out.push('BEFORE YOU LEAVE — WHAT THE EOS PAGE IS MISSING')
    out.push(rule())
    for (const g of a.gaps) out.push(wrapText(`- ${g}`, 68, '', '  '))
  }
  out.push('')
  return out.join('\n')
}

function wrapText(s: string, width: number, indent: string, hanging = indent): string {
  const words = String(s).split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push((lines.length ? hanging : indent) + line.trim()); line = w } else line += ' ' + w
  }
  if (line.trim()) lines.push((lines.length ? hanging : indent) + line.trim())
  return lines.join('\n')
}
