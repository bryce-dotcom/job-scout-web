import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useFleetLifecycle } from '../../../hooks/useFleetLifecycle'
import LifecycleBar from '../../../components/LifecycleBar'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  DollarSign, Fuel, Wrench, TrendingUp, Plus, X, Save,
  ChevronUp, ChevronDown, Truck, Calculator, Loader2, AlertTriangle
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)

const emptyFuelForm = {
  asset_id: '',
  date: new Date().toISOString().split('T')[0],
  gallons: '',
  cost_per_gallon: '',
  total_cost: '',
  odometer: '',
  notes: '',
}

export default function FreddyCosts() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const navigate = useNavigate()

  const companyId = useStore(s => s.companyId)
  const fleet = useStore(s => s.fleet)
  const fleetMaintenance = useStore(s => s.fleetMaintenance)

  const [fuelLogs, setFuelLogs] = useState([])
  const [loadingFuel, setLoadingFuel] = useState(false)
  const [showFuelModal, setShowFuelModal] = useState(false)
  const [fuelForm, setFuelForm] = useState(emptyFuelForm)
  const [savingFuel, setSavingFuel] = useState(false)
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // Fetch fuel logs
  const fetchFuelLogs = async () => {
    if (!companyId) return
    setLoadingFuel(true)
    try {
      const { data, error } = await supabase
        .from('fleet_fuel_logs')
        // fleet_id / log_date, not asset_id / date. The page has been using
        // the latter since it was written, which is why no fuel has ever
        // been saved and every fuel figure on this screen is zero.
        .select('*, asset:fleet!fleet_id(id, name, asset_id)')
        .eq('company_id', companyId)
        .order('log_date', { ascending: false })
      if (!error) setFuelLogs(data || [])
    } catch (e) {
      console.error('Error fetching fuel logs:', e)
    } finally {
      setLoadingFuel(false)
    }
  }

  useEffect(() => {
    fetchFuelLogs()
  }, [companyId])

  // Auto-calculate total cost when gallons or cost_per_gallon changes
  useEffect(() => {
    const gallons = parseFloat(fuelForm.gallons)
    const cpg = parseFloat(fuelForm.cost_per_gallon)
    if (gallons > 0 && cpg > 0) {
      setFuelForm(prev => ({ ...prev, total_cost: (gallons * cpg).toFixed(2) }))
    }
  }, [fuelForm.gallons, fuelForm.cost_per_gallon])

  // Calculations
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const recentFuelLogs = useMemo(() =>
    fuelLogs.filter(f => new Date(f.log_date) >= thirtyDaysAgo),
    [fuelLogs]
  )

  const recentMaintenance = useMemo(() =>
    fleetMaintenance.filter(m => new Date(m.date) >= thirtyDaysAgo),
    [fleetMaintenance]
  )

  const totalFuelCost30d = useMemo(() =>
    recentFuelLogs.reduce((sum, f) => sum + (parseFloat(f.total_cost) || 0), 0),
    [recentFuelLogs]
  )

  const totalMaintenanceCost30d = useMemo(() =>
    recentMaintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0),
    [recentMaintenance]
  )

  // Every asset's modelled worth, from the same engine the lifecycle bar uses.
  // This previously summed fleet.current_value — a column that has never
  // existed — so the headline value of the entire fleet was reliably $0.
  const { byId: lifecycleById } = useFleetLifecycle(fleet)

  const { fleetValue, valuedCount } = useMemo(() => {
    let total = 0
    let counted = 0
    for (const v of fleet) {
      const value = lifecycleById.get(v.id)?.lifecycle?.value
      if (typeof value === 'number') { total += value; counted++ }
    }
    return { fleetValue: total, valuedCount: counted }
  }, [fleet, lifecycleById])

  // Per-vehicle cost breakdown
  const vehicleCosts = useMemo(() => {
    return fleet.map(vehicle => {
      const vFuel = fuelLogs.filter(f => f.fleet_id === vehicle.id)
      const vMaint = fleetMaintenance.filter(m => m.asset_id === vehicle.id)

      const fuelCost = vFuel.reduce((s, f) => s + (parseFloat(f.total_cost) || 0), 0)
      const maintCost = vMaint.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0)
      // The tracked meter, not fleet.mileage_hours — that field is hand-typed
      // and stops being true the moment a tracker is fitted, which is how this
      // table showed '--' miles for a truck with 3,898 on the clock.
      const lc = lifecycleById.get(vehicle.id)
      const meter = lc?.meter
      const basis = vehicle.meter_basis === 'hours' ? 'hours' : 'miles'
      const tracked = basis === 'hours' ? meter?.engine_hours : meter?.odometer_miles
      const totalMiles = parseFloat(tracked ?? vehicle.mileage_hours) || 0

      // Running cost per unit. Deliberately NOT the lifecycle's figure, which
      // includes depreciation: this column sits beside fuel and maintenance
      // and must mean the same kind of thing they do. Depreciation has its own
      // home on the lifecycle bar, where it can be explained.
      const costPerMile = totalMiles > 0 ? (fuelCost + maintCost) / totalMiles : 0

      // True cost of ownership is what it has cost so far MINUS what it is
      // still worth — not the purchase price plus running costs, which counts
      // the whole purchase as spent while the machine is still sellable.
      const purchasePrice = parseFloat(vehicle.purchase_price) || 0
      const residual = typeof lc?.lifecycle?.value === 'number' ? lc.lifecycle.value : null
      const tco = purchasePrice
        ? (residual === null ? purchasePrice + fuelCost + maintCost
                             : (purchasePrice - residual) + fuelCost + maintCost)
        : fuelCost + maintCost

      return {
        ...vehicle,
        fuelCost,
        maintCost,
        totalMiles,
        costPerMile,
        tco,
      }
    })
  }, [fleet, fuelLogs, fleetMaintenance])

  // Fleet-wide avg cost per mile
  const avgCostPerMile = useMemo(() => {
    const totalMiles = vehicleCosts.reduce((s, v) => s + v.totalMiles, 0)
    const totalCosts = vehicleCosts.reduce((s, v) => s + v.fuelCost + v.maintCost, 0)
    return totalMiles > 0 ? totalCosts / totalMiles : 0
  }, [vehicleCosts])

  // Sorting
  const sortedVehicleCosts = useMemo(() => {
    const sorted = [...vehicleCosts]
    sorted.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [vehicleCosts, sortField, sortDir])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleSaveFuel = async () => {
    if (!fuelForm.asset_id || !fuelForm.date) return
    setSavingFuel(true)
    try {
      const payload = {
        company_id: companyId,
        fleet_id: parseInt(fuelForm.asset_id),
        log_date: fuelForm.date,
        gallons: parseFloat(fuelForm.gallons) || 0,
        cost_per_gallon: parseFloat(fuelForm.cost_per_gallon) || 0,
        total_cost: parseFloat(fuelForm.total_cost) || 0,
        odometer: parseFloat(fuelForm.odometer) || null,
        notes: fuelForm.notes || null,
      }
      const { error } = await supabase.from('fleet_fuel_logs').insert(payload)
      if (error) throw error

      // Update vehicle odometer if provided
      if (fuelForm.odometer) {
        await supabase
          .from('fleet')
          .update({ mileage_hours: parseInt(fuelForm.odometer) })
          .eq('id', parseInt(fuelForm.asset_id))

        // Also record it as a meter reading. A human reading a pump receipt
        // is exactly the anchor telematics cannot supply — a tracker only
        // knows miles since it was fitted — and it is the difference between
        // a lifecycle bar that can be drawn and one that cannot.
        await supabase.from('fleet_meter_readings').insert({
          company_id: companyId,
          fleet_id: parseInt(fuelForm.asset_id),
          recorded_at: new Date(`${fuelForm.date}T12:00:00`).toISOString(),
          odometer_miles: parseFloat(fuelForm.odometer),
          source: 'manual',
          notes: 'Odometer captured with a fuel entry',
        })
      }

      setShowFuelModal(false)
      setFuelForm(emptyFuelForm)
      await fetchFuelLogs()
    } catch (e) {
      console.error('Error saving fuel log:', e)
      alert('Failed to save fuel entry: ' + (e.message || 'Unknown error'))
    } finally {
      setSavingFuel(false)
    }
  }

  // Styles
  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: isMobile ? '14px' : '20px',
    boxShadow: theme.shadow,
  }

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 18px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    minHeight: '44px',
    minWidth: '44px',
  }

  const outlineButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'transparent',
    color: theme.accent,
    border: `1px solid ${theme.border}`,
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none',
    minHeight: '44px',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    const Icon = sortDir === 'asc' ? ChevronUp : ChevronDown
    return <Icon size={12} style={{ marginLeft: '2px' }} />
  }

  const thStyle = (field) => ({
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${theme.border}`,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    backgroundColor: sortField === field ? theme.accentBg : 'transparent',
  })

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
          Fleet Economics
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>
          Cost per mile, fuel logs, and total cost of ownership
        </p>
      </div>

      {/* Fleet-wide Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap: '12px',
        marginBottom: '24px',
      }}>
        {[
          {
            icon: TrendingUp,
            label: 'Avg Cost / Mile',
            value: avgCostPerMile > 0 ? `$${avgCostPerMile.toFixed(2)}` : '$0.00',
            color: theme.accent,
          },
          {
            icon: Fuel,
            label: 'Fuel Cost (30d)',
            value: formatCurrency(totalFuelCost30d),
            color: '#3b82f6',
          },
          {
            icon: Wrench,
            label: 'Maintenance (30d)',
            value: formatCurrency(totalMaintenanceCost30d),
            color: '#eab308',
          },
          {
            icon: DollarSign,
            label: 'Fleet Value',
            value: formatCurrency(fleetValue),
            // Coverage matters more than the total. An asset with no purchase
            // price contributes nothing, so a bare number reads as the whole
            // fleet being worth less than it is rather than as partly unknown.
            sub: fleet.length
              ? (valuedCount === fleet.length ? 'all assets valued' : `${valuedCount} of ${fleet.length} valued`)
              : null,
            color: '#22c55e',
          },
        ].map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: `${stat.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={16} style={{ color: stat.color }} />
                </div>
              </div>
              <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: theme.text, marginBottom: '2px' }}>
                {stat.value}
              </div>
                  {stat.sub && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                      {stat.sub}
                    </div>
                  )}
              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {stat.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Per-Vehicle Cost Table */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600', color: theme.text }}>
          Per-Vehicle Costs
        </h3>

        {fleet.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: theme.textMuted, fontSize: '14px' }}>
            <Truck size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <p style={{ margin: 0 }}>No vehicles in your fleet yet.</p>
          </div>
        ) : !isMobile ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle('name')} onClick={() => handleSort('name')}>
                    Vehicle <SortIcon field="name" />
                  </th>
                  <th style={thStyle('totalMiles')} onClick={() => handleSort('totalMiles')}>
                    Total Miles <SortIcon field="totalMiles" />
                  </th>
                  <th style={thStyle('fuelCost')} onClick={() => handleSort('fuelCost')}>
                    Fuel Cost <SortIcon field="fuelCost" />
                  </th>
                  <th style={thStyle('maintCost')} onClick={() => handleSort('maintCost')}>
                    Maintenance <SortIcon field="maintCost" />
                  </th>
                  <th style={thStyle('costPerMile')} onClick={() => handleSort('costPerMile')}>
                    Cost / Mile <SortIcon field="costPerMile" />
                  </th>
                  <th style={thStyle('tco')} onClick={() => handleSort('tco')}>
                    TCO <SortIcon field="tco" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedVehicleCosts.map((v, idx) => (
                  <tr
                    key={v.id}
                    style={{ borderBottom: idx < sortedVehicleCosts.length - 1 ? `1px solid ${theme.border}` : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.accentBg}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: theme.text }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Truck size={14} style={{ color: theme.accent }} />
                        {v.name}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary }}>
                      {v.totalMiles > 0 ? v.totalMiles.toLocaleString() : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary }}>
                      {v.fuelCost > 0 ? formatCurrency(v.fuelCost) : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary }}>
                      {v.maintCost > 0 ? formatCurrency(v.maintCost) : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: v.costPerMile > 0.50 ? '#ef4444' : theme.text }}>
                      {v.costPerMile > 0 ? `$${v.costPerMile.toFixed(2)}` : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: theme.text }}>
                      {v.tco > 0 ? formatCurrency(v.tco) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Phone: a card per machine, led by the number that matters.
             The old version was eight label:value pairs at 12px — every
             figure the same weight, so nothing was findable at arm's length
             on a job site. Cost per mile is why anyone opens this screen, so
             it is the only thing set large; the rest supports it. */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedVehicleCosts.map(v => {
              const lc = lifecycleById.get(v.id)
              const basis = v.meter_basis === 'hours' ? 'hr' : 'mi'
              return (
                <div
                  key={v.id}
                  onClick={() => navigate(`/fleet/${v.id}`)}
                  style={{
                    padding: '14px',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '12px',
                    background: theme.bg,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.name}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: 2 }}>
                        {v.totalMiles > 0 ? `${v.totalMiles.toLocaleString()} ${basis}` : 'no meter reading'}
                        {v.asset_id ? ` · ${v.asset_id}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontSize: '22px', fontWeight: 700, lineHeight: 1.1,
                        color: v.costPerMile > 0.5 ? '#c2410c' : theme.text,
                      }}>
                        {v.costPerMile > 0 ? `$${v.costPerMile.toFixed(2)}` : '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: theme.textMuted }}>per {basis} to run</div>
                    </div>
                  </div>

                  {/* Running costs, small and secondary — they explain the
                      number above rather than competing with it. */}
                  <div style={{ display: 'flex', gap: '14px', marginTop: '10px', fontSize: '12px', flexWrap: 'wrap' }}>
                    <span style={{ color: theme.textMuted }}>
                      Fuel <strong style={{ color: theme.textSecondary }}>{v.fuelCost > 0 ? formatCurrency(v.fuelCost) : '—'}</strong>
                    </span>
                    <span style={{ color: theme.textMuted }}>
                      Maint <strong style={{ color: theme.textSecondary }}>{v.maintCost > 0 ? formatCurrency(v.maintCost) : '—'}</strong>
                    </span>
                    <span style={{ color: theme.textMuted }}>
                      Owned <strong style={{ color: theme.textSecondary }}>{v.tco > 0 ? formatCurrency(v.tco) : '—'}</strong>
                    </span>
                  </div>

                  {/* The lifecycle bar belongs here too. Cost per mile says
                      what it costs to run; only this says whether owning it
                      still makes sense, which is the larger number by far. */}
                  {lc?.lifecycle && (
                    <LifecycleBar lifecycle={lc.lifecycle} recommendation={lc.recommendation} theme={theme} compact />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fuel Log Section */}
      <div style={cardStyle}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: theme.text }}>
            Fuel Log
          </h3>
          <button
            onClick={() => { setFuelForm(emptyFuelForm); setShowFuelModal(true) }}
            style={outlineButtonStyle}
          >
            <Plus size={16} />
            Add Entry
          </button>
        </div>

        {loadingFuel ? (
          <div style={{ textAlign: 'center', padding: '24px', color: theme.textMuted }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : fuelLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: theme.textMuted, fontSize: '14px' }}>
            <Fuel size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <p style={{ margin: 0 }}>No fuel entries yet. Add your first fuel log to start tracking costs.</p>
          </div>
        ) : !isMobile ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Vehicle', 'Gallons', '$/Gallon', 'Total Cost', 'Odometer', 'Notes'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: `1px solid ${theme.border}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fuelLogs.slice(0, 50).map((log, idx) => (
                  <tr
                    key={log.id}
                    style={{ borderBottom: idx < Math.min(fuelLogs.length, 50) - 1 ? `1px solid ${theme.border}` : 'none' }}
                  >
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                      {new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '500', color: theme.text }}>
                      {log.asset?.name || 'Unknown'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary }}>
                      {parseFloat(log.gallons).toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary }}>
                      {formatCurrency(log.cost_per_gallon)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: theme.text }}>
                      {formatCurrency(log.total_cost)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary }}>
                      {log.odometer ? parseInt(log.odometer).toLocaleString() : '--'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: theme.textMuted, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.notes || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {fuelLogs.slice(0, 50).map(log => (
              <div key={log.id} style={{
                padding: '12px',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                    {log.asset?.name || 'Unknown'}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: theme.accent }}>
                    {formatCurrency(log.total_cost)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '4px', fontSize: '12px', color: theme.textSecondary }}>
                  <div>{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  <div>{parseFloat(log.gallons).toFixed(1)} gal @ {formatCurrency(log.cost_per_gallon)}</div>
                  {log.odometer && <div>Odo: {parseInt(log.odometer).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Fuel Entry Modal */}
      {showFuelModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowFuelModal(false) }}
        >
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            width: isMobile ? '100%' : '480px',
            maxWidth: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: theme.text }}>
                Add Fuel Entry
              </h3>
              <button
                onClick={() => setShowFuelModal(false)}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  minHeight: '44px',
                  minWidth: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Vehicle *</label>
                <select
                  value={fuelForm.asset_id}
                  onChange={e => setFuelForm(prev => ({ ...prev, asset_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select Vehicle</option>
                  {fleet.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Date *</label>
                <input
                  type="date"
                  value={fuelForm.date}
                  onChange={e => setFuelForm(prev => ({ ...prev, date: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Gallons</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fuelForm.gallons}
                    onChange={e => setFuelForm(prev => ({ ...prev, gallons: e.target.value }))}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Cost per Gallon</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fuelForm.cost_per_gallon}
                    onChange={e => setFuelForm(prev => ({ ...prev, cost_per_gallon: e.target.value }))}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Total Cost</label>
                <input
                  type="number"
                  step="0.01"
                  value={fuelForm.total_cost}
                  onChange={e => setFuelForm(prev => ({ ...prev, total_cost: e.target.value }))}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Odometer Reading</label>
                <input
                  type="number"
                  value={fuelForm.odometer}
                  onChange={e => setFuelForm(prev => ({ ...prev, odometer: e.target.value }))}
                  placeholder="Current mileage"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Notes</label>
                <input
                  type="text"
                  value={fuelForm.notes}
                  onChange={e => setFuelForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
            }}>
              <button
                onClick={() => setShowFuelModal(false)}
                style={outlineButtonStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFuel}
                disabled={savingFuel || !fuelForm.asset_id}
                style={{
                  ...buttonStyle,
                  opacity: (savingFuel || !fuelForm.asset_id) ? 0.6 : 1,
                }}
              >
                {savingFuel ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                Save Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
