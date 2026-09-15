// The planned route: distance, drive time, hand-off to Google Maps, stop list.

import { X, ExternalLink } from 'lucide-react'
import { makeStyles } from './util'
import { googleMapsUrl } from './routing'

export default function RoutePanel({ t, route, stageById, onClear, onSelectLead }) {
  const { btn } = makeStyles(t)
  return (
    <div style={{ padding: 12, borderBottom: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13, color: t.text }}>Route · {route.stops.length} stops</strong>
        <button onClick={onClear} style={btn(false, { padding: 4 })} title="Clear route"><X size={13} /></button>
      </div>
      <div style={{ fontSize: 12, color: t.textMuted, margin: '2px 0 8px' }}>
        {route.miles != null ? `${route.miles.toFixed(1)} mi · ${Math.round(route.minutes)} min driving (${route.provider})` : 'Straight-line order (directions unavailable)'}
        {!route.start.isYou && ' · from map center'}
      </div>
      <a href={googleMapsUrl(route)} target="_blank" rel="noreferrer" style={{ ...btn(true, { textDecoration: 'none', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }) }}>
        <ExternalLink size={12} /> Open in Google Maps{route.stops.length > 10 ? ' (first 10)' : ''}
      </a>
      <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: t.text }}>
        {route.stops.map((s, i) => (
          <li key={i} style={{ marginBottom: 3, cursor: 'pointer' }} onClick={() => onSelectLead?.(s.lead)}>
            {s.lead.customer_name || s.lead.business_name || 'Lead'}
            <span style={{ color: t.textMuted }}> · {stageById[s.lead.status]?.name || s.lead.status}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
