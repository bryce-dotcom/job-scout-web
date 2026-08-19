// Insurance, drivers and anything else billed on a calendar.
//
// One panel, two shapes. A cost is either attached to one machine or spread
// across the fleet, and which one it is changes what the machine appears to
// cost to own — so the choice is made visible rather than buried in a dropdown
// somewhere.
//
// The allocation basis matters more than it looks. Splitting a blanket policy
// evenly is the obvious move and usually wrong: an $83,000 truck and a $4,000
// trailer are not the same risk, and charging them equally makes the trailer
// look expensive and the truck cheap. Since this whole layer exists to decide
// which machine to sell, an allocation that distorts that comparison is worse
// than no number. So each cost carries its own basis, defaulted to how that
// kind of cost actually behaves — insurance by value, a driver pool evenly.

import { useEffect, useMemo, useState } from 'react'
import { Shield, Plus, X, AlertTriangle, Users, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  COST_TYPES, ALLOCATIONS, annualAmount, isActiveOn, annualRecurringByAsset,
} from '../lib/fleetRecurringCosts'

const PERIODS = ['weekly', 'monthly', 'quarterly', 'annual']

const money = n => `$${Math.round(Number(n) || 0).toLocaleString()}`
const typeLabel = v => COST_TYPES.find(t => t.value === v)?.label || v

const emptyForm = (fleetId) => ({
  scope: fleetId ? 'unit' : 'fleet',
  cost_type: 'insurance',
  label: '',
  amount: '',
  period: 'monthly',
  allocation: 'value',
  effective_from: new Date().toISOString().slice(0, 10),
})

export default function RecurringCostsPanel({ asset, fleet = [], lifecycleById, theme, onChanged }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(asset?.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const companyId = asset?.company_id
  const loading = rows === null

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('fleet_recurring_costs')
        .select('*')
        .eq('company_id', companyId)
        .order('effective_from', { ascending: false })
      if (!cancelled) setRows(data || [])
    })()
    return () => { cancelled = true }
  }, [companyId])

  // What this machine actually carries: its own costs plus its share of every
  // fleet-wide one.
  const { mine, fallbacks, relevant } = useMemo(() => {
    const active = (rows || []).filter(r => isActiveOn(r))
    const assetsForSplit = (fleet || []).map(f => ({
      id: f.id,
      value: lifecycleById?.get(f.id)?.lifecycle?.value ?? null,
      meter: lifecycleById?.get(f.id)?.lifecycle?.lifetimeUsed ?? null,
    }))
    const { perAsset, fallbacks } = annualRecurringByAsset(active, assetsForSplit)
    return {
      mine: perAsset.get(asset?.id) || 0,
      fallbacks,
      // Rows worth showing here: this asset's own, plus every fleet-wide one,
      // because a fleet-wide premium is part of what this machine costs.
      relevant: active.filter(r => !r.fleet_id || r.fleet_id === asset?.id),
    }
  }, [rows, fleet, lifecycleById, asset?.id])

  const save = async () => {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 0) { setError('Enter an amount.'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('fleet_recurring_costs').insert({
      company_id: companyId,
      fleet_id: form.scope === 'unit' ? asset.id : null,
      cost_type: form.cost_type,
      label: form.label || null,
      amount,
      period: form.period,
      allocation: form.scope === 'fleet' ? form.allocation : 'even',
      effective_from: form.effective_from,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm(emptyForm(asset?.id))
    setOpen(false)
    const { data } = await supabase.from('fleet_recurring_costs').select('*')
      .eq('company_id', companyId).order('effective_from', { ascending: false })
    setRows(data || [])
    onChanged?.()
  }

  const field = {
    width: '100%', minHeight: 44, padding: '0 10px', boxSizing: 'border-box',
    background: theme.bg, border: `1px solid ${theme.border}`,
    borderRadius: 8, color: theme.text, fontSize: 16,   // 16px or iOS zooms the page
  }
  const label = { fontSize: 11, color: theme.textMuted, display: 'block', marginBottom: 4 }

  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 16 : 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text }}>Insurance &amp; drivers</h3>
        <button
          onClick={() => { setForm(emptyForm(asset?.id)); setOpen(true) }}
          style={{
            minHeight: 44, padding: '0 14px', borderRadius: 8, border: 'none',
            background: theme.accent, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          <Plus size={16} /> Add
        </button>
      </div>
      <p style={{ margin: '4px 0 14px', fontSize: 12, color: theme.textMuted }}>
        Costs that arrive whether the machine moves or not. Usually the second largest line
        in a fleet after depreciation.
      </p>

      {mine > 0 && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
          padding: '10px 12px', marginBottom: 12,
          background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{money(mine)}</span>
          <span style={{ fontSize: 12, color: theme.textMuted }}>
            a year carried by this machine, including its share of fleet-wide costs
          </span>
        </div>
      )}

      {fallbacks.length > 0 && (
        // Say when a split could not use the basis that was asked for. The
        // number is still the best available, but it is an estimate standing
        // where a measurement should be, and that should be visible.
        <div style={{
          display: 'flex', gap: 6, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 12,
          background: 'rgba(234,179,8,.10)', border: '1px solid rgba(234,179,8,.4)', borderRadius: 8,
        }}>
          <AlertTriangle size={13} style={{ color: '#8a6d08', marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.4 }}>
            {fallbacks.length === 1 ? 'A cost was' : `${fallbacks.length} costs were`} split differently than
            asked — some machines have no purchase price, so there is nothing to weigh them by.
            Add prices for a truer split.
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: theme.textMuted, padding: 12 }}>Loading…</div>
      ) : relevant.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 20, fontSize: 13, color: theme.textMuted,
          background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 8,
        }}>
          Nothing recorded. Add a policy or a driver — per machine, or one figure across the
          whole fleet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {relevant.map(r => {
            const fleetWide = !r.fleet_id
            const Icon = fleetWide ? Building2 : (r.cost_type === 'driver' ? Users : Shield)
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
                background: theme.bg, border: `1px solid ${theme.border}`,
                borderLeft: `3px solid ${fleetWide ? theme.textMuted : theme.accent}`, borderRadius: 8,
              }}>
                <Icon size={16} style={{ color: fleetWide ? theme.textMuted : theme.accent, marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                    {r.label || typeLabel(r.cost_type)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    {fleetWide
                      ? `Fleet-wide · ${ALLOCATIONS.find(a => a.value === r.allocation)?.label.toLowerCase() || r.allocation}`
                      : 'This machine only'}
                    {` · from ${r.effective_from}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{money(annualAmount(r))}</div>
                  <div style={{ fontSize: 10, color: theme.textMuted }}>a year</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', zIndex: 91, background: theme.bgCard, overflowY: 'auto', padding: 20,
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0', maxHeight: '90vh',
                  paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }
              : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 520, maxWidth: '92vw', borderRadius: 12, maxHeight: '86vh' }),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>Add a recurring cost</h3>
              <button onClick={() => setOpen(false)} style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            {/* Scope first, because it changes what the rest of the form means. */}
            <label style={label}>Does this cover one machine, or the fleet?</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[
                { v: 'unit', label: 'This machine', icon: Shield },
                { v: 'fleet', label: 'Whole fleet', icon: Building2 },
              ].map(o => {
                const Icon = o.icon
                const on = form.scope === o.v
                return (
                  <button
                    key={o.v}
                    onClick={() => setForm(f => ({ ...f, scope: o.v }))}
                    style={{
                      flex: 1, minHeight: 48, borderRadius: 10, cursor: 'pointer',
                      border: `1.5px solid ${on ? theme.accent : theme.border}`,
                      background: on ? theme.accentBg : 'transparent',
                      color: on ? theme.accent : theme.textSecondary,
                      fontSize: 14, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}
                  >
                    <Icon size={16} /> {o.label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <div>
                <label style={label}>Kind</label>
                <select
                  value={form.cost_type}
                  onChange={e => {
                    const t = COST_TYPES.find(x => x.value === e.target.value)
                    // Move the basis with the kind: insurance defaults to value,
                    // a driver pool to even. The user can still override.
                    setForm(f => ({ ...f, cost_type: e.target.value, allocation: t?.defaultAllocation || 'even' }))
                  }}
                  style={field}
                >
                  {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Label (optional)</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Progressive commercial" style={field} />
              </div>
              <div>
                <label style={label}>Amount</label>
                <input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="$" style={field} />
              </div>
              <div>
                <label style={label}>Billed</label>
                <select value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} style={field}>
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Starts</label>
                <input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} style={field} />
              </div>
            </div>

            {form.scope === 'fleet' && (
              <div style={{ marginTop: 14 }}>
                <label style={label}>How should it be split across machines?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ALLOCATIONS.map(a => {
                    const on = form.allocation === a.value
                    return (
                      <button
                        key={a.value}
                        onClick={() => setForm(f => ({ ...f, allocation: a.value }))}
                        style={{
                          textAlign: 'left', minHeight: 52, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                          border: `1.5px solid ${on ? theme.accent : theme.border}`,
                          background: on ? theme.accentBg : 'transparent',
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600, color: on ? theme.accent : theme.text }}>{a.label}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{a.hint}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={13} /> {error}
              </div>
            )}

            <button
              onClick={save}
              disabled={saving}
              style={{
                width: '100%', minHeight: 48, marginTop: 16, borderRadius: 10, border: 'none',
                background: theme.accent, color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
