// What a lighting retrofit saves in a year — the SERVER twin of
// src/lib/lightingSavings.js. Keep the two in step; the browser twin's tests
// name every branch.
//
// A commercial bill meters ENERGY (¢/kWh) and DEMAND ($/kW on the month's
// peak fifteen minutes). lenard-save used to compute only the first, with its
// own defaults (12 h / 365 d / $0.10) that matched neither Lenard page — a
// third copy of one rule. Bryce, 2026-09-29, on a diesel shop's takeoff:
// "the payback says 1200, it should be double that."

export function kwReduced(wattsReduced: unknown): number {
  const w = Number(wattsReduced)
  return Number.isFinite(w) && w > 0 ? w / 1000 : 0
}

export function computeLightingSavings({
  wattsReduced = 0, operatingHours = 0, operatingDays = 0, electricRate = 0, demandChargePerKw = 0, demandCoincidence = 0.8,
}: { wattsReduced?: unknown; operatingHours?: unknown; operatingDays?: unknown; electricRate?: unknown; demandChargePerKw?: unknown; demandCoincidence?: unknown } = {}) {
  const hours = Math.max(0, Number(operatingHours) || 0)
  const days = Math.max(0, Number(operatingDays) || 0)
  const rate = Math.max(0, Number(electricRate) || 0)
  const kw = kwReduced(wattsReduced)
  const annualHours = hours * days
  const annualKwh = kw * annualHours
  const energyDollars = annualKwh * rate
  const dc = Math.max(0, Number(demandChargePerKw) || 0)
  const cfRaw = Number(demandCoincidence)
  const cf = Math.min(1, Math.max(0, Number.isFinite(cfRaw) ? cfRaw : 0.8))
  const demandDollars = kw * dc * 12 * cf
  return { kwReduced: kw, annualKwh, energyDollars, demandDollars, totalDollars: energyDollars + demandDollars }
}

export function savingsForStorage(input: Parameters<typeof computeLightingSavings>[0]) {
  const s = computeLightingSavings(input)
  return {
    annual_savings_kwh: Math.round(s.annualKwh) || 0,
    annual_savings_dollars: Math.round(s.totalDollars * 100) / 100 || 0,
  }
}

/** The company's demand settings, as the store reads them (settings rows are JSON strings). */
export async function readDemandSettings(baseUrl: string, headers: Record<string, string>, companyId: number): Promise<{ demandChargePerKw: number; demandCoincidence: number }> {
  const out = { demandChargePerKw: 0, demandCoincidence: 0.8 }
  try {
    const r = await fetch(`${baseUrl}/rest/v1/settings?select=key,value&company_id=eq.${companyId}&key=in.(lighting_demand_charge_per_kw,lighting_demand_coincidence)`, { headers })
    const rows: Array<{ key: string; value: string }> = r.ok ? await r.json() : []
    for (const row of rows) {
      let v: unknown = row.value
      try { v = JSON.parse(String(row.value)) } catch { /* raw number */ }
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) continue
      if (row.key === 'lighting_demand_charge_per_kw') out.demandChargePerKw = n
      if (row.key === 'lighting_demand_coincidence') out.demandCoincidence = n
    }
  } catch { /* defaults: no demand half claimed */ }
  return out
}
