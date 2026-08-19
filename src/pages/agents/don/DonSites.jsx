// Don — Sites. One row per place we're going to move dirt.
//
// Phone-first: cards, not a table. The add form is a bottom sheet so it opens
// under the thumb, and the primary action stays pinned to the bottom of the
// sheet rather than scrolling away above the keyboard.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MapPin, Search, Mountain, Droplets, Truck, Trash2, ChevronRight, Layers } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { SOIL_PROFILES } from '../../../lib/digEstimator'
import {
  T, Screen, Card, Btn, Chip, Field, TextInput, NumInput, Select, Sheet,
  Empty, Badge, SectionLabel, Note, fmtNum,
} from '../../../components/don/DonUI'

const emptySite = {
  site_name: '', address: '', city: '', state: '', zip: '',
  customer_id: '', lead_id: '',
  default_soil_class: 'common_earth',
  water_table_depth_ft: '', rock_expected: false,
  access_notes: '', utility_notes: '',
  haul_destination: '', haul_round_trip_miles: '',
  notes: '', active: true,
}

const SOIL_OPTIONS = Object.entries(SOIL_PROFILES).map(([value, s]) => ({ value, label: s.label }))

export default function DonSites() {
  const companyId = useStore((s) => s.companyId)
  const customers = useStore((s) => s.customers)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const [sites, setSites] = useState([])
  const [takeoffCounts, setTakeoffCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptySite)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const { data } = await supabase
      .from('dig_sites')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('created_at', { ascending: false })
    setSites(data || [])

    // How many takeoffs each site carries — the card's "is there work here" signal.
    const { data: tos } = await supabase
      .from('dig_takeoffs')
      .select('site_id, bid_total')
      .eq('company_id', companyId)
    const counts = {}
    ;(tos || []).forEach((t) => {
      if (!counts[t.site_id]) counts[t.site_id] = { n: 0, total: 0 }
      counts[t.site_id].n += 1
      counts[t.site_id].total += Number(t.bid_total) || 0
    })
    setTakeoffCounts(counts)
    setLoading(false)
  }

  useEffect(() => { load() }, [companyId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sites
    return sites.filter((s) =>
      [s.site_name, s.address, s.city, s.notes].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [sites, search])

  const openNew = () => { setForm(emptySite); setEditingId(null); setError(''); setShowForm(true) }
  const openEdit = (site) => {
    setForm({ ...emptySite, ...site, customer_id: site.customer_id || '', lead_id: site.lead_id || '' })
    setEditingId(site.id)
    setError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.site_name?.trim() && !form.address?.trim()) {
      setError('Give the site a name or an address so the crew can find it.')
      return
    }
    setSaving(true)
    const payload = {
      company_id: companyId,
      site_name: form.site_name?.trim() || null,
      address: form.address?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state?.trim() || null,
      zip: form.zip?.trim() || null,
      customer_id: form.customer_id ? Number(form.customer_id) : null,
      default_soil_class: form.default_soil_class || 'common_earth',
      water_table_depth_ft: form.water_table_depth_ft === '' ? null : Number(form.water_table_depth_ft),
      rock_expected: !!form.rock_expected,
      access_notes: form.access_notes?.trim() || null,
      utility_notes: form.utility_notes?.trim() || null,
      haul_destination: form.haul_destination?.trim() || null,
      haul_round_trip_miles: form.haul_round_trip_miles === '' ? null : Number(form.haul_round_trip_miles),
      notes: form.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const res = editingId
      ? await supabase.from('dig_sites').update(payload).eq('id', editingId)
      : await supabase.from('dig_sites').insert(payload)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    setShowForm(false)
    load()
  }

  const archive = async (id) => {
    if (!confirm('Archive this site? Its takeoffs stay put.')) return
    await supabase.from('dig_sites').update({ active: false }).eq('id', id)
    load()
  }

  const startTakeoff = async (site) => {
    const { data, error: err } = await supabase
      .from('dig_takeoffs')
      .insert({
        company_id: companyId,
        site_id: site.id,
        name: site.site_name || site.address || `Site #${site.id}`,
        status: 'draft',
      })
      .select()
      .single()
    if (err) { alert('Could not start a takeoff: ' + err.message); return }
    navigate(`/agents/don/takeoff/${data.id}`)
  }

  return (
    <div style={{ background: T.bg, minHeight: '100%' }}>
      <Screen>
        {/* Search + add. On a phone the add button is a full-width bar under
            the search box; on a laptop they sit side by side. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto',
          gap: 10, marginBottom: 4,
        }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sites"
              style={{
                width: '100%', minHeight: 48, padding: '10px 12px 10px 40px',
                border: `1px solid ${T.border}`, borderRadius: 10,
                background: T.bgCard, color: T.text, fontSize: 16, boxSizing: 'border-box',
              }}
            />
          </div>
          <Btn onClick={openNew} full={isMobile}><Plus size={18} /> New site</Btn>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textMuted }}>Loading sites…</div>
        ) : filtered.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Empty
              icon={MapPin}
              title={sites.length === 0 ? 'No sites yet' : 'Nothing matches that search'}
              body={sites.length === 0
                ? 'A site is one place you are going to move dirt. Add it once, then run as many takeoffs against it as the job needs — bid, rebid, addendum.'
                : 'Try a different name, street or town.'}
              action={sites.length === 0 ? <Btn onClick={openNew}><Plus size={18} /> Add the first site</Btn> : null}
            />
          </div>
        ) : (
          <>
            <SectionLabel>{filtered.length} site{filtered.length === 1 ? '' : 's'}</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
              gap: 12,
            }}>
              {filtered.map((site) => {
                const soil = SOIL_PROFILES[site.default_soil_class] || SOIL_PROFILES.common_earth
                const counts = takeoffCounts[site.id]
                return (
                  <Card key={site.id} accent={site.rock_expected ? T.clay : T.accent}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 16, fontWeight: 700, color: T.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {site.site_name || site.address || `Site #${site.id}`}
                        </div>
                        <div style={{
                          fontSize: 13, color: T.textMuted, marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {[site.address, site.city, site.state].filter(Boolean).join(', ') || 'No address'}
                        </div>
                      </div>
                      <button
                        onClick={() => archive(site.id)}
                        style={{
                          minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', flexShrink: 0,
                        }}
                        aria-label="Archive site"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      <Badge tone="muted"><Layers size={11} /> {soil.label}</Badge>
                      {site.rock_expected && <Badge tone="clay"><Mountain size={11} /> Rock expected</Badge>}
                      {site.water_table_depth_ft != null && (
                        <Badge tone="warning"><Droplets size={11} /> Water @ {site.water_table_depth_ft} ft</Badge>
                      )}
                      {site.haul_round_trip_miles != null && (
                        <Badge tone="muted"><Truck size={11} /> {site.haul_round_trip_miles} mi round trip</Badge>
                      )}
                    </div>

                    {counts && (
                      <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 10 }}>
                        {counts.n} takeoff{counts.n === 1 ? '' : 's'}
                        {counts.total > 0 && <> · <strong>${fmtNum(counts.total)}</strong> bid</>}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Btn variant="ghost" onClick={() => openEdit(site)} style={{ flex: 1, padding: '0 10px' }}>Edit</Btn>
                      <Btn onClick={() => startTakeoff(site)} style={{ flex: 2, padding: '0 10px' }}>
                        Take off <ChevronRight size={16} />
                      </Btn>
                    </div>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </Screen>

      <Sheet
        open={showForm}
        onClose={() => setShowForm(false)}
        isMobile={isMobile}
        title={editingId ? 'Edit site' : 'New site'}
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setShowForm(false)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn onClick={save} disabled={saving} style={{ flex: 2 }}>{saving ? 'Saving…' : 'Save site'}</Btn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          {error && <Note tone="danger">{error}</Note>}

          <Field label="Site name">
            <TextInput value={form.site_name} onChange={(v) => setForm({ ...form, site_name: v })} placeholder="Miller warehouse pad" />
          </Field>

          <Field label="Address">
            <TextInput value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="1420 County Rd 12" />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
            <Field label="City"><TextInput value={form.city} onChange={(v) => setForm({ ...form, city: v })} /></Field>
            <Field label="State"><TextInput value={form.state} onChange={(v) => setForm({ ...form, state: v })} /></Field>
            <Field label="Zip"><TextInput value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} /></Field>
          </div>

          <Field label="Customer">
            <Select
              value={form.customer_id}
              onChange={(v) => setForm({ ...form, customer_id: v })}
              placeholder="Not linked yet"
              options={(customers || []).map((c) => ({ value: String(c.id), label: c.name || c.business_name || `#${c.id}` }))}
            />
          </Field>

          <SectionLabel>What's in the ground</SectionLabel>

          <Field label="Default soil" hint="Every takeoff item starts here — you can override it per item.">
            <Select
              value={form.default_soil_class}
              onChange={(v) => setForm({ ...form, default_soil_class: v })}
              options={SOIL_OPTIONS}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
            <Field label="Water table" hint="Depth in feet, if known">
              <NumInput value={form.water_table_depth_ft} onChange={(v) => setForm({ ...form, water_table_depth_ft: v })} unit="ft" />
            </Field>
            <Field label="Haul distance" hint="Round trip">
              <NumInput value={form.haul_round_trip_miles} onChange={(v) => setForm({ ...form, haul_round_trip_miles: v })} unit="mi" />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip active={form.rock_expected} onClick={() => setForm({ ...form, rock_expected: !form.rock_expected })}>
              <Mountain size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Rock expected
            </Chip>
          </div>

          <Field label="Haul destination">
            <TextInput value={form.haul_destination} onChange={(v) => setForm({ ...form, haul_destination: v })} placeholder="Miller pit / county landfill" />
          </Field>

          <SectionLabel>Notes for the crew</SectionLabel>

          <Field label="Access" hint="Gates, overhead lines, staging room, weight limits">
            <textarea
              value={form.access_notes || ''}
              onChange={(e) => setForm({ ...form, access_notes: e.target.value })}
              rows={2}
              style={{
                width: '100%', padding: 12, border: `1px solid ${T.border}`, borderRadius: 10,
                background: T.bg, color: T.text, fontSize: 16, boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </Field>

          <Field label="Utilities" hint="811 ticket number, known conflicts, private locates">
            <textarea
              value={form.utility_notes || ''}
              onChange={(e) => setForm({ ...form, utility_notes: e.target.value })}
              rows={2}
              style={{
                width: '100%', padding: 12, border: `1px solid ${T.border}`, borderRadius: 10,
                background: T.bg, color: T.text, fontSize: 16, boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </Field>
        </div>
      </Sheet>
    </div>
  )
}
