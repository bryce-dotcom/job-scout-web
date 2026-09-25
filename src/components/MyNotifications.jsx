// What is waiting for this person, on the screen they open every morning.
//
// company_notifications is a toast to whoever happens to be looking. That is
// right for "we won the bid" and useless for "your truck's oil change is
// overdue" — the driver it concerns was clocked out when the cron ran, and a
// toast nobody saw is indistinguishable from no notification at all.
//
// employee_notifications rows are addressed to one employee and wait until
// read. This lists the unread ones. Tapping one goes where it points and
// marks it read; the X marks it read without going anywhere. Nothing here
// decides what gets said — triggers and the PM cron do that — this is only the
// place it lands.
//
// Deliberately not a bell with a badge in the header. Drivers do not tour the
// app; they open Field Scout, clock in, and work. The list lives there.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, Wrench, CalendarClock, CheckCircle2, Bell, X, Megaphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

const ICON = {
  fleet_request_filed: ShieldAlert,
  fleet_pm_overdue: CalendarClock,
  fleet_pm_due_soon: CalendarClock,
  fleet_request_acknowledged: CheckCircle2,
  fleet_request_scheduled: CheckCircle2,
  fleet_request_resolved: CheckCircle2,
  fleet_request_declined: Wrench,
  marketing_capture: Megaphone,
  marketing_drafts_ready: Megaphone,
}
// Severity is colour, and only the two that need to interrupt are loud.
const TONE = {
  fleet_request_filed: '#b91c1c',
  fleet_pm_overdue: '#b91c1c',
  fleet_pm_due_soon: '#8a6d08',
}

export default function MyNotifications({ theme }) {
  const navigate = useNavigate()
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  const me = useMemo(() => (employees || []).find(e => e.email === user?.email) || null, [employees, user])
  const meId = me?.id ?? null

  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!meId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('employee_notifications')
        .select('id,type,title,message,route,created_at')
        .eq('employee_id', meId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!cancelled) setRows(data || [])
    })()
    return () => { cancelled = true }
  }, [meId])

  const markRead = async (id) => {
    // Optimistic: the row leaves the list now, the write follows. A failed
    // write brings it back next load, which is the right failure mode.
    setRows(r => r.filter(x => x.id !== id))
    await supabase.from('employee_notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  }

  if (!meId || !rows.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Bell size={14} style={{ color: theme.textMuted }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          For you
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(n => {
          const Icon = ICON[n.type] || Bell
          const tone = TONE[n.type] || theme.textSecondary
          return (
            <div key={n.id} style={{
              display: 'flex', alignItems: 'stretch', gap: 0,
              background: theme.bgCard, border: `1px solid ${theme.border}`,
              borderLeft: `3px solid ${tone}`, borderRadius: 10, overflow: 'hidden',
            }}>
              <button
                onClick={() => { markRead(n.id); if (n.route) navigate(n.route) }}
                style={{
                  flex: 1, minWidth: 0, minHeight: 56, padding: '10px 12px', textAlign: 'left',
                  border: 'none', background: 'transparent', cursor: n.route ? 'pointer' : 'default',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}
              >
                <Icon size={16} style={{ color: tone, flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{n.title}</div>
                  {n.message && <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{n.message}</div>}
                </div>
              </button>
              <button onClick={() => markRead(n.id)} title="Dismiss" aria-label="Dismiss"
                style={{ width: 44, border: 'none', borderLeft: `1px solid ${theme.border}`, background: 'transparent', cursor: 'pointer', color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
