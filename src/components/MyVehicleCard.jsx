// The machine this person is assigned to, on the screen they open every day.
//
// "Where do I request a repair if I'm a user and click on my assigned
// vehicle?" — until now the answer was "find Fleet in the menu, find your
// truck in the list, open it, scroll". A driver will not do that at 6:40am
// with a coffee in the other hand. This is the one tap that gets them there,
// and it says what is due before they tap.
//
// Shows nothing for someone with no assignment and nothing when Freddy is not
// recruited (the Fleet routes are locked without him, and a card that leads
// to a paywall is worse than no card).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, ChevronRight, ShieldAlert, CalendarClock, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

export default function MyVehicleCard({ theme }) {
  const navigate = useNavigate()
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  const companyId = useStore(s => s.companyId)
  const hasAgent = useStore(s => s.hasAgent)
  const me = useMemo(() => (employees || []).find(e => e.email === user?.email) || null, [employees, user])
  const meId = me?.id ?? null
  const freddy = typeof hasAgent === 'function' ? hasAgent('freddy-fleet') : false

  const [assets, setAssets] = useState([])
  const [state, setState] = useState(new Map())   // fleet_id → { overdue, dueSoon, unsafe, requests }

  useEffect(() => {
    if (!meId || !companyId || !freddy) return
    let cancelled = false
    ;(async () => {
      const { data: mine } = await supabase
        .from('fleet').select('id,name,asset_id,type').eq('company_id', companyId).eq('assigned_to', meId)
      if (cancelled) return
      const list = mine || []
      setAssets(list)
      if (!list.length) return
      const ids = list.map(a => a.id)
      const [pm, rq] = await Promise.all([
        supabase.from('fleet_pm_status').select('fleet_id,status').in('fleet_id', ids).in('status', ['overdue', 'due_soon']),
        supabase.from('fleet_service_requests').select('fleet_id,severity').in('fleet_id', ids).in('status', ['open', 'acknowledged', 'scheduled']),
      ])
      if (cancelled) return
      const m = new Map()
      const bump = (id, k) => { const e = m.get(id) || { overdue: 0, dueSoon: 0, unsafe: 0, requests: 0 }; e[k]++; m.set(id, e) }
      for (const s of pm.data || []) bump(s.fleet_id, s.status === 'overdue' ? 'overdue' : 'dueSoon')
      for (const r of rq.data || []) { bump(r.fleet_id, 'requests'); if (r.severity === 'safety') bump(r.fleet_id, 'unsafe') }
      setState(m)
    })()
    return () => { cancelled = true }
  }, [meId, companyId, freddy])

  if (!freddy || !assets.length) return null

  return (
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {assets.map(a => {
        const f = state.get(a.id) || {}
        const line = f.unsafe ? { icon: ShieldAlert, tone: '#b91c1c', text: 'Reported unsafe to run' }
          : f.overdue ? { icon: CalendarClock, tone: '#b91c1c', text: `${f.overdue} service${f.overdue === 1 ? '' : 's'} overdue` }
          : f.dueSoon ? { icon: CalendarClock, tone: '#8a6d08', text: `${f.dueSoon} due soon` }
          : f.requests ? { icon: Wrench, tone: '#c2410c', text: `${f.requests} open request${f.requests === 1 ? '' : 's'}` }
          : { icon: null, tone: theme.textMuted, text: 'Nothing due · tap to report a problem' }
        const Icon = line.icon
        return (
          <button key={a.id} onClick={() => navigate(`/fleet/${a.id}`)} style={{
            display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '12px 14px', textAlign: 'left',
            background: theme.bgCard, border: `1px solid ${f.unsafe ? '#b91c1c' : theme.border}`, borderRadius: 12, cursor: 'pointer',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Truck size={20} style={{ color: theme.accent }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Your {a.type === 'Equipment' ? 'machine' : 'vehicle'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              <div style={{ fontSize: 12, color: line.tone, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                {Icon && <Icon size={12} />} {line.text}
              </div>
            </div>
            <ChevronRight size={18} style={{ color: theme.textMuted, flexShrink: 0 }} />
          </button>
        )
      })}
    </div>
  )
}
