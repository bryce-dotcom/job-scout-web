// Shared helpers for the Liahona map components. No React in here.

export const PALETTE = ['#5a6349', '#2457a8', '#b45309', '#7c3aed', '#0f766e', '#b91c1c', '#0369a1', '#a16207']
export const US_CENTER = [39.5, -98.35]

// Theme tokens with fallbacks so the map renders the same with or without a
// Layout theme (the mobile pipeline passes its own smaller palette).
export const themeTokens = theme => ({
  bg: theme?.bg || '#f7f5ef', bgCard: theme?.bgCard || '#fff', border: theme?.border || '#d6cdb8',
  text: theme?.text || '#2c3530', textSecondary: theme?.textSecondary || '#4d5a52',
  textMuted: theme?.textMuted || '#7d8a7f', accent: theme?.accent || '#5a6349',
  accentBg: theme?.accentBg || 'rgba(90,99,73,0.12)'
})

// Inline-style helpers every panel uses. btn(active, extra) is the one button look.
export const makeStyles = t => ({
  btn: (active, extra = {}) => ({
    display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
    border: `1px solid ${active ? t.accent : t.border}`, backgroundColor: active ? t.accent : t.bgCard,
    color: active ? '#fff' : t.textSecondary, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', ...extra
  }),
  input: { width: '100%', padding: '7px 9px', border: `1px solid ${t.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: t.bgCard, color: t.text, boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '11px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '10px 0 4px' }
})

// Leaflet is loaded from the CDN on first use, the same way FieldScout and
// JobsMap do (shared element ids so they never double-load).
let leafletPromise = null
export function ensureLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    let script = document.getElementById('leaflet-js')
    if (!script) {
      script = document.createElement('script')
      script.id = 'leaflet-js'
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => resolve(window.L))
    script.addEventListener('error', () => reject(new Error('Leaflet failed to load')))
    if (window.L) resolve(window.L)
  })
  return leafletPromise
}

export const hasCoords = l => l && l.latitude != null && l.longitude != null && !Number.isNaN(Number(l.latitude))

// Cheap planar distance in degrees, good enough for nearest-neighbour ordering.
export const dist = (a, b) => {
  const dx = (a.lng - b.lng) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180), dy = a.lat - b.lat
  return Math.hypot(dx, dy)
}

// Google Maps never calls back if the key is referrer-restricted or the script
// is blocked, so anything that waits on it gets a deadline.
export const withTimeout = (p, ms, label = 'timed out') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms))])

export const initials = name => (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
export const minutesAgo = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// Last map position per device (and company), so reopening Liahona lands
// where the rep left it instead of zooming out to fit every pin in the
// region. Kept in localStorage; a private window simply falls back to fit.
const viewKey = companyId => `liahona.view.${companyId || 'x'}`
export const loadView = companyId => {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(companyId)) || 'null')
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom) ? v : null
  } catch { return null }
}
export const saveView = (companyId, map) => {
  try {
    const c = map.getCenter()
    localStorage.setItem(viewKey(companyId), JSON.stringify({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() }))
  } catch { /* storage unavailable */ }
}

export const TERRITORY_SOURCE_LABEL = {
  drawn: 'Drawn by hand', county: 'From county boundary', city: 'From city boundary', zip: 'From ZIP code', utility: 'From utility territory'
}

// A knock logged from the lead card is a lead_follow_ups row with method
// 'visit' and a note that starts "Knocked: …". The outcome drives the badge
// on the pin and the day's tally per rep.
export const KNOCK_OUTCOMES = {
  not_home: { label: 'Not home', color: '#9ca3af', re: /not home/i },
  talked: { label: 'Talked', color: '#16a34a', re: /talked/i },
  left_card: { label: 'Left card', color: '#3b82f6', re: /left a card|left card/i },
  callback: { label: 'Callback', color: '#f59e0b', re: /callback/i }
}
export function knockOutcome(row) {
  if (!row || row.method !== 'visit') return null
  const note = row.note || ''
  for (const [id, o] of Object.entries(KNOCK_OUTCOMES)) if (o.re.test(note)) return { id, ...o }
  return { id: 'visit', label: 'Visited', color: '#6b7280' }
}
export const isToday = iso => {
  if (!iso) return false
  const d = new Date(iso), n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
