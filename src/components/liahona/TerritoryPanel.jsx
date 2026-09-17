// Territory list with the active-filter card ("N unassigned · assign to me")
// and the pinned-leads footer.

import { useState } from 'react'
import { X, Filter, UserPlus, Pencil, Trash2, Users, ChevronDown, ChevronRight } from 'lucide-react'
import { makeStyles } from './util'

export default function TerritoryPanel({
  t, compact, leads, visibleLeads, hiddenStages,
  territories, territoryCounts, employeeById, selectedTerritoryId,
  territoryFilter, setTerritoryFilter, filterLabel, filterPolygons, unassignedInFilter, claiming, onClaim, user,
  onZoom, onEdit, onDelete,
  canManage = false, employees = [], repStats = [], onAssignTerritory
}) {
  const { btn, input } = makeStyles(t)
  const isOnly = tr => String(territoryFilter) === String(tr.id)
  const [assignTo, setAssignTo] = useState('')
  const [showReps, setShowReps] = useState(false)
  return (
    <>
      {/* Manager's view of who carries what. Reps see it too: it's only counts. */}
      {repStats.length > 0 && (
        <div style={{ padding: '10px 12px 0' }}>
          <div onClick={() => setShowReps(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: t.textSecondary }}>
            {showReps ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Users size={13} /> By rep <span style={{ fontWeight: 400, color: t.textMuted }}>· {repStats.length}</span>
          </div>
          {showReps && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              {repStats.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', color: t.text }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}{String(r.id) === String(user?.id) ? ' (Me)' : ''}</span>
                  <span style={{ color: t.textMuted, whiteSpace: 'nowrap' }}>{r.territories} terr · {r.leads} open{r.stale > 0 && <span style={{ color: '#b45309' }}> · {r.stale} idle 14d+</span>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          {unassignedInFilter.length > 0 && user?.id && !canManage && (
            <button onClick={() => onClaim()} disabled={claiming} style={btn(true, { marginTop: 8, width: '100%', justifyContent: 'center', boxSizing: 'border-box' })}>
              <UserPlus size={13} /> {claiming ? 'Assigning…' : `Assign ${unassignedInFilter.length} unassigned to me`}
            </button>
          )}
          {unassignedInFilter.length > 0 && canManage && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ ...input, flex: 1, padding: '6px 8px', fontSize: 12 }}>
                <option value="">Assign {unassignedInFilter.length} unassigned to…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{String(e.id) === String(user?.id) ? ' (Me)' : ''}</option>)}
              </select>
              <button onClick={() => onClaim(assignTo)} disabled={claiming || !assignTo} style={btn(true, { padding: '6px 10px' })} title="Give these leads to the chosen rep"><UserPlus size={13} /></button>
            </div>
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
                {tr.owner_id && (() => {
                  // Reps can hand unowned leads to the owner; managers can also pull in leads other reps hold here.
                  const n = canManage ? c.unassigned + (c.othersIds?.length || 0) : c.unassigned
                  const allowed = canManage || String(tr.owner_id) === String(user?.id)
                  return n > 0 && allowed ? (
                    <button onClick={e => { e.stopPropagation(); onAssignTerritory?.(tr) }} disabled={claiming} style={btn(false, { marginTop: 4, padding: '3px 8px', fontSize: 11, color: t.accent })}>
                      <UserPlus size={11} /> Assign {n} to {employeeById[tr.owner_id]?.name?.split(' ')[0] || 'owner'}
                    </button>
                  ) : null
                })()}
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
