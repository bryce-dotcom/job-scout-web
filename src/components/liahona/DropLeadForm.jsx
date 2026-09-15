// "Drop lead" form: a lead created where the rep tapped (or where the address
// search landed). Picking an address from suggestions moves the pin to it.
// "Research this address" asks Find Prospects AI what is at the address —
// business or home, who to contact, property facts — and prefills the form.

import { X, Sparkles, Loader2, ExternalLink } from 'lucide-react'
import AddressAutocomplete from '../AddressAutocomplete'
import { makeStyles } from './util'

export default function DropLeadForm({ t, form, setForm, saving, onSave, onCancel, onPan, onResearch, researching, researchError }) {
  const { btn, input, label } = makeStyles(t)
  const r = form.research
  const prop = r?.property || {}
  const facts = [
    prop.type && ['Type', prop.type], prop.year_built && ['Built', prop.year_built], prop.sqft && ['Size', `${prop.sqft} sq ft`],
    prop.lot_size && ['Lot', prop.lot_size], prop.owner_of_record && ['Owner of record', prop.owner_of_record],
    prop.last_sale && ['Last sale', prop.last_sale], prop.assessed_value && ['Assessed', prop.assessed_value]
  ].filter(Boolean)

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14, color: t.text }}>New lead</strong>
        <button onClick={onCancel} style={btn(false, { padding: 4 })}><X size={13} /></button>
      </div>

      <label style={label}>Address {form.resolving && <span style={{ fontWeight: 400, textTransform: 'none' }}>· looking up…</span>}</label>
      <AddressAutocomplete value={form.address} style={input} placeholder="Street address"
        onChange={text => setForm(f => f && ({ ...f, address: text, research: null }))}
        onSelect={geo => { if (!geo) return; setForm(f => f && ({ ...f, address: geo.address, lat: geo.lat, lng: geo.lng, research: null })); onPan?.(geo.lat, geo.lng) }} />

      {onResearch && !r && (
        <button onClick={onResearch} disabled={researching || !form.address?.trim()} style={btn(false, { marginTop: 8, width: '100%', justifyContent: 'center', boxSizing: 'border-box', color: '#7c3aed', borderColor: '#c4b5fd' })}
          title="Find Prospects AI: who is at this address, how to reach them, property facts">
          {researching ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Researching…</> : <><Sparkles size={13} /> Research this address</>}
        </button>
      )}
      {researchError && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{researchError}</div>}

      {r && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, backgroundColor: 'rgba(124,58,237,0.08)', border: '1px solid #c4b5fd', fontSize: 12, color: t.text }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <Sparkles size={12} color="#7c3aed" /> {r.kind === 'business' ? 'Business' : r.kind === 'residential' ? 'Residence' : 'Property'}
            {r.confidence && <span style={{ fontWeight: 400, color: t.textMuted }}>· {r.confidence} confidence</span>}
            {r.cached && <span style={{ fontWeight: 400, color: t.textMuted }}>· from cache</span>}
          </div>
          {(r.business_name || r.occupant_or_owner_name) && (
            <div style={{ marginTop: 4 }}>{[r.business_name, r.occupant_or_owner_name && `${r.occupant_or_owner_name}${r.contact_title ? ` (${r.contact_title})` : ''}`].filter(Boolean).join(' · ')}</div>
          )}
          {r.website && <div><a href={r.website} target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>{r.website.replace(/^https?:\/\//, '')}</a></div>}
          {facts.length > 0 && (
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', color: t.textSecondary }}>
              {facts.map(([k, v]) => <><span key={k + 'k'} style={{ color: t.textMuted }}>{k}</span><span key={k + 'v'}>{v}</span></>)}
            </div>
          )}
          {r.notes && <div style={{ marginTop: 6, color: t.textSecondary }}>{r.notes}</div>}
          {r.source_urls?.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.source_urls.slice(0, 4).map(u => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ color: t.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3 }}><ExternalLink size={10} />{new URL(u).hostname.replace(/^www\./, '')}</a>)}
            </div>
          )}
          <div style={{ marginTop: 6, color: t.textMuted }}>Contact fields below were filled from this. Check them before saving.</div>
        </div>
      )}

      <label style={label}>Customer name</label>
      <input style={input} value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} autoFocus />

      {(r || form.business_name) && <>
        <label style={label}>Business name</label>
        <input style={input} value={form.business_name || ''} onChange={e => setForm({ ...form, business_name: e.target.value })} />
      </>}

      <label style={label}>Phone</label>
      <input style={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />

      {(r || form.email) && <>
        <label style={label}>Email</label>
        <input style={input} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
      </>}

      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>Starts in New, owned by you, source Door Knock. Edit anything else from the lead detail.</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={onSave} disabled={saving} style={btn(true, { flex: 1, justifyContent: 'center' })}>{saving ? 'Saving…' : 'Add lead'}</button>
        <button onClick={onCancel} style={btn(false)}>Cancel</button>
      </div>
    </div>
  )
}
