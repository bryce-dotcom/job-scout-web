// Liahona toolbar: search, mode switch, territory filter, route, overlays,
// fit, and the geocode-backlog button. Presentational — every action is a prop.

import { useMemo } from 'react'
import { Search, MapPin, PenTool, Route, Layers, MousePointer2, Loader2, LocateFixed, Maximize2, Sparkles, Clover } from 'lucide-react'
import { OVERLAYS } from '../../lib/mapOverlays'
import { makeStyles } from './util'

const STATUS_TEXT = { loading: 'loading…', zoom: 'zoom in to load', error: 'unavailable', empty: 'none here', nosource: 'no parcel source here', expired: 'parcel token expired' }

export default function LiahonaToolbar({
  t, compact, mode, onMode,
  searchText, setSearchText, onSearch, searching,
  territories, territoryFilter, setTerritoryFilter, user,
  onPlanRoute, routing,
  activeOverlays, overlayStatus, showOverlayMenu, setShowOverlayMenu, toggleOverlay,
  onFit, unmappedCount, geocoding, onGeocodeMissing, onFindProspects
}) {
  const { btn, input, label } = makeStyles(t)
  const pad = compact ? { padding: '9px 10px' } : {}
  const iconSize = compact ? 16 : 13
  const groupedOverlays = useMemo(() => {
    const g = {}
    for (const o of OVERLAYS) (g[o.group] = g[o.group] || []).push(o)
    return g
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderBottom: `1px solid ${t.border}`, backgroundColor: t.bgCard, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <Search size={14} style={{ position: 'absolute', left: 8, top: 9, color: t.textMuted }} />
        <input
          value={searchText} onChange={e => setSearchText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSearch() }}
          placeholder="Search an address or area…"
          style={{ ...input, paddingLeft: 26 }}
        />
        {searching && <Loader2 size={14} style={{ position: 'absolute', right: 8, top: 9, color: t.textMuted, animation: 'spin 1s linear infinite' }} />}
      </div>

      <div style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <button title="Select" onClick={() => onMode('select')} style={btn(mode === 'select', { border: 0, borderRadius: 0, ...pad })}><MousePointer2 size={iconSize} />{!compact && ' Select'}</button>
        <button title="Tap the map to add a lead" onClick={() => onMode('drop')} style={btn(mode === 'drop', { border: 0, borderRadius: 0, ...pad })}><MapPin size={iconSize} />{!compact && ' Drop lead'}</button>
        <button title="Tap points to outline a territory" onClick={() => onMode('draw')} style={btn(mode === 'draw', { border: 0, borderRadius: 0, ...pad })}><PenTool size={iconSize} />{!compact && ' Draw territory'}</button>
        <button title="Cloverleaf: tap a finished job or any house to list its neighbors with owner names" onClick={() => onMode('neighbors')} style={btn(mode === 'neighbors', { border: 0, borderRadius: 0, ...pad, ...(mode === 'neighbors' ? { backgroundColor: '#15803d', borderColor: '#15803d' } : { color: '#15803d' }) })}><Clover size={iconSize} />{!compact && ' Neighbors'}</button>
      </div>

      {territories.length > 0 && (
        <select value={territoryFilter} onChange={e => setTerritoryFilter(e.target.value)} title="Limit the map to a territory"
          style={{ ...input, width: 'auto', maxWidth: compact ? 150 : 200, padding: compact ? '8px 8px' : '6px 8px', fontSize: 12, fontWeight: 600, color: territoryFilter === 'all' ? t.textSecondary : t.accent, borderColor: territoryFilter === 'all' ? t.border : t.accent }}>
          <option value="all">All territories</option>
          {territories.some(tr => user?.id && String(tr.owner_id) === String(user.id)) && <option value="mine">My territories</option>}
          {territories.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
        </select>
      )}

      {onFindProspects && (
        <button onClick={onFindProspects} style={btn(false, { color: '#7c3aed', borderColor: '#c4b5fd', ...pad })} title="Find Prospects AI: research businesses and plot them on the map">
          <Sparkles size={iconSize} />{!compact && ' Find Prospects'}
        </button>
      )}
      <button onClick={onPlanRoute} disabled={routing} style={btn(false, pad)} title="Order the open leads in view into a driving route">
        {routing ? <Loader2 size={iconSize} style={{ animation: 'spin 1s linear infinite' }} /> : <Route size={iconSize} />}{!compact && ' Plan route'}
      </button>

      <div style={{ position: compact ? 'static' : 'relative' }}>
        <button onClick={() => setShowOverlayMenu(v => !v)} style={btn(showOverlayMenu, pad)}><Layers size={iconSize} />{!compact && ' Overlays'}{activeOverlays.size > 1 ? ` (${activeOverlays.size})` : ''}</button>
        {showOverlayMenu && (
          <div style={compact
            ? { position: 'absolute', left: 8, right: 8, top: 52, zIndex: 1200, backgroundColor: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: '6px 0', maxHeight: '60vh', overflowY: 'auto' }
            : { position: 'absolute', right: 0, top: '110%', zIndex: 1200, width: 280, backgroundColor: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: '6px 0' }}>
            {Object.entries(groupedOverlays).map(([group, items]) => (
              <div key={group}>
                <div style={{ ...label, padding: '0 12px', margin: '6px 0 2px' }}>{group}</div>
                {items.map(o => {
                  const on = activeOverlays.has(o.id), st = overlayStatus[o.id]
                  return (
                    <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: t.text }}>
                      <input type="checkbox" checked={on} onChange={() => toggleOverlay(o.id)} />
                      {o.color && <span style={{ width: 10, height: 10, borderRadius: 2, background: o.color, flexShrink: 0 }} />}
                      <span style={{ flex: 1 }}>{o.label}{o.hint && <span style={{ display: 'block', fontSize: 11, color: t.textMuted }}>{o.hint}</span>}</span>
                      {on && st && st !== 'ok' && <span style={{ fontSize: 10, color: t.textMuted }}>{STATUS_TEXT[st]}</span>}
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onFit} style={btn(false, pad)} title="Fit map to the visible pins"><Maximize2 size={iconSize} /></button>

      {unmappedCount > 0 && (
        <button onClick={onGeocodeMissing} disabled={!!geocoding} style={btn(false, { color: '#b45309', borderColor: '#f3d7b3', ...pad })} title="Look up coordinates for leads that only have an address">
          {geocoding ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> {geocoding.done}/{geocoding.total}</> : <><LocateFixed size={iconSize} />{compact ? ` ${unmappedCount}` : ` Map ${unmappedCount} unpinned`}</>}
        </button>
      )}
    </div>
  )
}
