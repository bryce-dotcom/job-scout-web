import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
import { CalendarDays, ChevronLeft, ChevronRight, Briefcase, Users, Umbrella, Wrench, Repeat, Route, Truck, CheckCircle2, Presentation, Plus, X, Trash2, RotateCcw, CalendarOff } from 'lucide-react'
import { getAccessLevel, ACCESS_LEVELS } from '../lib/accessControl'
import { MEETING_SERIES, formatTime, cadenceSentence } from '../lib/companyMeetings'
import {
  buildCalendarEvents,
  filterCalendarEvents,
  groupEventsByDay,
  monthGrid,
  KINDS,
  calendarSourcesSentence,
} from '../lib/companyCalendar'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb', border: '#d6cdb8', text: '#2c3530',
  textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const KIND_ICON = { sales: Users, delivery: Briefcase, completed: CheckCircle2, timeoff: Umbrella, service: Wrench, projected: Repeat, route: Route, fleet: Truck, meeting: Presentation, holiday: CalendarOff }

export default function CompanyCalendar() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore((s) => s.companyId)
  const jobs = useStore((s) => s.jobs)
  const appointments = useStore((s) => s.appointments)
  const employees = useStore((s) => s.employees)
  const businessUnits = useStore((s) => s.businessUnits)
  // All three are already loaded app-wide by fetchAllData, so this is another
  // read of what is in the store — not another fetch, and not a new dependency
  // on those pages having been visited.
  const routes = useStore((s) => s.routes)
  const fleet = useStore((s) => s.fleet)
  const fleetRentals = useStore((s) => s.fleetRentals)

  const [cursor, setCursor] = useState(() => new Date())
  const [timeOff, setTimeOff] = useState([])
  const [kinds, setKinds] = useState({ sales: true, delivery: true, completed: true, timeoff: true, service: true, projected: true, route: true, fleet: true })
  const [units, setUnits] = useState({})

  // MEETINGS.
  //
  // The cadence is an EOS setting and `settings` is already in the store
  // app-wide, so the weekly L10 costs this page nothing to draw. Only the
  // exceptions — a week moved, a week cancelled, a one-off all-hands —
  // are a table, and it is a small one.
  const settings = useStore((s) => s.settings)
  const user = useStore((s) => s.user)
  const currentEmployee = useMemo(
    () => (employees || []).find((e) => e.email === user?.email) || null,
    [employees, user],
  )
  // Everyone SEES the meetings; Manager+ changes them, matching the gate
  // on /admin/eos. RLS enforces the same rule server-side — this only
  // keeps the buttons from being offered to someone who would be refused.
  const canEditMeetings = getAccessLevel(currentEmployee) >= ACCESS_LEVELS.MANAGER
  const [meetingRows, setMeetingRows] = useState([])
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)

  const cadence = useMemo(() => {
    const row = (settings || []).find((x) => x.key === 'eos_meeting_cadences')
    if (!row?.value) return null
    try { return typeof row.value === 'string' ? JSON.parse(row.value) : row.value } catch { return null }
  }, [settings])

  // Handed over raw: parseCompanyHolidays in _shared/holidays.ts is the one
  // place that decides what a malformed list means, and it is the same
  // place the rep routines ask. Null when nothing is set, which draws the
  // eight federal days and nothing else.
  const companyHolidays = useMemo(
    () => (settings || []).find((x) => x.key === 'company_holidays')?.value ?? null,
    [settings],
  )

  const [meetingsVersion, setMeetingsVersion] = useState(0)
  const reloadMeetings = () => setMeetingsVersion((v) => v + 1)
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('company_meetings')
        .select('id, series_kind, series_date, meeting_date, start_time, duration_minutes, title, notes, cancelled')
        .eq('company_id', companyId)
      if (error) { console.warn('[CompanyCalendar] meetings fetch failed:', error.message); return }
      if (!cancelled) setMeetingRows(data || [])
    })()
    return () => { cancelled = true }
  }, [companyId, meetingsVersion])

  // Time off is a small table and isn't in the store — fetch it directly.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('time_off_requests')
        .select('id, employee_id, start_date, end_date, request_type, status')
        .eq('company_id', companyId)
      if (error) { console.warn('[CompanyCalendar] time off fetch failed:', error.message); return }
      if (!cancelled) setTimeOff(data || [])
    })()
    return () => { cancelled = true }
  }, [companyId])

  // Work that is already finished, fetched a month at a time.
  //
  // Christopher, 16 Oct: "Jobs disappear from Calendar once completed."
  // The store drops `status = 'Archived'` and archiving overwrites the
  // status, so 6,196 of HHH's jobs — 6,187 of them dated — never reach this
  // page. That is the whole history of the company against the ~975 that are
  // not archived.
  //
  // Fetched here rather than un-filtering the store: the store feeds every
  // page in the app, and putting six thousand finished jobs into it to draw
  // one month of them would cost every other screen. One month is a small
  // query and it is thrown away when you page past it.
  const [completedJobs, setCompletedJobs] = useState([])
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    ;(async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_id, job_title, business_unit, assigned_team, status, completed_at, customer:customers!customer_id(name)')
        .eq('company_id', companyId)
        .not('completed_at', 'is', null)
        .gte('completed_at', `${key(first)}T00:00:00`)
        .lte('completed_at', `${key(last)}T23:59:59`)
        .limit(1000)
      if (error) { console.warn('[CompanyCalendar] finished work fetch failed:', error.message); return }
      if (!cancelled) setCompletedJobs(data || [])
    })()
    return () => { cancelled = true }
  }, [companyId, cursor])

  const unitNames = useMemo(
    () => (businessUnits || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean),
    [businessUnits],
  )

  // Project repeats through the end of the month being looked at, so paging
  // forward answers "when does this come round again" instead of showing an
  // empty grid. Bryce: "When a reacurring job is put on the schedule I can't
  // see it the next month."
  const projectThrough = useMemo(
    () => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59),
    [cursor],
  )

  // The month on screen, which is the window the meeting series is drawn
  // between. A rule has no end of its own, so without bounds there is
  // nothing to say how far forward to draw it.
  const meetingWindow = useMemo(() => {
    const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      from: k(new Date(cursor.getFullYear(), cursor.getMonth(), 1)),
      through: k(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)),
    }
  }, [cursor])

  const events = useMemo(
    () => buildCalendarEvents(
      { appointments, jobs, completedJobs, timeOff, employees, routes, fleet, fleetRentals, meetingCadence: cadence, meetingOverrides: meetingRows, companyHolidays },
      { projectRecurringThrough: projectThrough, meetingWindow },
    ),
    [appointments, jobs, completedJobs, timeOff, employees, routes, fleet, fleetRentals, projectThrough, cadence, meetingRows, meetingWindow, companyHolidays],
  )

  const visible = useMemo(() => filterCalendarEvents(events, { kinds, units }), [events, kinds, units])
  const byDay = useMemo(() => groupEventsByDay(visible), [visible])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const todayKey = useMemo(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }, [])

  const monthCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const seen = new Set()
    for (const [key, list] of Object.entries(byDay)) {
      if (!key.startsWith(prefix)) continue
      for (const ev of list) seen.add(ev.id)
    }
    return seen.size
  }, [byDay, year, month])

  const step = (delta) => setCursor(new Date(year, month + delta, 1))

  const chip = (active, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', minHeight: 38, borderRadius: 999, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
    border: `1px solid ${active ? color : theme.border}`,
    backgroundColor: active ? color : 'transparent',
    color: active ? '#fff' : theme.textSecondary,
  })

  const navBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.textSecondary,
  }

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <CalendarDays size={22} color={theme.accent} />
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: theme.text }}>Company Calendar</h1>
      </div>
      {/* Say what reaches this calendar, and from where. Someone who books
          something and doesn't see it here otherwise has no way to tell whether
          it failed or was never going to appear. The sentence is derived from
          KINDS, so adding a writer without telling anyone is not possible — it
          updated itself when routes and fleet joined. */}
      <p style={{ margin: '0 0 6px', color: theme.textMuted, fontSize: 13.5 }}>
        Everything on the books in one place — sales, scheduled work, service due, routes, fleet and who&apos;s off.
      </p>
      <p style={{ margin: '0 0 16px', color: theme.textMuted, fontSize: 12 }}>
        Shows {calendarSourcesSentence()}. Routes and Fleet still have their own screens for working in — this is the one view of everything.
      </p>
      {/* Where the meetings come from, said out loud. If no cadence is set
          this is the one place that will tell you the EOS page is where it
          gets set — the calendar was previously silent about meetings
          altogether, which is what Bryce reported. */}
      <p style={{ margin: '0 0 16px', color: theme.textMuted, fontSize: 12 }}>
        {cadenceSentence(cadence)
          ? <>Meetings: {cadenceSentence(cadence)} — set in <button onClick={() => navigate('/admin/eos')} style={{ background: 'none', border: 'none', padding: 0, color: theme.accent, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>EOS → Meeting Schedule</button>. Click a meeting to move or cancel just that one.</>
          : <>No meeting cadence set yet — pick a day and time in <button onClick={() => navigate('/admin/eos')} style={{ background: 'none', border: 'none', padding: 0, color: theme.accent, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>EOS → Meeting Schedule</button> and it appears here.</>}
      </p>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => step(-1)} style={navBtn} title="Previous month"><ChevronLeft size={18} /></button>
        <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: theme.text, minWidth: 150 }}>
          {MONTHS[month]} {year}
        </div>
        <button onClick={() => step(1)} style={navBtn} title="Next month"><ChevronRight size={18} /></button>
        <button
          onClick={() => setCursor(new Date())}
          style={{ padding: '8px 14px', minHeight: 38, borderRadius: 8, cursor: 'pointer', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.textSecondary, fontSize: 13, fontWeight: 600 }}
        >
          Today
        </button>
        {canEditMeetings && (
          <button
            onClick={() => setAdding(true)}
            style={{ padding: '8px 14px', minHeight: 38, borderRadius: 8, cursor: 'pointer', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.textSecondary, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Add a one-off meeting — an all-hands, a training day, anything outside the cadence"
          >
            <Plus size={14} /> Meeting
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: theme.textMuted }}>
          {monthCount} {monthCount === 1 ? 'item' : 'items'} this month
        </span>
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {Object.values(KINDS).map((k) => {
          const Icon = KIND_ICON[k.id]
          const active = kinds[k.id] !== false
          return (
            <button
              key={k.id}
              onClick={() => setKinds((p) => ({ ...p, [k.id]: !active }))}
              style={chip(active, k.color)}
              // The rule for this kind, one hover from the chip it belongs to.
              // It used to be spelled out in the sentence above, which at seven
              // kinds ran to a paragraph.
              title={`From ${k.writes.source} — appears when ${k.writes.appearsWhen}.`}
            >
              <Icon size={13} /> {k.label}
            </button>
          )
        })}
      </div>
      {unitNames.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>
            Business unit
          </span>
          {unitNames.map((name) => {
            const active = units[name] !== false
            return (
              <button key={name} onClick={() => setUnits((p) => ({ ...p, [name]: !active }))} style={chip(active, theme.accent)}>
                {name}
              </button>
            )
          })}
        </div>
      )}

      {/* Month grid */}
      <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', backgroundColor: theme.accentBg }}>
          {DOW.map((d) => (
            <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isMobile ? d.charAt(0) : d}
            </div>
          ))}
        </div>
        {/* Days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {cells.map((cell, i) => {
            if (!cell) return <div key={`b${i}`} style={{ minHeight: isMobile ? 74 : 108, backgroundColor: theme.bg, borderRight: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }} />
            const list = byDay[cell.key] || []
            const isToday = cell.key === todayKey
            const shown = isMobile ? list.slice(0, 2) : list.slice(0, 3)
            return (
              <div key={cell.key} style={{ minHeight: isMobile ? 74 : 108, padding: isMobile ? 3 : 6, borderRight: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, backgroundColor: isToday ? theme.accentBg : 'transparent', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 600, color: isToday ? theme.accent : theme.textSecondary, marginBottom: 3 }}>
                  {cell.day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {shown.map((ev) => {
                    const color = KINDS[ev.kind]?.color || theme.accent
                    const pending = ev.kind === 'timeoff' && ev.status === 'pending'
                    return (
                      <button
                        key={ev.id}
                        onClick={() => { if (ev.kind === 'meeting') setEditing(ev.meeting); else if (ev.link) navigate(ev.link) }}
                        title={`${ev.title}${ev.subtitle ? ' · ' + ev.subtitle : ''}${pending ? ' (pending approval)' : ''}`}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', minWidth: 0,
                          padding: isMobile ? '2px 4px' : '3px 6px', borderRadius: 4, cursor: 'pointer',
                          fontSize: isMobile ? 9 : 10.5, fontWeight: 600, lineHeight: 1.25,
                          backgroundColor: pending ? 'transparent' : `${color}1f`,
                          border: pending ? `1px dashed ${color}` : `1px solid ${color}33`,
                          color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {ev.title}
                      </button>
                    )
                  })}
                  {list.length > shown.length && (
                    <span style={{ fontSize: 9.5, color: theme.textMuted, paddingLeft: 2 }}>
                      +{list.length - shown.length} more
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p style={{ marginTop: 12, fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>
        Sales = booked appointments · Delivery = scheduled jobs · Time off spans every day requested.
        A dashed outline means the time off is still <strong>pending approval</strong>.
        Business-unit filters apply to scheduled work; appointments and time off are controlled by their own toggle.
      </p>

      {editing && (
        <MeetingPanel
          meeting={editing}
          theme={theme}
          isMobile={isMobile}
          companyId={companyId}
          canEdit={canEditMeetings}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadMeetings() }}
        />
      )}
      {adding && (
        <MeetingPanel
          adding
          theme={theme}
          isMobile={isMobile}
          companyId={companyId}
          canEdit={canEditMeetings}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); reloadMeetings() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ONE MEETING
//
// The cadence is a rule and the calendar draws it. This is the escape
// hatch Bryce asked for — "it needs to be maluble in the chace we need to
// change something" — and it writes the smallest possible record: one row
// naming the occurrence it replaces.
//
// Moving a meeting does NOT touch the cadence. Change the cadence in EOS and
// every week nobody has touched follows it; the fortnight you shifted around
// a holiday stays where you put it, because its row names the date it was
// originally due rather than the date it ended up on.
// ════════════════════════════════════════════════════════════════════
function MeetingPanel({ meeting, adding = false, theme, isMobile, companyId, canEdit, onClose, onSaved }) {
  const series = meeting ? (MEETING_SERIES[meeting.seriesKind] || MEETING_SERIES.custom) : MEETING_SERIES.custom
  const [date, setDate] = useState(adding ? '' : (meeting?.date || ''))
  const [time, setTime] = useState(adding ? '' : (meeting?.time || ''))
  const [title, setTitle] = useState(adding ? '' : (meeting?.custom ? (meeting?.title || '') : ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const fail = (e) => { setErr(e?.message || String(e)); setBusy(false) }

  // A series occurrence is keyed by the date it would NORMALLY fall on, so the
  // row keeps pointing at the same occurrence however far it is moved.
  const upsertOverride = async (patch) => {
    const { error } = await supabase.from('company_meetings').upsert({
      company_id: companyId,
      series_kind: meeting.seriesKind,
      series_date: meeting.seriesDate,
      ...patch,
    }, { onConflict: 'company_id,series_kind,series_date' })
    return error
  }

  const save = async () => {
    setErr(''); setBusy(true)
    if (adding) {
      if (!title.trim()) return fail(new Error('Give the meeting a name.'))
      if (!date) return fail(new Error('Pick a day.'))
      const { error } = await supabase.from('company_meetings').insert({
        company_id: companyId,
        series_kind: 'custom',
        series_date: null,
        meeting_date: date,
        start_time: time || null,
        title: title.trim(),
        cancelled: false,
      })
      if (error) return fail(error)
      return onSaved()
    }
    if (!date) return fail(new Error('Pick a day.'))
    // A one-off edits itself in place; a series occurrence writes an override.
    const error = meeting.custom
      ? (await supabase.from('company_meetings')
          .update({ meeting_date: date, start_time: time || null, title: title.trim() || meeting.title })
          .eq('id', meeting.overrideId)).error
      : await upsertOverride({ meeting_date: date, start_time: time || null, cancelled: false })
    if (error) return fail(error)
    onSaved()
  }

  const cancelMeeting = async () => {
    setErr(''); setBusy(true)
    // A one-off that is called off is simply removed — there is no rule behind
    // it for a tombstone to suppress.
    const error = meeting.custom
      ? (await supabase.from('company_meetings').delete().eq('id', meeting.overrideId)).error
      : await upsertOverride({ meeting_date: null, start_time: null, cancelled: true })
    if (error) return fail(error)
    onSaved()
  }

  // Drop the exception and let the rule draw this week again.
  const resetToCadence = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.from('company_meetings').delete().eq('id', meeting.overrideId)
    if (error) return fail(error)
    onSaved()
  }

  const label = { fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }
  const field = { padding: '9px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, backgroundColor: theme.bg, color: theme.text, width: '100%', minHeight: 40 }
  const btn = (bg, fg, bd) => ({ padding: '10px 16px', minHeight: 42, borderRadius: 8, cursor: busy ? 'wait' : 'pointer', border: `1px solid ${bd || bg}`, backgroundColor: bg, color: fg, fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 })

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(20,24,20,0.45)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: isMobile ? '14px 14px 0 0' : 14, width: '100%', maxWidth: 420, padding: 20, boxShadow: '0 18px 50px rgba(20,24,20,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <Presentation size={20} color="#8b5cf6" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: theme.text }}>
              {adding ? 'Add a meeting' : (meeting.title || series.label)}
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>
              {adding
                ? 'A one-off — it sits outside the cadence and repeats nothing.'
                : meeting.custom
                  ? 'A one-off meeting.'
                  : meeting.moved
                    ? `${series.label} — moved from ${meeting.seriesDate}`
                    : `${series.label} — from the EOS cadence`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 4 }} title="Close"><X size={18} /></button>
        </div>

        {!canEdit ? (
          <div style={{ marginTop: 14, fontSize: 13.5, color: theme.textSecondary, lineHeight: 1.5 }}>
            {meeting?.date} {formatTime(meeting?.time) || ''}
            <div style={{ marginTop: 8, color: theme.textMuted, fontSize: 12.5 }}>
              The meeting schedule is changed by a manager.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {(adding || meeting.custom) && (
                <div>
                  <label style={label}>Name</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="All-Hands" style={field} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Day</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
                </div>
                <div>
                  <label style={label}>Time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />
                </div>
              </div>
            </div>

            {err && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
                {err}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button disabled={busy} onClick={save} style={btn('#8b5cf6', '#fff')}>
                {adding ? 'Add meeting' : 'Save'}
              </button>
              {!adding && (
                <button disabled={busy} onClick={cancelMeeting} style={btn('transparent', '#b91c1c', '#fecaca')}>
                  <Trash2 size={14} /> {meeting.custom ? 'Delete' : 'Cancel this one'}
                </button>
              )}
              {/* Only an occurrence that HAS an exception can be put back. */}
              {!adding && !meeting.custom && meeting.overrideId && (
                <button disabled={busy} onClick={resetToCadence} style={btn('transparent', theme.textSecondary, theme.border)} title="Drop the change and let the EOS cadence draw this week again">
                  <RotateCcw size={14} /> Back to cadence
                </button>
              )}
            </div>

            {!adding && !meeting.custom && (
              <p style={{ marginTop: 14, marginBottom: 0, fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>
                This changes <strong>this one meeting</strong>. The weekly pattern lives in EOS → Meeting Schedule;
                change it there and every week nobody has moved follows along.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
