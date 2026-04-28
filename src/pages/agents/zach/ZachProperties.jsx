import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Plus, Search, MapPin, Dog, KeyRound, Ruler, Calendar, X, Edit2, Save, Trash2, Calculator, Crop } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import YardMeasureModal from '../../../components/zach/YardMeasureModal'
import EstimateModal from '../../../components/zach/EstimateModal'
import { loadGoogleMaps, hasMapsKey, staticMapUrl } from '../../../lib/googleMaps'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentHover: '#4a5239', accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e', danger: '#ef4444'
}

const TURF_TYPES = ['Kentucky Bluegrass', 'Tall Fescue', 'Fine Fescue', 'Perennial Rye', 'Bermuda', 'Zoysia', 'St. Augustine', 'Buffalo', 'Mixed', 'Other']
const FREQUENCIES = ['Weekly', 'Bi-Weekly', 'Every 10 days', 'Monthly', 'On Call']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const empty = {
  property_name: '', address: '', city: '', state: '', zip: '',
  customer_id: '', lot_size_sqft: '', turf_size_sqft: '',
  turf_type: '', mow_frequency: 'Weekly', mow_height_inches: 3.0, mow_day: '',
  gate_code: '', dog_on_premises: false, dog_notes: '',
  irrigation_notes: '', obstacles: '', hazards: '',
  preferred_crew: '', notes: '', active: true,
  latitude: null, longitude: null, turf_polygon: null,
}

export default function ZachProperties() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)
  const customers = useStore(s => s.customers)
  const fetchCustomers = useStore(s => s.fetchCustomers)
  const lawnProperties = useStore(s => s.lawnProperties)
  const fetchLawnProperties = useStore(s => s.fetchLawnProperties)
  const fetchLawnPricing = useStore(s => s.fetchLawnPricing)

  const [search, setSearch] = useState('')
  const [filterDay, setFilterDay] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [measuring, setMeasuring] = useState(null)   // property being measured
  const [estimating, setEstimating] = useState(null) // property being estimated
  const addressInputRef = useRef(null)
  const autocompleteRef = useRef(null)

  useEffect(() => {
    if (!companyId) return
    fetchLawnProperties()
    fetchLawnPricing()
    if (!customers?.length) fetchCustomers()
  }, [companyId])

  // Wire Google Places autocomplete onto the address field whenever the form opens
  useEffect(() => {
    if (!showForm || !addressInputRef.current || !hasMapsKey()) return
    let alive = true
    loadGoogleMaps().then(google => {
      if (!alive || !addressInputRef.current) return
      // Tear down any prior instance
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current)
      }
      const ac = new google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ['address_components', 'formatted_address', 'geometry'],
        types: ['address'],
      })
      autocompleteRef.current = ac
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place) return
        const comps = place.address_components || []
        const get = (type, short) => {
          const c = comps.find(c => c.types.includes(type))
          return c ? (short ? c.short_name : c.long_name) : ''
        }
        const street = [get('street_number'), get('route')].filter(Boolean).join(' ')
        setForm(prev => ({
          ...prev,
          address: street || place.formatted_address || prev.address,
          city:    get('locality') || get('sublocality') || prev.city,
          state:   get('administrative_area_level_1', true) || prev.state,
          zip:     get('postal_code') || prev.zip,
          latitude:  place.geometry?.location?.lat() ?? prev.latitude ?? null,
          longitude: place.geometry?.location?.lng() ?? prev.longitude ?? null,
        }))
      })
    }).catch(() => {})
    return () => { alive = false }
  }, [showForm])

  const filtered = useMemo(() => {
    return (lawnProperties || []).filter(p => {
      if (filterDay !== 'all' && p.mow_day !== filterDay) return false
      if (!search) return true
      const t = search.toLowerCase()
      return (p.property_name || '').toLowerCase().includes(t)
        || (p.address || '').toLowerCase().includes(t)
        || (p.city || '').toLowerCase().includes(t)
    })
  }, [lawnProperties, search, filterDay])

  const openCreate = () => { setForm(empty); setEditingId(null); setShowForm(true); setError(null) }
  const openEdit = (p) => {
    setForm({
      ...empty, ...p,
      customer_id: p.customer_id || '',
      lot_size_sqft: p.lot_size_sqft ?? '',
      turf_size_sqft: p.turf_size_sqft ?? '',
      mow_height_inches: p.mow_height_inches ?? 3.0,
    })
    setEditingId(p.id); setShowForm(true); setError(null)
  }

  const save = async () => {
    if (!form.property_name?.trim() && !form.address?.trim()) {
      setError('Give the property a name or an address.')
      return
    }
    setSaving(true); setError(null)
    const payload = {
      ...form,
      company_id: companyId,
      customer_id: form.customer_id || null,
      lot_size_sqft: form.lot_size_sqft ? parseInt(form.lot_size_sqft) : null,
      turf_size_sqft: form.turf_size_sqft ? parseInt(form.turf_size_sqft) : null,
      mow_height_inches: form.mow_height_inches ? parseFloat(form.mow_height_inches) : null,
      latitude: form.latitude != null && form.latitude !== '' ? parseFloat(form.latitude) : null,
      longitude: form.longitude != null && form.longitude !== '' ? parseFloat(form.longitude) : null,
      turf_polygon: form.turf_polygon || null,
      updated_at: new Date().toISOString(),
    }
    let result
    if (editingId) {
      result = await supabase.from('lawn_properties').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('lawn_properties').insert(payload)
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setShowForm(false); setEditingId(null)
    fetchLawnProperties()
  }

  const remove = async (id) => {
    if (!confirm('Remove this property? Its visits and treatments will be deleted too.')) return
    await supabase.from('lawn_properties').delete().eq('id', id)
    fetchLawnProperties()
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px',
    color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: theme.textSecondary }

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      {/* Header / actions */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: theme.text }}>Properties</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.textMuted }}>The lawn-care file on every property you maintain.</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 18px', minHeight: 44, background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          <Plus size={18} /> Add Property
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, address, city" style={{ ...inputStyle, paddingLeft: 38 }} />
        </div>
        <select value={filterDay} onChange={e => setFilterDay(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 150 }}>
          <option value="all">All days</option>
          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: theme.bgCard, border: `1px dashed ${theme.border}`, borderRadius: 12 }}>
          <MapPin size={36} style={{ color: theme.textMuted, marginBottom: 12 }} />
          <p style={{ margin: 0, color: theme.textSecondary, fontWeight: 500 }}>{lawnProperties?.length ? 'No properties match your filters.' : 'No properties yet.'}</p>
          <p style={{ margin: '6px 0 16px', fontSize: 13, color: theme.textMuted }}>{lawnProperties?.length ? 'Try clearing the search.' : "Add your first lawn — Zach will start tracking visits and treatments against it."}</p>
          {!lawnProperties?.length && (
            <button onClick={openCreate} style={{ padding: '10px 18px', background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 500 }}>Add your first property</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(p => (
            <div key={p.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.text }}>{p.property_name || p.address || 'Unnamed property'}</h3>
                  {p.address && <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.textMuted }}>{p.address}{p.city ? ', ' + p.city : ''}{p.state ? ' ' + p.state : ''}</p>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setEstimating(p)} title="Estimate" style={{ padding: 6, background: theme.accentBg, border: `1px solid ${theme.accent}`, borderRadius: 6, cursor: 'pointer', color: theme.accent }}><Calculator size={14} /></button>
                  <button onClick={() => openEdit(p)} title="Edit" style={{ padding: 6, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.textSecondary }}><Edit2 size={14} /></button>
                  <button onClick={() => remove(p.id)} title="Delete" style={{ padding: 6, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.danger }}><Trash2 size={14} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {p.mow_frequency && <Chip theme={theme} icon={Calendar}>{p.mow_frequency}{p.mow_day ? ` · ${p.mow_day}` : ''}</Chip>}
                {p.turf_size_sqft && <Chip theme={theme} icon={Ruler}>{p.turf_size_sqft.toLocaleString()} sqft</Chip>}
                {p.turf_type && <Chip theme={theme}>{p.turf_type}</Chip>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.dog_on_premises && <Chip theme={theme} icon={Dog} color={theme.danger}>Dog</Chip>}
                {p.gate_code && <Chip theme={theme} icon={KeyRound}>Gate: {p.gate_code}</Chip>}
              </div>

              {p.latitude && p.longitude && hasMapsKey() && (
                <img src={staticMapUrl({ lat: p.latitude, lng: p.longitude, polygon: p.turf_polygon, width: 360, height: 140 })} alt="" style={{ marginTop: 10, width: '100%', borderRadius: 8, border: `1px solid ${theme.border}`, display: 'block' }} />
              )}

              {p.notes && <p style={{ marginTop: 12, fontSize: 13, color: theme.textSecondary, whiteSpace: 'pre-wrap' }}>{p.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: theme.bgCard, borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: theme.text }}>{editingId ? 'Edit property' : 'New property'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted }}><X size={22} /></button>
            </div>
            {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: `1px solid ${theme.danger}`, borderRadius: 8, color: theme.danger, marginBottom: 12, fontSize: 13 }}>{error}</div>}

            <Section title="Identification">
              <Field label="Property name"><input style={inputStyle} value={form.property_name} onChange={e => setForm({...form, property_name: e.target.value})} placeholder="e.g. Smith — Main St" /></Field>
              <Field label="Customer">
                <select style={inputStyle} value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})}>
                  <option value="">— None —</option>
                  {(customers || []).map(c => <option key={c.id} value={c.id}>{c.business_name || c.name}</option>)}
                </select>
              </Field>
              <Field label="Address">
                <input ref={addressInputRef} style={inputStyle} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder={hasMapsKey() ? 'Start typing — Google will autocomplete' : 'Street address'} />
              </Field>
              <Row>
                <Field label="City"><input style={inputStyle} value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></Field>
                <Field label="State"><input style={inputStyle} value={form.state} onChange={e => setForm({...form, state: e.target.value})} maxLength={2} /></Field>
                <Field label="ZIP"><input style={inputStyle} value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} /></Field>
              </Row>
            </Section>

            <Section title="Mowing">
              <Row>
                <Field label="Frequency">
                  <select style={inputStyle} value={form.mow_frequency} onChange={e => setForm({...form, mow_frequency: e.target.value})}>
                    {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="Day">
                  <select style={inputStyle} value={form.mow_day} onChange={e => setForm({...form, mow_day: e.target.value})}>
                    <option value="">—</option>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Mow height (in)"><input style={inputStyle} type="number" step="0.25" value={form.mow_height_inches} onChange={e => setForm({...form, mow_height_inches: e.target.value})} /></Field>
              </Row>
              <Row>
                <Field label="Lot size (sqft)"><input style={inputStyle} type="number" value={form.lot_size_sqft} onChange={e => setForm({...form, lot_size_sqft: e.target.value})} /></Field>
                <Field label="Turf size (sqft)"><input style={inputStyle} type="number" value={form.turf_size_sqft} onChange={e => setForm({...form, turf_size_sqft: e.target.value})} /></Field>
                <Field label="Turf type">
                  <select style={inputStyle} value={form.turf_type} onChange={e => setForm({...form, turf_type: e.target.value})}>
                    <option value="">—</option>
                    {TURF_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              </Row>

              {/* Satellite measurement */}
              <div style={{ marginTop: 8, padding: 12, background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Measure from satellite</div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>
                      {form.turf_polygon?.length ? `Saved polygon · ${form.turf_polygon.length} pts` : 'Trace the lawn on a Google satellite tile to auto-fill turf sqft.'}
                    </div>
                  </div>
                  <button type="button" onClick={() => setMeasuring({ __form: true, address: [form.address, form.city, form.state].filter(Boolean).join(', '), latitude: form.latitude, longitude: form.longitude, turf_polygon: form.turf_polygon })} style={{ padding: '8px 14px', minHeight: 40, background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Crop size={14} /> {form.turf_polygon?.length ? 'Re-measure' : 'Measure yard'}
                  </button>
                </div>
                {form.latitude && form.longitude && (
                  <img src={staticMapUrl({ lat: form.latitude, lng: form.longitude, polygon: form.turf_polygon, width: 560, height: 200 })} alt="" style={{ marginTop: 10, width: '100%', borderRadius: 8, border: `1px solid ${theme.border}`, display: 'block' }} />
                )}
              </div>
            </Section>

            <Section title="Access & site">
              <Row>
                <Field label="Gate code"><input style={inputStyle} value={form.gate_code} onChange={e => setForm({...form, gate_code: e.target.value})} /></Field>
                <Field label="Preferred crew"><input style={inputStyle} value={form.preferred_crew} onChange={e => setForm({...form, preferred_crew: e.target.value})} placeholder="e.g. Crew B" /></Field>
              </Row>
              <Field label="Dog on premises">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: theme.text }}>
                  <input type="checkbox" checked={form.dog_on_premises} onChange={e => setForm({...form, dog_on_premises: e.target.checked})} />
                  Yes — careful when entering
                </label>
              </Field>
              {form.dog_on_premises && <Field label="Dog notes"><input style={inputStyle} value={form.dog_notes} onChange={e => setForm({...form, dog_notes: e.target.value})} placeholder="e.g. friendly golden, stays in back yard" /></Field>}
              <Field label="Irrigation notes"><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.irrigation_notes} onChange={e => setForm({...form, irrigation_notes: e.target.value})} placeholder="8 zones, controller in garage" /></Field>
              <Field label="Obstacles"><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.obstacles} onChange={e => setForm({...form, obstacles: e.target.value})} placeholder="trampoline back yard, careful around playset" /></Field>
              <Field label="Hazards"><input style={inputStyle} value={form.hazards} onChange={e => setForm({...form, hazards: e.target.value})} /></Field>
              <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></Field>
            </Section>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textSecondary, cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: 12, background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Save size={16} /> {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Create property')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yard measurement modal */}
      {measuring && (
        <YardMeasureModal
          address={measuring.address || [measuring.address_line, measuring.city, measuring.state].filter(Boolean).join(', ')}
          initialCenter={measuring.latitude && measuring.longitude ? { lat: Number(measuring.latitude), lng: Number(measuring.longitude) } : null}
          initialPolygon={measuring.turf_polygon || null}
          onClose={() => setMeasuring(null)}
          onSave={async ({ polygon, sqft, lat, lng }) => {
            if (measuring.__form) {
              // measuring against the open form (new property or edit-in-progress)
              setForm(prev => ({
                ...prev,
                turf_polygon: polygon,
                turf_size_sqft: sqft || prev.turf_size_sqft,
                latitude: lat ?? prev.latitude,
                longitude: lng ?? prev.longitude,
              }))
            } else if (measuring.id) {
              // measuring an existing property in-place
              await supabase.from('lawn_properties').update({
                turf_polygon: polygon,
                turf_size_sqft: sqft || measuring.turf_size_sqft,
                latitude: lat ?? measuring.latitude,
                longitude: lng ?? measuring.longitude,
                updated_at: new Date().toISOString(),
              }).eq('id', measuring.id)
              fetchLawnProperties()
            }
            setMeasuring(null)
          }}
        />
      )}

      {/* Estimate modal */}
      {estimating && (
        <EstimateModal property={estimating} onClose={() => setEstimating(null)} onSaved={() => {}} />
      )}
    </div>
  )
}

function Chip({ children, icon: Icon, theme, color }) {
  const c = color || theme.textSecondary
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: theme.accentBg, color: c, fontSize: 12, fontWeight: 500 }}>
      {Icon && <Icon size={12} />}
      {children}
    </span>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#7d8a7f', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{title}</div>
      {children}
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
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>{children}</div>
}
