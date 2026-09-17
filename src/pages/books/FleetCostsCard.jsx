// Fleet costs on the Money tab, from the fleet tables (fuel logs,
// maintenance, repairs, recurring costs, meter readings). Informational:
// fuel and repairs paid by card are already in the bank feed, so this is
// not added to Money Out — it is the per-vehicle view of that spend.
import { useState, useEffect } from 'react'
import { Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { fleetSpend, milesByVehicle, standardMileageDeduction, IRS_MILEAGE_RATE_DEFAULT } from '../../lib/fleetBooks'

export default function FleetCostsCard({ companyId, theme, statCardStyle, formatCurrency, isThisMonth, navigate }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    const t = setTimeout(async () => {
      const yearStart = `${new Date().getFullYear()}-01-01`
      // '*' on the fleet log tables on purpose: two column spellings exist
      // (fleet_id/log_date and asset_id/date) and the lib accepts both.
      const [fleet, fuel, maint, repairs, recurring, readings, rate] = await Promise.all([
        supabase.from('fleet').select('id, name, asset_id, mileage_hours').eq('company_id', companyId),
        supabase.from('fleet_fuel_logs').select('*').eq('company_id', companyId).limit(5000),
        supabase.from('fleet_maintenance').select('*').eq('company_id', companyId).limit(5000),
        supabase.from('fleet_repairs').select('*').eq('company_id', companyId).limit(5000),
        supabase.from('fleet_recurring_costs').select('*').eq('company_id', companyId),
        supabase.from('fleet_meter_readings').select('*').eq('company_id', companyId).gte('recorded_at', yearStart).limit(20000),
        supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'irs_mileage_rate').maybeSingle(),
      ])
      if (!alive) return
      let mileageRate = IRS_MILEAGE_RATE_DEFAULT
      try { const v = rate.data?.value ? parseFloat(JSON.parse(rate.data.value)) : NaN; if (Number.isFinite(v) && v > 0) mileageRate = v } catch { /* default */ }
      setData({ fleet: fleet.data || [], fuelLogs: fuel.data || [], maintenance: maint.data || [], repairs: repairs.data || [], recurringCosts: recurring.data || [], meterReadings: readings.data || [], mileageRate })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId])

  if (!data || data.fleet.length === 0) return null
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const month = fleetSpend(data, isThisMonth, { days: daysInMonth })
  const year = new Date().getFullYear()
  const inYear = (d) => String(d || '').startsWith(`${year}-`)
  const milesYear = [...milesByVehicle(data.meterReadings, inYear).values()].reduce((s, m) => s + m, 0)
  const ytd = fleetSpend(data, inYear, { days: Math.max(1, Math.round((now - new Date(year, 0, 1)) / 86400000)) })
  if (month.total === 0 && ytd.total === 0 && milesYear === 0) return null

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck size={16} style={{ color: theme.accent }} /> Fleet costs
          <HelpBadge text="Fuel logs, maintenance, repairs and the recurring costs (insurance, registration, telematics) prorated to the month, per vehicle. Miles come from meter readings. Not added to Money Out: fuel and repairs paid by card are already in your bank feed; this is the per-vehicle view. Year-to-date miles × the IRS standard rate is what a mileage-based deduction would be worth, for the CPA to compare against actual costs." />
        </h3>
        <button onClick={() => navigate('/fleet')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>Open Fleet</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px' }}>
        {[
          ['This month', formatCurrency(month.total)],
          ['Fuel', formatCurrency(month.byKind.fuel)],
          ['Maintenance + repairs', formatCurrency(month.byKind.maintenance + month.byKind.repairs)],
          ['Recurring', formatCurrency(month.byKind.recurring)],
          ['Cost / mile (this month)', month.costPerMile != null ? `$${month.costPerMile.toFixed(2)}` : '—'],
        ].map(([l, v]) => (
          <div key={l} style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{l}</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>{v}</div>
          </div>
        ))}
      </div>
      {month.rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {month.rows.slice(0, 5).map(r => (
            <div key={r.fleetId ?? 'none'} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto auto', gap: '10px', fontSize: '12px', color: theme.textSecondary }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span>{formatCurrency(r.total)}</span>
              <span style={{ minWidth: '70px', textAlign: 'right' }}>{r.costPerMile != null ? `$${r.costPerMile.toFixed(2)}/mi` : r.miles ? `${Math.round(r.miles)} mi` : ''}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: '10px', fontSize: '12px', color: theme.textMuted }}>
        {year} so far: {formatCurrency(ytd.total)} across the fleet
        {milesYear > 0 ? ` · ${Math.round(milesYear).toLocaleString()} miles logged · standard mileage would be ${formatCurrency(standardMileageDeduction(milesYear, data.mileageRate))} at $${data.mileageRate.toFixed(2)}/mi` : ' · no meter readings this year, so no mileage figure'}
      </div>
    </div>
  )
}
