// New / edit territory form. The container owns the form state and the save;
// this only renders it.

import { X } from 'lucide-react'
import { makeStyles, PALETTE, TERRITORY_SOURCE_LABEL } from './util'

export default function TerritoryForm({ t, form, setForm, employees, user, utilityProviders, saving, onSave, onCancel, canManage = false, handoverCount = 0 }) {
  const { btn, input, label } = makeStyles(t)
  const ownerChanged = !!form.id && String(form.owner_id || '') !== String(form.prev_owner_id || '')
  const canHand = ownerChanged && !!form.owner_id && handoverCount > 0 && (canManage || String(form.owner_id) === String(user?.id))
  const newOwner = employees.find(e => String(e.id) === String(form.owner_id))
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14, color: t.text }}>{form.id ? 'Edit territory' : 'New territory'}</strong>
        <button onClick={onCancel} style={btn(false, { padding: 4 })}><X size={13} /></button>
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{TERRITORY_SOURCE_LABEL[form.source]}</div>

      <label style={label}>Name</label>
      <input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />

      <label style={label}>Color</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {PALETTE.map(c => <button key={c} onClick={() => setForm({ ...form, color: c })} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #111' : '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.2)', cursor: 'pointer' }} />)}
      </div>

      <label style={label}>Owner</label>
      <select style={input} value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })} disabled={!canManage && !!form.prev_owner_id && String(form.prev_owner_id) !== String(user?.id)}>
        <option value="">Unassigned</option>
        {(canManage ? employees : employees.filter(e => String(e.id) === String(user?.id) || String(e.id) === String(form.owner_id))).map(e => <option key={e.id} value={e.id}>{e.name}{e.id === user?.id ? ' (Me)' : ''}</option>)}
      </select>
      {canHand && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6, fontSize: 12, color: t.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!form.hand_leads} onChange={e => setForm({ ...form, hand_leads: e.target.checked })} style={{ marginTop: 2 }} />
          <span>Also hand its {handoverCount} lead{handoverCount > 1 ? 's' : ''} to {newOwner?.name || 'the new owner'} <span style={{ color: t.textMuted }}>(the ones the previous owner held here, plus any unowned)</span></span>
        </label>
      )}
      {ownerChanged && !!form.owner_id && handoverCount === 0 && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>No leads to hand over: nothing here is unowned or held by the previous owner.</div>}

      <label style={label}>Utility {form.detecting && <span style={{ fontWeight: 400, textTransform: 'none' }}>· detecting…</span>}</label>
      {utilityProviders.length > 0 && (
        <select style={{ ...input, marginBottom: 6 }} value={form.utility_provider_id} onChange={e => setForm({ ...form, utility_provider_id: e.target.value })}>
          <option value="">Not one of our providers</option>
          {utilityProviders.map(u => <option key={u.id} value={u.id}>{u.provider_name}{u.state ? ` (${u.state})` : ''}</option>)}
        </select>
      )}
      <input style={input} placeholder="Utility name (from the map)" value={form.utility_name} onChange={e => setForm({ ...form, utility_name: e.target.value })} />

      <label style={label}>Notes</label>
      <textarea style={{ ...input, minHeight: 60 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={onSave} disabled={saving} style={btn(true, { flex: 1, justifyContent: 'center' })}>{saving ? 'Saving…' : 'Save territory'}</button>
        <button onClick={onCancel} style={btn(false)}>Cancel</button>
      </div>
    </div>
  )
}
