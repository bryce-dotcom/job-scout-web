import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Plus, Sprout, X, Save, Trash2, Calendar, CheckCircle2, Circle, SkipForward } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e', danger: '#ef4444', warning: '#eab308'
}

const TREATMENT_TYPES = ['pre-emergent', 'fert', 'weed-control', 'grub-control', 'aeration', 'overseed', 'lime', 'iron', 'other']
const STATUSES = ['scheduled', 'completed', 'skipped']
const UNITS = ['lbs', 'gal', 'oz', 'bags']

const empty = {
  property_id: '', round_number: '', treatment_type: 'fert', product_name: '',
  scheduled_date: '', completed_date: '', amount_used: '', amount_unit: 'lbs',
  cost: '', notes: '', status: 'scheduled',
}

export default function ZachTreatments() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)
  const lawnProperties = useStore(s => s.lawnProperties)
  const fetchLawnProperties = useStore(s => s.fetchLawnProperties)
  const lawnTreatments = useStore(s => s.lawnTreatments)
  const fetchLawnTreatments = useStore(s => s.fetchLawnTreatments)

  const [filterStatus, setFilterStatus] = useState('all')
  const [filterProperty, setFilterProperty] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId) return
    fetchLawnTreatments()
    if (!lawnProperties?.length) fetchLawnProperties()
  }, [companyId])

  const propMap = useMemo(() => {
    const m = {}
    ;(lawnProperties || []).forEach(p => { m[p.id] = p })
    return m
  }, [lawnProperties])

  const filtered = useMemo(() => {
    return (lawnTreatments || []).filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterProperty !== 'all' && String(t.property_id) !== String(filterProperty)) return false
      return true
    })
  }, [lawnTreatments, filterStatus, filterProperty])

  const openCreate = () => { setForm(empty); setEditingId(null); setShowForm(true); setError(null) }
  const openEdit = (t) => {
    setForm({
      ...empty, ...t,
      round_number: t.round_number ?? '',
      scheduled_date: t.scheduled_date || '',
      completed_date: t.completed_date || '',
      amount_used: t.amount_used ?? '',
      cost: t.cost ?? '',
    })
    setEditingId(t.id); setShowForm(true); setError(null)
  }

  const save = async () => {
    if (!form.property_id) { setError('Pick a property.'); return }
    if (!form.treatment_type) { setError('Pick a treatment type.'); return }
    setSaving(true); setError(null)
    const payload = {
      ...form,
      company_id: companyId,
      property_id: parseInt(form.property_id),
      round_number: form.round_number ? parseInt(form.round_number) : null,
      scheduled_date: form.scheduled_date || null,
      completed_date: form.completed_date || null,
      amount_used: form.amount_used ? parseFloat(form.amount_used) : null,
      cost: form.cost ? parseFloat(form.cost) : null,
      updated_at: new Date().toISOString(),
    }
    let result
    if (editingId) {
      result = await supabase.from('lawn_treatments').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('lawn_treatments').insert(payload)
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setShowForm(false); setEditingId(null)
    fetchLawnTreatments()
  }

  const markComplete = async (t) => {
    await supabase.from('lawn_treatments').update({
      status: 'completed',
      completed_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq('id', t.id)
    fetchLawnTreatments()
  }

  const remove = async (id) => {
    if (!confirm('Delete this treatment?')) return
    await supabase.from('lawn_treatments').delete().eq('id', id)
    fetchLawnTreatments()
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px',
    color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  const statusColor = (s) => s === 'completed' ? theme.success : s === 'skipped' ? theme.textMuted : theme.warning
  const StatusIcon = ({ status }) => status === 'completed' ? <CheckCircle2 size={14} /> : status === 'skipped' ? <SkipForward size={14} /> : <Circle size={14} />

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.text }}>Treatments</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.textMuted }}>Seasonal applications — fert, weed, grub, aeration, overseed.</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 18px', minHeight: 44, background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          <Plus size={18} /> Schedule Treatment
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
          <option value="all">All properties</option>
          {(lawnProperties || []).map(p => <option key={p.id} value={p.id}>{p.property_name || p.address || `#${p.id}`}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: theme.bgCard, border: `1px dashed ${theme.border}`, borderRadius: 12 }}>
          <Sprout size={36} style={{ color: theme.textMuted, marginBottom: 12 }} />
          <p style={{ margin: 0, color: theme.textSecondary, fontWeight: 500 }}>{lawnTreatments?.length ? 'No treatments match the filter.' : 'No treatments scheduled yet.'}</p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: theme.textMuted }}>Schedule rounds at the start of the season — Zach tracks completion.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(t => {
            const p = propMap[t.property_id]
            return (
              <div key={t.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <strong style={{ color: theme.text }}>{p?.property_name || p?.address || `Property #${t.property_id}`}</strong>
                    {t.round_number != null && <span style={{ padding: '2px 8px', borderRadius: 999, background: theme.accentBg, color: theme.accent, fontSize: 11, fontWeight: 600 }}>Round {t.round_number}</span>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: `${statusColor(t.status)}22`, color: statusColor(t.status), fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                      <StatusIcon status={t.status} /> {t.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: theme.text, marginBottom: 4 }}>
                    <strong>{t.treatment_type}</strong>
                    {t.product_name && <span style={{ color: theme.textSecondary }}> — {t.product_name}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: theme.textSecondary }}>
                    {t.scheduled_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> Sched: {t.scheduled_date}</span>}
                    {t.completed_date && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: theme.success }}><CheckCircle2 size={13} /> Done: {t.completed_date}</span>}
                    {t.amount_used != null && <span>{t.amount_used} {t.amount_unit}</span>}
                    {t.cost != null && <span>${Number(t.cost).toFixed(2)}</span>}
                  </div>
                  {t.notes && <p style={{ margin: '8px 0 0', fontSize: 13, color: theme.textSecondary, whiteSpace: 'pre-wrap' }}>{t.notes}</p>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {t.status === 'scheduled' && (
                    <button onClick={() => markComplete(t)} style={{ padding: '6px 10px', background: theme.success, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Mark done</button>
                  )}
                  <button onClick={() => openEdit(t)} style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.textSecondary, fontSize: 12 }}>Edit</button>
                  <button onClick={() => remove(t.id)} style={{ padding: 6, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.danger }}><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: theme.bgCard, borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: theme.text }}>{editingId ? 'Edit treatment' : 'Schedule treatment'}</h2>
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
              <Field label="Treatment type">
                <select style={inputStyle} value={form.treatment_type} onChange={e => setForm({...form, treatment_type: e.target.value})}>
                  {TREATMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Round #"><input type="number" style={inputStyle} value={form.round_number} onChange={e => setForm({...form, round_number: e.target.value})} placeholder="1-6" /></Field>
              <Field label="Status">
                <select style={inputStyle} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </Row>
            <Field label="Product name"><input style={inputStyle} value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})} placeholder="e.g. Lesco 24-0-11" /></Field>
            <Row>
              <Field label="Scheduled"><input type="date" style={inputStyle} value={form.scheduled_date} onChange={e => setForm({...form, scheduled_date: e.target.value})} /></Field>
              <Field label="Completed"><input type="date" style={inputStyle} value={form.completed_date} onChange={e => setForm({...form, completed_date: e.target.value})} /></Field>
            </Row>
            <Row>
              <Field label="Amount"><input type="number" step="0.01" style={inputStyle} value={form.amount_used} onChange={e => setForm({...form, amount_used: e.target.value})} /></Field>
              <Field label="Unit">
                <select style={inputStyle} value={form.amount_unit} onChange={e => setForm({...form, amount_unit: e.target.value})}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Cost ($)"><input type="number" step="0.01" style={inputStyle} value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} /></Field>
            </Row>
            <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textSecondary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: 12, background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Save size={16} /> {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Schedule')}
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
