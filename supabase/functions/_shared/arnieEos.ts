// Arnie and the EOS page.
//
// Bryce, 2026-10-05: "Can Arnie read the EOS page? I want him to be able to
// create an itinerary for a meeting, be able to print it or send it through
// email or app."
//
// He could not read ANY of it. Twenty read tools and not one touched EOS,
// because the whole page lives in `settings` rows as JSON — the scorecard, this
// quarter's rocks, the issues list, the to-dos, the accountability chart — and
// nothing ever looked there. So: one read (`query_eos`) and one write rail
// (`meeting_agenda`) that sends the itinerary.
//
// Two rules this file is careful about.
//
// 1. THE PAGE'S OWN GATE. /admin/eos sits in the MANAGEMENT section of the nav,
//    which is Manager and above (userAccessLevel >= 2). So this read is
//    Manager+ too. An agent must never show what the page would not — and the
//    reverse also holds: it must not be stingier in a way that makes people
//    think the data is gone. A tech gets a plain refusal naming the level.
//
// 2. NO NUMBERS. The scorecard's automatic metrics are computed in the browser
//    (AUTO_SOURCES in EOS.jsx — 19 of them on HHH, each its own money rule
//    over jobs, invoices, payments, the time clock). Recomputing them here
//    would be a second copy of twelve money rules, and the second copy always
//    drifts. So Arnie reads the scorecard's SHAPE — the metric, its owner, its
//    goal — and says plainly that the week's figures are graded on the page.
//    That also means no revenue figure ever leaves through this tool, which is
//    narrower than the page, not wider.

import type { Caller, Prepared, Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'
import { EOS_SETTING_KEYS, buildL10Agenda, calDay, dayStr, nextMeetingDay, parseDay } from './l10Agenda.ts'
import { buildSessionAgenda } from './quarterlyAgenda.ts'
import { agendaSubject } from './l10AgendaRender.ts'
import { CHANNELS, sendAgenda, sendSession, type Channel } from './l10Send.ts'
import { resolveWhenSaid } from './arnieTime.ts'

// deno-lint-ignore-file no-explicit-any
type Any = any

const str = (v: unknown) => (v == null ? '' : String(v)).trim()

/** Every EOS key in one read, parsed. A key nobody has saved is simply absent. */
export async function readEosBundle(r: Rest, companyId: number): Promise<{ eos: Any; employees: Any[]; company: Any }> {
  const keys = Object.values(EOS_SETTING_KEYS)
  const rows = await readRecordList(r, `settings?select=key,value&company_id=eq.${companyId}&key=in.(${keys.join(',')})`)
  const eos: Any = {}
  for (const [name, key] of Object.entries(EOS_SETTING_KEYS)) {
    const row = rows.find((x: Any) => x.key === key)
    if (!row?.value) continue
    try { eos[name] = JSON.parse(row.value) } catch { eos[name] = row.value }
  }
  const employees = await readRecordList(r, `employees?select=id,name,email,user_role,active&company_id=eq.${companyId}&limit=400`)
  const [company] = await readRecordList(r, `companies?select=id,company_name,timezone&id=eq.${companyId}&limit=1`)
  return { eos, employees, company: company || null }
}

const MANAGER = 2

/**
 * query_eos — what is on the EOS page right now.
 *
 * One read, because "how are we doing on our rocks" and "what's on the agenda
 * Monday" are the same lookup. Every section says how many it is NOT showing
 * rather than silently truncating.
 */
export async function eosOverview(r: Rest, caller: Caller, input: Any = {}): Promise<Any> {
  if ((caller.level as number) < MANAGER) {
    return { refused: 'The EOS page — rocks, the scorecard, the issues list, the L10 — is manager and up, the same as the Management menu it sits in. Ask a manager or the owner.' }
  }
  const companyId = caller.companyId as number
  const { eos, employees, company } = await readEosBundle(r, companyId)
  const entity = str(input.unit) || null
  const agenda = buildL10Agenda({ eos, employees, entity })
  const section = (k: string) => agenda.sections.find((s) => s.key === k)
  const want = str(input.part).toLowerCase()

  const vto = {
    core_values: (eos.core_values || []).map((v: Any) => str(v?.value) || str(v)).filter(Boolean),
    purpose: str(eos.core_focus?.purpose) || null,
    niche: str(eos.core_focus?.niche) || null,
    ten_year_target: str(eos.ten_year) || str(eos.ten_year?.target) || null,
    one_year_revenue: eos.one_year?.revenue ?? null,
  }

  const everything: Any = {
    means: 'EOS = the Entrepreneurial Operating System: the V/TO (vision), quarterly Rocks, a weekly Scorecard, the Issues list, and the weekly Level 10 meeting. All of it is on Reports → EOS.',
    l10: { day: str(eos.meetings?.l10_day) || null, time: str(eos.meetings?.l10_time) || null, next: nextMeetingDay(eos.meetings || {}), minutes: agenda.minutes },
    quarter: agenda.quarter,
    counts: agenda.counts,
    scorecard: {
      // Said once, clearly, so the model never implies a figure it was not given.
      numbers: 'Not in this read. The week\'s numbers are computed on the EOS page itself; this is the scorecard\'s shape — what is measured, by whom, against what goal.',
      metrics: (section('scorecard')?.rows || []).map((m: Any) => ({ metric: m.metric, owner: m.owner, goal: m.goal, direction: m.direction, unit: m.entity })),
    },
    rocks: (section('rocks')?.rows || []).map((x: Any) => ({ rock: x.title, owner: x.owner, status: x.status, due: x.due, unit: x.entity })),
    issues_open: (section('ids')?.rows || []).map((x: Any) => ({ issue: x.title, priority: x.priority, kind: x.kind, owners: x.owners, raised: x.raised })),
    todos_open: (section('todos')?.rows || []).map((x: Any) => ({ todo: x.text, owner: x.owner, due: x.due, overdue: x.overdue })),
    seats: (eos.accountability || []).map((s: Any) => ({ seat: str(s.seat), person: employees.find((e: Any) => String(e.id) === String(s.person_id))?.name || null })),
    vto,
    attendees: agenda.attendees.map((a: Any) => ({ name: a.name, owns: a.why, email: a.email })),
    ...(agenda.gaps.length ? { gaps: agenda.gaps } : {}),
    ...(company?.company_name ? { company: company.company_name } : {}),
  }

  if (!want || want === 'all') return everything
  // One part when they asked for one part — "how are the rocks" should not
  // return the whole page.
  const parts: Record<string, Any> = {
    scorecard: { l10: everything.l10, scorecard: everything.scorecard, counts: everything.counts },
    rocks: { quarter: everything.quarter, rocks: everything.rocks },
    issues: { issues_open: everything.issues_open, counts: { issues_open: agenda.counts.issues_open } },
    todos: { todos_open: everything.todos_open, counts: { todos_open: agenda.counts.todos_open, todos_overdue: agenda.counts.todos_overdue } },
    vto: { vto, seats: everything.seats },
    l10: { l10: everything.l10, attendees: everything.attendees, agenda: agenda.sections.map((s) => `${s.minutes} min — ${s.title}`) },
  }
  return parts[want] || everything
}

// ─────────────────────────────────────────────────────────────────────────────
// The itinerary, sent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who it goes to. Default: the people the agenda itself asks something of
 * (scorecard owners, rock owners, to-do owners, the seats) — that is the room.
 * A named list is honoured, matched the way the rest of Arnie matches a person.
 */
export function resolveRecipients(agenda: Any, employees: Any[], to: string): { picked: Any[]; missing: string[] } {
  const want = str(to).toLowerCase()
  if (!want || want === 'the team' || want === 'team' || want === 'everyone' || want === 'the room' || want === 'attendees') {
    return { picked: agenda.attendees, missing: [] }
  }
  const asked = want.split(/,| and /).map((s) => s.trim()).filter(Boolean)
  const picked: Any[] = []
  const missing: string[] = []
  for (const a of asked) {
    const hit = employees.find((e: Any) => str(e.name).toLowerCase() === a)
      || employees.find((e: Any) => str(e.name).toLowerCase().includes(a))
      || employees.find((e: Any) => str(e.email).toLowerCase() === a)
    if (hit) picked.push({ employee_id: hit.id, name: hit.name, email: str(hit.email) || null, why: agenda.attendees.find((x: Any) => String(x.employee_id) === String(hit.id))?.why || 'invited' })
    else missing.push(a)
  }
  return { picked, missing }
}

/** 3pm, 15:00, "noon", "3" → minutes past midnight, or null. */
function endTime(said: string): string | null {
  const t = str(said).toLowerCase()
  if (!t) return null
  if (/noon|midday/.test(t)) return '12:00'
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] || '00'
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  // No am/pm on a meeting end: 1-7 means the afternoon, nobody finishes at 3am.
  if (!m[3] && h >= 1 && h <= 7) h += 12
  return `${String(h).padStart(2, '0')}:${min}`
}

export async function prepareAgenda(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  if ((caller.level as number) < MANAGER) {
    return { ok: false, error: 'Sending the meeting agenda is manager and up — the EOS page it comes from is too.' }
  }
  const { eos, employees, company } = await readEosBundle(r, companyId)

  const channel = (str(f.how).toLowerCase() || 'both') as Channel
  if (!CHANNELS.includes(channel)) return { ok: false, error: `I can send it by email, in the app, or both — not "${f.how}".` }

  // Which of the three EOS meetings. The weekly L10 is the default because it
  // is the one that happens 50 times a year.
  const kind = str(f.type).toLowerCase() || 'l10'
  if (!['l10', 'weekly', 'quarterly', 'annual'].includes(kind)) {
    return { ok: false, error: `EOS has three meetings: the weekly L10, the quarterly session and the annual. "${f.type}" is not one of them.` }
  }

  // The day: taken AS SAID when they said one, else the team's own L10 day.
  const tz = str(company?.timezone) || 'America/Denver'
  let day: string | null = null
  if (str(f.when)) {
    const said = resolveWhenSaid(str(f.when), tz, 'forward')
    day = said?.date || calDay(str(f.when)) || null
    if (!day) return { ok: false, error: `I could not turn "${f.when}" into a date. Say it as a day ("Monday", "next Thursday") or a date.` }
  }

  const entity = str(f.unit) || null

  // ── The quarterly and the annual are a different meeting, not a longer L10.
  if (kind === 'quarterly' || kind === 'annual') {
    if (!day) return { ok: false, error: `Which day does the ${kind} session start? The EOS page only knows the weekly L10 day.` }
    const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 }
    const saidDays = WORDS[str(f.days).toLowerCase()] || Number(str(f.days))
    const dayCount = Math.min(Math.max(saidDays || (kind === 'annual' ? 2 : 1), 1), 4)
    const ends = str(f.ends).split(/,| and | then /).map((x) => endTime(x)).filter(Boolean) as string[]
    const start = parseDay(day) as Date
    const windows = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return { date: dayStr(d), start: '08:00', end: ends[i] || ends[ends.length - 1] || (kind === 'annual' ? '17:00' : '16:30') }
    })
    const session = buildSessionAgenda({ type: kind as 'quarterly' | 'annual', eos, employees, days: windows, entity })
    // The room for a quarterly is the leadership team: the seats, plus anyone
    // carrying a rock or a number. Same rule as the L10, same resolver.
    const l10 = buildL10Agenda({ eos, employees, entity })
    const { picked, missing } = resolveRecipients(l10, employees, str(f.to))
    if (missing.length) return { ok: false, error: `I could not find ${missing.map((m) => `"${m}"`).join(', ')} on the team.` }
    if (!picked.length) return { ok: false, error: 'Nobody on the EOS page owns a seat, a rock or a number, so I do not know who the session is for. Tell me who to send it to.' }

    const dayLine = session.days.map((d: Any) => `${d.label} ${d.start}–${d.end}`).join('  |  ')
    const display = [
      { label: 'Session', value: `${session.title} — ${dayLine}` },
      { label: 'Agenda', value: session.sections.map((s: Any) => `${s.title} ${s.minutes}m`).join(' · ') },
      { label: 'To', value: `${picked.map((p: Any) => p.name).join(', ')} — ${channel === 'both' ? 'email and in the app' : channel === 'app' ? 'in the app' : 'email'}` },
      { label: 'Reviewing', value: session.counts.rocks_closing ? `${session.counts.rocks_closing} rocks from ${session.reviewing}` : `nothing was set for ${session.reviewing}${session.counts.rocks_parked_elsewhere ? ` — the ${session.counts.rocks_parked_elsewhere} rocks on the board are from older quarters` : ''}` },
      { label: 'Setting', value: session.counts.rocks_set_for_this_quarter ? `${session.counts.rocks_set_for_this_quarter} rocks already set for ${session.quarter}` : `no rocks set for ${session.quarter} yet — that is the main job` },
      { label: 'Scorecard', value: `${session.counts.metrics} metrics, ${session.counts.metrics_without_goal} with no goal to grade against` },
      { label: 'Issues', value: `${session.counts.issues_open} open, all of them on the list` },
      ...(session.gaps.length ? [{ label: 'Worth fixing', value: session.gaps.join('; ') }] : []),
      { label: 'Sending', value: 'Once it goes out it cannot be unsent.' },
    ]
    return {
      ok: true,
      columns: {
        session,
        kind,
        channel,
        recipients: picked.map((p: Any) => ({ employee_id: p.employee_id, name: p.name, email: p.email })),
        subject: `${session.title} — ${session.days.map((d: Any) => d.label).join(' & ')}`,
        company_name: company?.company_name || null,
      },
      display,
    }
  }

  const agenda = buildL10Agenda({ eos, employees, day, entity })
  if (!agenda.attendees.length && !str(f.to)) {
    return { ok: false, error: 'Nobody on the EOS page owns a scorecard number, a rock, a to-do or a seat, so I do not know who the meeting is for. Tell me who to send it to, or set the owners on Reports → EOS.' }
  }

  const { picked, missing } = resolveRecipients(agenda, employees, str(f.to))
  if (missing.length) return { ok: false, error: `I could not find ${missing.map((m) => `"${m}"`).join(', ')} on the team. Name them as they appear on the Employees page, or say "the team".` }
  if (!picked.length) return { ok: false, error: 'That left nobody to send it to.' }

  const needEmail = channel === 'email' || channel === 'both'
  const noEmail = picked.filter((p: Any) => !p.email)
  if (needEmail && noEmail.length === picked.length) {
    return { ok: false, error: `None of them has an email address on file${channel === 'email' ? '' : ', so there is nothing to email'}. Add one on the Employees page, or send it in the app only.` }
  }

  const summary = agenda.sections.map((s) => `${s.minutes} min ${s.title}${s.rows ? ` (${s.rows.length})` : ''}`).join(' · ')
  const display = [
    { label: 'Meeting', value: `${agenda.when_label} — ${agenda.minutes} min${agenda.entity ? `, ${agenda.entity} only` : ''}` },
    { label: 'Agenda', value: summary },
    { label: 'To', value: `${picked.map((p: Any) => p.name).join(', ')} — ${channel === 'both' ? 'email and in the app' : channel === 'app' ? 'in the app' : 'email'}${needEmail && noEmail.length ? ` (no email for ${noEmail.map((p: Any) => p.name).join(', ')}, they get it in the app)` : ''}` },
    { label: 'Scorecard', value: `${agenda.counts.metrics} metrics, blanks to fill in live — the numbers are graded on the EOS page` },
    { label: 'Rocks', value: agenda.counts.rocks ? `${agenda.counts.rocks} this quarter, ${agenda.counts.rocks_off_track} not on track` : `none set for ${agenda.quarter}` },
    { label: 'IDS', value: agenda.counts.issues_open ? `${agenda.counts.issues_open} open issues, worst first` : 'no open issues' },
    { label: 'To-dos', value: agenda.counts.todos_open ? `${agenda.counts.todos_open} outstanding, ${agenda.counts.todos_overdue} overdue` : 'nothing outstanding' },
    ...(agenda.gaps.length ? [{ label: 'Worth fixing', value: agenda.gaps.join('; ') }] : []),
    { label: 'Sending', value: 'Once it goes out it cannot be unsent.' },
  ]

  return {
    ok: true,
    columns: {
      agenda,
      channel,
      recipients: picked.map((p: Any) => ({ employee_id: p.employee_id, name: p.name, email: p.email })),
      subject: agendaSubject(agenda),
      company_name: company?.company_name || null,
    },
    display,
  }
}

export async function applyAgenda(r: Rest, companyId: number, prop: Any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string }> {
  const cols = prop.payload?.columns || {}
  const recipients: Any[] = cols.recipients || []
  const channel = (cols.channel || 'both') as Channel
  const company = cols.company_name ? { company_name: cols.company_name } : null
  if (!recipients.length) return { ok: false, error: 'The draft is missing its recipients. Ask me to draft it again.' }

  // The send itself is _shared/l10Send.ts — the same code the EOS page's
  // button runs, so the email is the same email either way.
  if (cols.session) {
    const sent = await sendSession(r, companyId, { session: cols.session, recipients, channel, company, subject: cols.subject })
    if (!sent.ok) return { ok: false, error: sent.error }
    return { ok: true, id: 0, label: prop.payload?.entity_label || 'meeting agenda', created: { starts: cols.session.days?.[0]?.date || null, kind: cols.kind, ...sent.result } }
  }

  const agenda = cols.agenda
  if (!agenda) return { ok: false, error: 'The draft is missing its agenda. Ask me to draft it again.' }
  const sent = await sendAgenda(r, companyId, { agenda, recipients, channel, company })
  if (!sent.ok) return { ok: false, error: sent.error }

  return {
    ok: true,
    id: 0,
    label: prop.payload?.entity_label || 'meeting agenda',
    created: { meeting_on: agenda.meeting_on, ...sent.result },
  }
}


export async function rollbackAgenda(_r: Rest, _companyId: number, prop: Any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const made = prop.payload?.created || {}
  const bits = [made.emailed ? `the email went to ${made.emailed}` : '', made.notified ? `${made.notified} ${made.notified === 1 ? 'person has' : 'people have'} it in the app` : ''].filter(Boolean).join(' and ')
  return { ok: false, error: `${bits || 'It went out'} and cannot be unsent. Send a correction if the agenda changed.` }
}
