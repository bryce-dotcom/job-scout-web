// Territory list with the active-filter card ("N unassigned · assign to me")
// and the pinned-leads footer.

import { X, Filter, UserPlus, Pencil, Trash2 } from 'lucide-react'
import { makeStyles } from './util'

export default function TerritoryPanel({
  t, compact, leads, visibleLeads, hiddenStages,
  territories, territoryCounts, employeeById, selectedTerritoryId,
  territoryFilter, setTerritoryFilter, filterLabel, filterPolygons, unassignedInFilter, claiming, onClaim, user,
  onZoom, onEdit, onDelete
}) {
  const { btn } = makeStyles(t)
  const isOnly = tr => String(territoryFilter) === String(tr.id)
  return (
    <>
      {filterLabel && (
        <div style={{ margin: 12, marginBottom: 0, padding: '10px 12px', borderRadius: 8, backgroundColor: t.accentBg, border: `1px solid ${t.accent}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 13, color: t.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Filter size={13} /> {filterLabel}</strong>
            <button onClick={() => setTerritoryFilter('all')} style={btn(false, { padding: '3px 7px' })} title="Show all leads"><X size={12} /></button>
          </div>
          <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 4 }}>
            {visibleLeads.length} lead{visibleLeads.length === 1 ? '' : 's'} on the map · {unassignedInFilter.length} unassigned
            {filterPolygons && filterPolygons.length === 0 && ' · you own no territories yet'}
          </div>
          {unassignedInFilter.length > 0 && user?.id && (
            <button onClick={onClaim} disabled={claiming} style={btn(true, { marginTop: 8, width: '100%', justifyContent: 'center', boxSizing: 'border-box' })}>
              <UserPlus size={13} /> {claiming ? 'Assigning…' : `Assign ${unassignedInFilter.length} unassigned to me`}
            </button>
          )}
        </div>
      )}

      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong style={{ fontSize: 13, color: t.text }}>Territories</strong>
          <span style={{ fontSize: 11, color: t.textMuted }}>{territories.length}</span>
        </div>
        {territories.length === 0 && (
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
            None yet. Use <b>Draw territory</b> to outline one, or turn on a boundary overlay and click a county, city, ZIP, or utility area to make it a territory.
          </div>
        )}
        {territories.map(tr => {
          const c = territoryCounts[tr.id] || { leads: 0, customers: 0, unassigned: 0 }
          const sel = tr.id === selectedTerritoryId
          return (
            <div key={tr.id} onClick={() => onZoom(tr)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 6px', borderRadius: 6, cursor: 'pointer', backgroundColor: sel ? t.accentBg : 'transparent', borderBottom: `1px solid ${t.border}` }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: tr.color, marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tr.name}</div>
                <div style={{ fontSize: 11, color: t.textMuted }}>
                  {c.leads} leads · {c.customers} customers{c.unassigned > 0 && <> · <span style={{ color: '#b45309' }}>{c.unassigned} unassigned</span></>}
                  {employeeById[tr.owner_id] && <> · {employeeById[tr.owner_id].name}</>}
                </div>
                {tr.utility_name && <div style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⚡ {tr.utility_name}</div>}
              </div>
              <button onClick={e => { e.stopPropagation(); setTerritoryFilter(isOnly(tr) ? 'all' : String(tr.id)) }} style={btn(isOnly(tr), { padding: 4 })} title={isOnly(tr) ? 'Show all leads' : 'Show only this territory'}><Filter size={12} /></button>
              <button onClick={e => { e.stopPropagation(); onEdit(tr) }} style={btn(false, { padding: 4 })} title="Edit"><Pencil size={12} /></button>
              <button onClick={e => { e.stopPropagation(); onDelete(tr) }} style={btn(false, { padding: 4, color: '#b91c1c' })} title="Delete"><Trash2 size={12} /></button>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '4px 12px 12px', fontSize: 11, color: t.textMuted, marginTop: 'auto' }}>
        {visibleLeads.length} of {leads.length} leads pinned{filterLabel ? ` · in ${filterLabel}` : ''}{hiddenStages?.size ? ` · ${hiddenStages.size} stage${hiddenStages.size > 1 ? 's' : ''} hidden` : ''}. {compact ? 'Tap' : 'Click'} a stage above to show or hide it.
      </div>
    </>
  )
}
