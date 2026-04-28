import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Plus, ClipboardCheck, X, Save, Trash2, Calendar, Cloud, Clock, Users, TrendingUp } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { estimateMow, computeEffortFactor, DEFAULT_PRICING } from '../../../lib/lawnEstimator'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e', danger: '#ef4444'
}

const SERVICE_TYPES = ['mow', 'edge', 'cleanup', 'fert', 'aeration', 'overseed', 'other']

const today = () => new Date().toISOString().slice(0, 10)
const empty = {
  property_id: '', visit_date: today(), crew: '', duration_minutes: '',
  weather: '', service_type: 'mow', notes: '', billed: false,
}

export default function ZachVisits() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)
  const lawnProperties = useStore(s => s.lawnProperties)
  const fetchLawnProperties = useStore(s => s.fetchLawnProperties)
  const lawnVisits = useStore(s => s.lawnVisits)
  const fetchLawnVisits = useStore(s => s.fetchLawnVisits)
  const lawnPricing = useStore(s => s.lawnPricing)
  const fetchLawnPricing = useStore(s => s.fetchLawnPricing)

  const [filterProperty, setFilterProperty] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId) return
    fetchLawnVisits()
    fetchLawnPricing()
    if (!lawnProperties?.length) fetchLawnProperties()
  }, [companyId])

  const propMap = useMemo(() => {
    const m = {}
    ;(lawnProperties || []).forEach(p => { m[p.id] = p })
    return m
  }, [lawnProperties])

  const filtered = useMemo(() => {
    return (lawnVisits || []).filter(v => {
      if (filterProperty !== 'all' && String(v.property_id) !== String(filterProperty)) return false
      return true
    })
  }, [lawnVisits, filterProperty])

  const openCreate = () => { setForm(empty); setEditingId(null); setShowForm(true); setError(null) }
  const openEdit = (v) => {
    setForm({
      ...empty, ...v,
      duration_minutes: v.duration_minutes ?? '',
      visit_date: v.visit_date || today(),
    })
    setEditingId(v.id); setShowForm(true); setError(null)
  }

  const save = async () => {
    if (!form.property_id) { setError('Pick a property.'); return }
    setSaving(true); setError(null)
    const propId = parseInt(form.property_id)
    const property = propMap[propId]

    // Predicted duration — only meaningful for mow visits with a turf measurement
    let predicted = null
    if (form.service_type === 'mow' && property?.turf_size_sqft) {
      const est = estimateMow({
        turf_sqft: property.turf_size_sqft,
        pricing: lawnPricing || DEFAULT_PRICING,
        effort_factor: 1, // predict from baseline so the learning loop measures drift fairly
      })
      predicted = est.predicted_minutes
    }

    const payload = {
      ...form,
      company_id: companyId,
      property_id: propId,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      predicted_duration_minutes: predicted,
      updated_at: new Date().toISOString(),
    }
    let result
    if (editingId) {
      result = await supabase.from('lawn_visits').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('lawn_visits').insert(payload)
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }

    // Learning loop — pull this property's last 20 mow visits and recompute effort_factor.
    if (form.service_type === 'mow') {
      try {
        const { data: history } = await supabase
          .from('lawn_visits')
          .select('duration_minutes, predicted_duration_minutes')
          .eq('company_id', companyId)
          .eq('property_id', propId)
          .eq('service_type', 'mow')
          .not('duration_minutes', 'is', null)
          .not('predicted_duration_minutes', 'is', null)
          .order('visit_date', { ascending: false })
          .limit(20)
        const ef = computeEffortFactor(history || [])
        if (ef.sample_n >= 3) {
          await supabase.from('lawn_properties').update({
            effort_factor: ef.factor,
            effort_sample_n: ef.sample_n,
            updated_at: new Date().toISOString(),
          }).eq('id', propId)
        }
      } catch (e) {
        console.warn('[learning loop] skipped:', e?.message)
      }
    }

    setShowForm(false); setEditingId(null)
    fetchLawnVisits()
  }

  const remove = async (id) => {
    if (!confirm('Delete this visit?')) return
    await supabase.from('lawn_visits').delete().eq('id', id)
    fetchLawnVisits()
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px',
    color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.text }}>Visits</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.textMuted }}>Every mow, edge, and cleanup logged against the property.</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 18px', minHeight: 44, background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          <Plus size={18} /> Log Visit
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
          <option value="all">All properties</option>
          {(lawnProperties || []).map(p => <option key={p.id} value={p.id}>{p.property_name || p.address || `#${p.id}`}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: theme.bgCard, border: `1px dashed ${theme.border}`, borderRadius: 12 }}>
          <ClipboardCheck size={36} style={{ color: theme.textMuted, marginBottom: 12 }} />
          <p style={{ margin: 0, color: theme.textSecondary, fontWeight: 500 }}>{lawnVisits?.length ? 'No visits match the filter.' : 'No visits logged yet.'}</p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: theme.textMuted }}>Log a visit each time a crew rolls off a property.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(v => {
            const p = propMap[v.property_id]
            return (
              <div key={v.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <strong style={{ color: theme.text }}>{p?.property_name || p?.address || `Property #${v.property_id}`}</strong>
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: theme.accentBg, color: theme.accent, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{v.service_type}</span>
                    {v.billed && <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: theme.success, fontSize: 11, fontWeight: 600 }}>Billed</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: theme.textSecondary }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> {v.visit_date}</span>
                    {v.crew && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={13} /> {v.crew}</span>}
                    {v.duration_minutes != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {v.duration_minutes} min</span>}
                    {v.weather && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Cloud size={13} /> {v.weather}</span>}
                  </div>
                  {v.notes && <p style={{ margin: '8px 0 0', fontSize: 13, color: theme.textSecondary, whiteSpace: 'pre-wrap' }}>{v.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEdit(v)} style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.textSecondary, fontSize: 12 }}>Edit</button>
                  <button onClick={() => remove(v.id)} style={{ padding: 6, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.danger }}><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: theme.bgCard, borderRadius: 14, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: theme.text }}>{editingId ? 'Edit visit' : 'Log visit'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted }}><X size={22} /></button>
            </div>
            {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: `1px solid ${theme.danger}`, borderRadius: 8, color: theme.danger, marginBottom: 12, fontSize: 13 }}>{error}</div>}

            <Field label="Property">
              <select style={inputStyle} value={form.property_id} onChange={e => setForm({...form, property_id: e.target.value})}>
                <option value="">— Pick property —</option>
                {(lawnProperties || []).map(p => <option key={p.id} value={p.id}>{p.property_name || p.address || `#${p.id}`}</option>)}
              </select>
            </Field>
            <Row>
              <Field label="Visit date"><input type="date" style={inputStyle} value={form.visit_date} onChange={e => setForm({...form, visit_date: e.target.value})} /></Field>
              <Field label="Service type">
                <select style={inputStyle} value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})}>
                  {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Crew"><input style={inputStyle} value={form.crew} onChange={e => setForm({...form, crew: e.target.value})} placeholder="e.g. Crew B" /></Field>
              <Field label="Duration (min)"><input type="number" style={inputStyle} value={form.duration_minutes} onChange={e => setForm({...form, duration_minutes: e.target.value})} /></Field>
            </Row>
            {(() => {
              const prop = propMap[parseInt(form.property_id)]
              if (form.service_type !== 'mow' || !prop?.turf_size_sqft || !lawnPricing) return null
              const est = estimateMow({ turf_sqft: prop.turf_size_sqft, pricing: lawnPricing, effort_factor: 1 })
              return (
                <div style={{ display: 'flex', gap: 8, padding: 10, background: 'rgba(168,85,247,0.08)', border: `1px solid #a855f7`, borderRadius: 8, marginBottom: 12 }}>
                  <TrendingUp size={16} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 13, color: theme.textSecondary }}>
                    Zach predicts <strong>{est.predicted_minutes} min</strong> for this mow ({prop.turf_size_sqft.toLocaleString()} sqft). Logging actual time tunes future estimates.
                  </div>
                </div>
              )
            })()}
            <Field label="Weather"><input style={inputStyle} value={form.weather} onChange={e => setForm({...form, weather: e.target.value})} placeholder="Sunny 78F" /></Field>
            <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></Field>
            <Field label="Billed">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: theme.text }}>
                <input type="checkbox" checked={form.billed} onChange={e => setForm({...form, billed: e.target.checked})} />
                Already billed
              </label>
            </Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textSecondary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: 12, background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Save size={16} /> {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Log visit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#4d5a52' }}>{label}</label>
      {children}
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>{children}</div>
}
