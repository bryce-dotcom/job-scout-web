// "Drop lead" form: a lead created where the rep tapped (or where the address
// search landed). Picking an address from suggestions moves the pin to it.

import { X } from 'lucide-react'
import AddressAutocomplete from '../AddressAutocomplete'
import { makeStyles } from './util'

export default function DropLeadForm({ t, form, setForm, saving, onSave, onCancel, onPan }) {
  const { btn, input, label } = makeStyles(t)
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14, color: t.text }}>New lead</strong>
        <button onClick={onCancel} style={btn(false, { padding: 4 })}><X size={13} /></button>
      </div>

      <label style={label}>Address {form.resolving && <span style={{ fontWeight: 400, textTransform: 'none' }}>· looking up…</span>}</label>
      <AddressAutocomplete value={form.address} style={input} placeholder="Street address"
        onChange={text => setForm(f => f && ({ ...f, address: text }))}
        onSelect={geo => { if (!geo) return; setForm(f => f && ({ ...f, address: geo.address, lat: geo.lat, lng: geo.lng })); onPan?.(geo.lat, geo.lng) }} />

      <label style={label}>Customer name</label>
      <input style={input} value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} autoFocus />

      <label style={label}>Phone</label>
      <input style={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />

      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>Starts in New, owned by you, source Door Knock. Edit anything else from the lead detail.</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={onSave} disabled={saving} style={btn(true, { flex: 1, justifyContent: 'center' })}>{saving ? 'Saving…' : 'Add lead'}</button>
        <button onClick={onCancel} style={btn(false)}>Cancel</button>
      </div>
    </div>
  )
}
