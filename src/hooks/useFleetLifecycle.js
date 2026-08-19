// Assemble lifecycle inputs for a set of assets, in one query pass.
//
// The maths lives in lib/fleetLifecycle.js. This is the part that goes and
// gets the numbers, and it exists as a hook rather than inline in each page
// so the fleet grid, the vehicle detail screen and any future report all ask
// the same question and get the same answer. The cost of getting this wrong
// is a fleet list and a detail page disagreeing about whether to sell a
// machine, which destroys trust in both.
//
// Batched deliberately: one query per table for the whole fleet rather than
// per asset. A 40-machine yard would otherwise fire 160 requests to draw one
// grid.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { computeLifecycle, utilisation, recommend, curveFor } from '../lib/fleetLifecycle'

const DAY = 86_400_000

/** Group rows by a numeric foreign key. */
function groupBy(rows, key) {
  const out = new Map()
  for (const r of rows || []) {
    const k = r[key]
    if (k === null || k === undefined) continue
    const list = out.get(k) || []
    list.push(r)
    out.set(k, list)
  }
  return out
}

export function useFleetLifecycle(fleetRows) {
  const companyId = useStore(s => s.companyId)
  const [data, setData] = useState(null)
  // Sampled once rather than read during render: asset age moves by the day,
  // not the frame, and calling the clock mid-render makes every derived
  // number unstable across re-renders.
  const [now] = useState(() => Date.now())

  const ids = useMemo(
    () => (fleetRows || []).map(f => f.id).filter(Boolean).sort((a, b) => a - b),
    [fleetRows],
  )
  const idKey = ids.join(',')

  useEffect(() => {
    if (!companyId || !ids.length) return
    let cancelled = false

    ;(async () => {
      const inList = `(${ids.join(',')})`
      const [meters, repairs, maintenance, fuel, overrides] = await Promise.all([
        supabase.from('fleet_current_meters').select('fleet_id,engine_hours,idle_hours,odometer_miles,recorded_at,source').eq('company_id', companyId),
        supabase.from('fleet_repairs').select('fleet_id,cost,category').eq('company_id', companyId).filter('fleet_id', 'in', inList),
        supabase.from('fleet_maintenance').select('asset_id,cost').eq('company_id', companyId).filter('asset_id', 'in', inList),
        supabase.from('fleet_fuel_logs').select('fleet_id,total_cost').eq('company_id', companyId),
        supabase.from('fleet_value_overrides').select('fleet_id,value,as_of').eq('company_id', companyId).order('as_of', { ascending: false }),
      ])
      if (cancelled) return
      setData({
        meters: meters.data || [],
        repairs: repairs.data || [],
        maintenance: maintenance.data || [],
        // fleet_fuel_logs uses fleet_id in the migration but asset_id in the
        // code that writes it; tolerate both rather than silently drop fuel.
        fuel: (fuel.data || []).map(r => ({ ...r, fleet_id: r.fleet_id ?? r.asset_id })),
        overrides: overrides.data || [],
      })
    })().catch(() => { if (!cancelled) setData({}) })   // failed is loaded, just empty

    return () => { cancelled = true }
  }, [companyId, idKey])

  const loading = Boolean(companyId) && ids.length > 0 && data === null

  return useMemo(() => {
    const d = data || {}
    const meterBy = new Map((d.meters || []).map(m => [m.fleet_id, m]))
    const repairBy = groupBy(d.repairs, 'fleet_id')
    const maintBy = groupBy(d.maintenance, 'asset_id')
    const fuelBy = groupBy(d.fuel, 'fleet_id')
    const overrideBy = new Map()
    for (const o of d.overrides || []) if (!overrideBy.has(o.fleet_id)) overrideBy.set(o.fleet_id, o.value)

    const byId = new Map()
    for (const f of fleetRows || []) {
      const basis = f.meter_basis || curveFor(f.asset_class).basis
      const meter = meterBy.get(f.id)

      // The reading the asset is actually valued on. A manual dash entry beats
      // telematics: the tracker knows only what it has watched since install,
      // and a truck bought used carries miles nobody observed.
      const raw = basis === 'hours' ? meter?.engine_hours : meter?.odometer_miles
      const anchored = meter?.source === 'manual' || meter?.source === 'import' || meter?.source === 'maintenance'
      const meterUsed = raw === null || raw === undefined ? null : Number(raw)

      const ageYears = f.purchase_date
        ? Math.max(0, (now - new Date(f.purchase_date).getTime()) / (365 * DAY))
        : null
      const daysOwned = f.purchase_date
        ? Math.max(0, (now - new Date(f.purchase_date).getTime()) / DAY)
        : null

      const sum = (rows, key) => (rows || []).reduce((t, r) => t + (Number(r[key]) || 0), 0)

      const lifecycle = computeLifecycle({
        purchasePrice: f.purchase_price,
        assetClass: f.asset_class,
        meterUsed,
        meterAtPurchase: basis === 'hours' ? f.hours_at_purchase : f.miles_at_purchase,
        meterAnchored: anchored,
        ageYears,
        maintenanceSpend: sum(maintBy.get(f.id), 'cost'),
        repairSpend: sum(repairBy.get(f.id), 'cost'),
        fuelSpend: sum(fuelBy.get(f.id), 'total_cost'),
        overrideValue: overrideBy.get(f.id) ?? null,
      })

      const util = utilisation({
        meterUsed,
        daysOwned,
        curve: curveFor(f.asset_class),
      })

      byId.set(f.id, {
        lifecycle,
        utilisation: util,
        recommendation: recommend(lifecycle, util),
        meter,
      })
    }
    return { byId, loading }
  }, [fleetRows, data, loading, now])
}

export default useFleetLifecycle
