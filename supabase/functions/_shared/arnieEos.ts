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
import { EOS_SETTING_KEYS, buildL10Agenda, calDay, nextMeetingDay } from './l10Agenda.ts'
import { agendaSubject } from './l10AgendaRender.ts'
import { CHANNELS, sendAgenda, type Channel } from './l10Send.ts'
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

export async function prepareAgenda(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  if ((caller.level as number) < MANAGER) {
    return { ok: false, error: 'Sending the L10 agenda is manager and up — the EOS page it comes from is too.' }
  }
  const { eos, employees, company } = await readEosBundle(r, companyId)

  const channel = (str(f.how).toLowerCase() || 'both') as Channel
  if (!CHANNELS.includes(channel)) return { ok: false, error: `I can send it by email, in the app, or both — not "${f.how}".` }

  // The day: taken AS SAID when they said one, else the team's own L10 day.
  const tz = str(company?.timezone) || 'America/Denver'
  let day: string | null = null
  if (str(f.when)) {
    const said = resolveWhenSaid(str(f.when), tz, 'forward')
    day = said?.date || calDay(str(f.when)) || null
    if (!day) return { ok: false, error: `I could not turn "${f.when}" into a date. Say it as a day ("Monday", "next Thursday") or a date.` }
  }

  const entity = str(f.unit) || null
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
  const agenda = cols.agenda
  const recipients: Any[] = cols.recipients || []
  const channel = (cols.channel || 'both') as Channel
  if (!agenda || !recipients.length) return { ok: false, error: 'The draft is missing its agenda or its recipients. Ask me to draft it again.' }

  // The send itself is _shared/l10Send.ts — the same code the EOS page's
  // button runs, so the email is the same email either way.
  const sent = await sendAgenda(r, companyId, { agenda, recipients, channel, company: cols.company_name ? { company_name: cols.company_name } : null })
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
