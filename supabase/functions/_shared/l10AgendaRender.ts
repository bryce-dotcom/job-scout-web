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
