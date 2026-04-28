import { useState, useMemo, useEffect } from 'react'
import { X, Calculator, Save, AlertTriangle, TrendingUp } from 'lucide-react'
import { estimateProgram } from '../../lib/lawnEstimator'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'

export default function EstimateModal({ property, onClose, onSaved }) {
  const companyId = useStore(s => s.companyId)
  const lawnPricing = useStore(s => s.lawnPricing)

  const [edgingLF, setEdgingLF] = useState(property?.edging_lin_ft || 200)
  const [override, setOverride] = useState(null) // optional manual override
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(null)

  const result = useMemo(() => {
    if (!property) return null
    const propWithEdge = { ...property, edging_lin_ft: Number(edgingLF) || 0 }
    return estimateProgram({ property: propWithEdge, pricing: lawnPricing })
  }, [property, lawnPricing, edgingLF])

  if (!property) return null
  const noTurf = !property.turf_size_sqft

  const saveEstimate = async () => {
    if (!result) return
    setSaving(true)
    const { data, error } = await supabase.from('lawn_estimates').insert({
      company_id: companyId,
      property_id: property.id,
      turf_sqft: property.turf_size_sqft,
      effort_factor: result.effort_factor,
      pricing_snapshot: lawnPricing || null,
      line_items: {
        per_visit: result.per_visit.line_items,
        treatments: result.treatments,
        mows_per_season: result.mows_per_season,
      },
      per_visit_total: result.per_visit.grand_total,
      annual_program_total: override ?? result.annual_program_total,
      status: 'draft',
    }).select().single()
    setSaving(false)
    if (error) { alert('Save failed: ' + error.message); return }
    setSavedId(data.id)
    onSaved?.(data)
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 1100 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '95vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #d6cdb8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calculator size={20} style={{ color: '#5a6349' }} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#2c3530' }}>Estimate</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7d8a7f' }}><X size={22} /></button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#7d8a7f', textTransform: 'uppercase', fontWeight: 600 }}>Property</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#2c3530' }}>{property.property_name || property.address || `#${property.id}`}</div>
            <div style={{ fontSize: 13, color: '#7d8a7f' }}>{property.turf_size_sqft ? `${property.turf_size_sqft.toLocaleString()} sqft turf · ${property.mow_frequency || 'Weekly'}` : 'No turf measurement yet'}</div>
          </div>

          {noTurf && (
            <div style={{ display: 'flex', gap: 10, padding: 12, background: 'rgba(234,179,8,0.1)', border: '1px solid #eab308', borderRadius: 8, marginBottom: 14 }}>
              <AlertTriangle size={18} style={{ color: '#eab308', flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: '#4d5a52' }}>Measure the turf (or type a sqft number on the property) before Zach can estimate.</div>
            </div>
          )}

          {result?.effort_factor && result.effort_factor !== 1 && (
            <div style={{ display: 'flex', gap: 10, padding: 10, background: 'rgba(168,85,247,0.08)', border: '1px solid #a855f7', borderRadius: 8, marginBottom: 14 }}>
              <TrendingUp size={16} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: '#4d5a52' }}>
                Learning loop applied: <strong>×{result.effort_factor}</strong> based on this property's actual mow times. Reflected in the price below.
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#4d5a52', marginBottom: 6 }}>Edging (linear ft)</label>
            <input type="number" value={edgingLF} onChange={e => setEdgingLF(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d6cdb8', borderRadius: 8, background: '#f7f5ef', fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          {result && (
            <>
              {/* Per-visit */}
              <Section title="Per mow visit">
                {result.per_visit.line_items.map((li, i) => (
                  <Row key={i} label={li.label} detail={li.detail} amount={li.total} />
                ))}
                <Row label="Mow visit total" amount={result.per_visit.grand_total} bold />
                <Row label="Predicted duration" detail={`${result.per_visit.predicted_minutes} min`} muted />
              </Section>

              {/* Treatments */}
              <Section title="Treatment program (6 rounds)">
                {result.treatments.map(t => (
                  <Row key={t.round} label={`Round ${t.round} · ${t.label}`} detail={t.detail} amount={t.total} />
                ))}
                <Row label="Treatments total" amount={result.treatments_total} bold />
              </Section>

              {/* Annual */}
              <Section title="Annual program">
                <Row label={`${result.mows_per_season} mows`} amount={result.mows_total} />
                <Row label="6-round treatment program" amount={result.treatments_total} />
                <div style={{ borderTop: '2px solid #5a6349', marginTop: 8, paddingTop: 8 }}>
                  <Row label="Annual total" amount={result.annual_program_total} bold large />
                </div>
              </Section>

              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#4d5a52', marginBottom: 6 }}>Override annual total (optional)</label>
                <input type="number" value={override ?? ''} onChange={e => setOverride(e.target.value === '' ? null : Number(e.target.value))} placeholder={`Auto: $${result.annual_program_total}`} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d6cdb8', borderRadius: 8, background: '#f7f5ef', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </>
          )}

          {savedId && (
            <div style={{ marginTop: 14, padding: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: 8, color: '#15803d', fontSize: 13 }}>
              Estimate saved (#{savedId}). View history under Estimates tab.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid #d6cdb8', borderRadius: 10, color: '#4d5a52', cursor: 'pointer', fontWeight: 500 }}>Close</button>
            <button onClick={saveEstimate} disabled={saving || noTurf || !result} style={{ flex: 1, padding: 12, background: '#5a6349', color: '#fff', border: 'none', borderRadius: 10, cursor: (saving || noTurf || !result) ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: (saving || noTurf || !result) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save estimate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 14, padding: 12, background: '#f7f5ef', border: '1px solid #d6cdb8', borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7d8a7f', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, detail, amount, bold, muted, large }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', gap: 12, fontSize: large ? 16 : 13, color: muted ? '#7d8a7f' : '#2c3530', fontWeight: bold ? 700 : 400 }}>
      <div>
        <div>{label}</div>
        {detail && <div style={{ fontSize: 11, color: '#7d8a7f' }}>{detail}</div>}
      </div>
      {amount != null && <div style={{ fontVariantNumeric: 'tabular-nums' }}>${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
    </div>
  )
}
