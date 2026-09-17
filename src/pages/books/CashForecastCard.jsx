// 90-day cash forecast on the Money tab. See lib/cashForecast.js for what
// feeds it. The floor is a company setting ('cash_floor') edited inline.
import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { buildForecast, weeklyBuckets } from '../../lib/cashForecast'

const KIND_LABEL = { invoice: 'Invoice', incentive: 'Incentive', membership: 'Membership', plan: 'Payment plan', bill: 'Bill', tax: 'Tax deposit', payroll: 'Payroll' }

export default function CashForecastCard({ companyId, theme, statCardStyle, formatCurrency, openingCash = 0, inputs = {} }) {
  const [floor, setFloor] = useState(null)
  const [floorDraft, setFloorDraft] = useState('')
  const [editingFloor, setEditingFloor] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'cash_floor').maybeSingle()
      let v = 0
      try { v = data?.value ? parseFloat(JSON.parse(data.value)) : 0 } catch { v = parseFloat(data?.value) || 0 }
      if (alive) setFloor(Number.isFinite(v) ? v : 0)
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId])

  const forecast = useMemo(() => buildForecast({ openingCash, cashFloor: floor || 0, ...inputs }), [openingCash, floor, inputs])
  if (floor === null) return null
  const weeks = weeklyBuckets(forecast.series)
  const upcoming = forecast.events.slice(0, 8)
  const maxAbs = Math.max(1, ...weeks.map(w => Math.max(Math.abs(w.end), Math.abs(w.min))), Math.abs(forecast.opening))
  const lowIsProblem = forecast.low.balance < (floor || 0)

  const saveFloor = async () => {
    const v = parseFloat(floorDraft) || 0
    const { error } = await supabase.from('settings').upsert({ company_id: companyId, key: 'cash_floor', value: JSON.stringify(v) }, { onConflict: 'company_id,key' })
    if (error) { toast.error('Could not save: ' + error.message); return }
    setFloor(v); setEditingFloor(false)
  }

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={16} style={{ color: theme.accent }} /> Cash, next 90 days
          <HelpBadge text="Starts from today's cash across your accounts. Adds open invoices on their due date (overdue ones two weeks out), utility incentives about six weeks after submission, membership renewals and payment-plan installments. Subtracts vendor bills by due date, payroll on each upcoming pay date sized from your last runs, payroll tax deposits by due date, fleet recurring costs, and everyday spend at the rate of your last 90 days of bank activity. Set a floor to be told how many days you'd dip under it." />
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textMuted }}>
          Floor:
          {editingFloor ? (
            <>
              <input type="number" value={floorDraft} onChange={(e) => setFloorDraft(e.target.value)} style={{ width: '90px', padding: '4px 8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '12px' }} />
              <button onClick={saveFloor} style={{ padding: '4px 8px', backgroundColor: theme.accent, border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}><Check size={12} /></button>
            </>
          ) : (
            <button onClick={() => { setFloorDraft(String(floor || '')); setEditingFloor(true) }} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', textDecoration: 'underline', fontSize: '12px', padding: 0 }}>
              {floor ? formatCurrency(floor) : 'set one'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <div style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>Today</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(forecast.opening)}</div>
        </div>
        <div style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>In 90 days</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: forecast.closing >= forecast.opening ? '#22c55e' : theme.text }}>{formatCurrency(forecast.closing)}</div>
        </div>
        <div style={{ padding: '10px 12px', backgroundColor: lowIsProblem ? 'rgba(239,68,68,0.08)' : theme.bg, borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>Low point · {new Date(forecast.low.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: lowIsProblem ? '#ef4444' : theme.text }}>{formatCurrency(forecast.low.balance)}</div>
          {floor > 0 && <div style={{ fontSize: '11px', color: lowIsProblem ? '#ef4444' : theme.textMuted }}>{forecast.daysBelowFloor} day{forecast.daysBelowFloor === 1 ? '' : 's'} under the floor</div>}
        </div>
        <div style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>Everyday spend</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(forecast.baselineDailyBurn)}<span style={{ fontSize: '11px', fontWeight: '400', color: theme.textMuted }}> /day</span></div>
        </div>
      </div>

      {/* Weekly ending balance bars */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, gap: '3px', alignItems: 'end', height: '64px', marginBottom: '4px' }}>
        {weeks.map(w => {
          const h = Math.max(3, Math.round((Math.abs(w.end) / maxAbs) * 60))
          const under = w.min < (floor || 0)
          return (
            <div key={w.from} title={`Week of ${w.from}: in ${formatCurrency(w.in)}, out ${formatCurrency(w.out)}, ending ${formatCurrency(w.end)}`}
              style={{ height: `${h}px`, backgroundColor: w.end < 0 ? '#ef4444' : under ? '#eab308' : theme.accent, borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textMuted, marginBottom: '10px' }}>
        <span>this week</span><span>week 13</span>
      </div>

      {upcoming.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {upcoming.map((e, i) => (
            <div key={`${e.kind}-${e.ref ?? i}-${e.date}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: theme.textSecondary }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {KIND_LABEL[e.kind] || e.kind}: {e.label}
                {e.confidence === 'estimate' ? ' (est.)' : e.confidence === 'overdue' ? ' (overdue)' : ''}
              </span>
              <span style={{ flexShrink: 0, fontWeight: 600, color: e.amount >= 0 ? '#22c55e' : theme.text }}>{e.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(e.amount))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
