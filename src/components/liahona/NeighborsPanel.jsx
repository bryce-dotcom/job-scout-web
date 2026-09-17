// Cloverleaf: the parcels around a finished job (or any spot), nearest first,
// with the owner of record where the county publishes it. Tick the ones worth
// a knock, add them as leads in one go, or route them from where you stand.

import { X, Clover, Loader2, Route, UserPlus, Plus, Crosshair } from 'lucide-react'
import { makeStyles } from './util'
import { parcelSummary } from '../../lib/parcels'
import { parcelAddress } from './leadRows'
import { coverageLabel } from '../../lib/parcelSources'

const RADIUS_FT = [250, 500, 1000]
const ft = m => Math.round(m * 3.28084)

export default function NeighborsPanel({ t, data, selected, setSelected, stageById, onRadius, onAdd, onAddAll, onRoute, onFocus, onClose, adding, routing }) {
  const { btn } = makeStyles(t)
  const items = data.items || []
  const open = items.filter(i => !i.lead)
  const picked = open.filter(i => selected.has(i.key))
  const toggle = key => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const allOn = open.length > 0 && picked.length === open.length

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13, color: t.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clover size={14} color="#15803d" /> Neighbors</strong>
        <button onClick={onClose} style={btn(false, { padding: 4 })} title="Close"><X size={13} /></button>
      </div>
      <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
        around <span style={{ color: t.text, fontWeight: 600 }}>{data.label || 'this spot'}</span>
        {data.origin?.parcel?.owner_name && <span style={{ color: t.textMuted }}> · {data.origin.parcel.owner_name}</span>}
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '8px 0' }}>
        {RADIUS_FT.map(r => (
          <button key={r} onClick={() => onRadius(r)} disabled={data.loading} style={btn(data.radiusFt === r, { padding: '4px 8px', flex: 1, justifyContent: 'center' })}>{r} ft</button>
        ))}
      </div>

      {data.loading && <div style={{ fontSize: 12, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Reading the county parcels…</div>}
      {!data.loading && data.reason === 'no-source' && <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>No free parcel source covers this area yet. Free today: {coverageLabel()}. Elsewhere needs the nationwide parcel plan.</div>}
      {!data.loading && data.reason === 'expired' && <div style={{ fontSize: 12, color: '#b45309', padding: '8px 0' }}>The nationwide parcel token has expired. Free sources still work: {coverageLabel()}.</div>}
      {!data.loading && data.reason === 'error' && <div style={{ fontSize: 12, color: '#b91c1c', padding: '8px 0' }}>The county map server did not answer. Try again in a moment.</div>}
      {!data.loading && !data.reason && items.length === 0 && <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0' }}>No other parcels within {data.radiusFt} ft. Widen the ring.</div>}

      {items.length > 0 && !data.loading && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: t.textSecondary, marginBottom: 4 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(open.map(i => i.key)))} />
              {picked.length} of {open.length} picked
            </label>
            <span style={{ color: t.textMuted }}>{items.length - open.length > 0 ? `${items.length - open.length} already leads` : `${items.length} parcels`}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={onAddAll} disabled={!picked.length || adding} style={btn(true, { flex: 1, justifyContent: 'center' })}>
              {adding ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={13} />} Add {picked.length || ''} as leads
            </button>
            <button onClick={onRoute} disabled={!picked.length || routing} style={btn(false, { flex: 1, justifyContent: 'center' })}>
              {routing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Route size={13} />} Route
            </button>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it, i) => {
              const pc = it.parcel, addr = parcelAddress(pc) || 'No address on record'
              const stage = it.lead ? stageById[it.lead.status] : null
              return (
                <li key={it.key} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: `1px solid ${t.border}`, alignItems: 'flex-start', opacity: it.lead ? 0.65 : 1 }}>
                  {it.lead
                    ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: stage?.color || '#71717a', color: '#fff', font: '700 11px system-ui', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    : <input type="checkbox" checked={selected.has(it.key)} onChange={() => toggle(it.key)} style={{ marginTop: 3, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onFocus(it)}>
                    <div style={{ fontSize: 13, color: t.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{!it.lead && <span style={{ color: t.textMuted, fontWeight: 400 }}>{i + 1}. </span>}{pc.owner_name || addr}</div>
                    {pc.owner_name && <div style={{ fontSize: 12, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</div>}
                    <div style={{ fontSize: 11, color: t.textMuted }}>
                      {ft(it.distance_m)} ft{parcelSummary(pc) ? ` · ${parcelSummary(pc)}` : ''}
                      {it.lead && <span style={{ color: stage?.color || t.textMuted, fontWeight: 600 }}> · already a lead ({stage?.name || it.lead.status})</span>}
                    </div>
                  </div>
                  {!it.lead && <button onClick={() => onAdd(it)} style={btn(false, { padding: '4px 6px', flexShrink: 0 })} title="Open as a new lead with the details filled in"><Plus size={12} /></button>}
                </li>
              )
            })}
          </ol>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}><Crosshair size={11} /> Tap a row to see it on the map. {data.provider === 'regrid' ? 'Nationwide parcel data (metered).' : `${data.county || 'County'} assessor, free.`}</div>
        </>
      )}
    </div>
  )
}
