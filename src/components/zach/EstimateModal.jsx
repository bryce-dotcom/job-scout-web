import { useState, useMemo, useEffect } from 'react'
import { X, Calculator, Save, AlertTriangle, TrendingUp, FileText } from 'lucide-react'
import { estimateProgram } from '../../lib/lawnEstimator'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'

export default function EstimateModal({ property, onClose, onSaved }) {
  const companyId = useStore(s => s.companyId)
  const lawnPricing = useStore(s => s.lawnPricing)
  const fetchLeads = useStore(s => s.fetchLeads)
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  const currentEmployeeId = useMemo(() => (employees || []).find(e => e.email === user?.email)?.id || null, [employees, user])

  const [edgingLF, setEdgingLF] = useState(property?.edging_lin_ft || 200)
  const [override, setOverride] = useState(null) // optional manual override
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(null)
  const [savedQuoteId, setSavedQuoteId] = useState(null)

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
    const annual = override ?? result.annual_program_total

    const { data: estimate, error } = await supabase.from('lawn_estimates').insert({
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
      annual_program_total: annual,
      status: 'draft',
    }).select().single()
    if (error) { setSaving(false); alert('Save failed: ' + error.message); return }
    setSavedId(estimate.id)

    // Mirror Lenard: also write to the unified quotes + quote_lines tables so
    // this bid shows up in the sales pipeline alongside everything else.
    let quoteId = null
    try {
      const propertyLabel = property.property_name || property.address || `Property #${property.id}`
      const { data: quote, error: qErr } = await supabase.from('quotes').insert({
        company_id: companyId,
        lead_id: property.lead_id || null,
        customer_id: property.customer_id || null,
        salesperson_id: currentEmployeeId,  // attribute to creator so it shows in their pipeline
        audit_id: null,
        audit_type: 'lawn_care',
        service_type: 'Lawn Care',
        estimate_name: `Lawn care — ${propertyLabel}`,
        summary: `${(property.turf_size_sqft || 0).toLocaleString()} sqft turf · ${property.mow_frequency || 'Weekly'} · ${result.mows_per_season} mows/season`,
        quote_amount: annual,
        status: 'Draft',
        notes: [
          `Address: ${[property.address, property.city, property.state, property.zip].filter(Boolean).join(', ') || '—'}`,
          `Per visit: $${result.per_visit.grand_total} · Treatments: $${result.treatments_total} · Annual: $${annual}`,
        ].join('\n'),
      }).select().single()

      if (qErr) {
        console.warn('[EstimateModal] quote insert failed:', qErr.message)
      } else {
        quoteId = quote.id
        setSavedQuoteId(quoteId)

        // One quote_line for the mow program, one per treatment round.
        const lines = [
          {
            company_id: companyId,
            quote_id: quoteId,
            item_name: `Mowing — ${result.mows_per_season} visits`,
            description: `${property.mow_frequency || 'Weekly'} mowing on ${(property.turf_size_sqft || 0).toLocaleString()} sqft turf · ~${result.per_visit.predicted_minutes} min/visit`,
            quantity: result.mows_per_season,
            price: result.per_visit.grand_total,
            line_total: result.mows_total,
            sort_order: 0,
          },
          ...result.treatments.map((t, i) => ({
            company_id: companyId,
            quote_id: quoteId,
            item_name: `Treatment Round ${t.round} — ${t.label}`,
            description: t.detail || null,
            quantity: 1,
            price: t.total,
            line_total: t.total,
            sort_order: i + 1,
          })),
        ]
        const { error: linesErr } = await supabase.from('quote_lines').insert(lines)
        if (linesErr) console.warn('[EstimateModal] quote_lines insert failed:', linesErr.message)

        // Backlink: quote → estimate, lead → quote (so the pipeline shows it)
        await supabase.from('lawn_estimates').update({ quote_id: quoteId, status: 'sent' }).eq('id', estimate.id)
        if (property.lead_id) {
          await supabase.from('leads').update({ quote_id: quoteId, status: 'Estimate Sent' }).eq('id', property.lead_id)
          fetchLeads?.()
        }
      }
    } catch (e) {
      console.warn('[EstimateModal] quote sync threw:', e.message)
    }

    setSaving(false)
    onSaved?.({ ...estimate, quote_id: quoteId })
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
              Estimate saved (#{savedId}).
              {savedQuoteId && (
                <span> Bid pushed to the sales pipeline as <a href={`/quotes/${savedQuoteId}`} style={{ color: '#15803d', fontWeight: 600 }}>Quote #{savedQuoteId}</a> with line items{property.lead_id ? ' and lead status set to Estimate Sent' : ''}.</span>
              )}
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
