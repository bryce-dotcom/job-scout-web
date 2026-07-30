import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
import { CalendarDays, ChevronLeft, ChevronRight, Briefcase, Users, Umbrella } from 'lucide-react'
import {
  buildCalendarEvents,
  filterCalendarEvents,
  groupEventsByDay,
  monthGrid,
  KINDS,
} from '../lib/companyCalendar'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb', border: '#d6cdb8', text: '#2c3530',
  textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const KIND_ICON = { sales: Users, delivery: Briefcase, timeoff: Umbrella }

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

  const [cursor, setCursor] = useState(() => new Date())
  const [timeOff, setTimeOff] = useState([])
  const [kinds, setKinds] = useState({ sales: true, delivery: true, timeoff: true })
  const [units, setUnits] = useState({})

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

  const unitNames = useMemo(
    () => (businessUnits || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean),
    [businessUnits],
  )

  const events = useMemo(
    () => buildCalendarEvents({ appointments, jobs, timeOff, employees }),
    [appointments, jobs, timeOff, employees],
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
      <p style={{ margin: '0 0 16px', color: theme.textMuted, fontSize: 13.5 }}>
        Everything on the books in one place — sales appointments, scheduled work, and who&apos;s off.
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
            <button key={k.id} onClick={() => setKinds((p) => ({ ...p, [k.id]: !active }))} style={chip(active, k.color)}>
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
                        onClick={() => ev.link && navigate(ev.link)}
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
    </div>
  )
}
