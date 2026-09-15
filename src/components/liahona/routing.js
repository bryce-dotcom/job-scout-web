// Route planning for Liahona: order the open leads in view from where the
// rep is standing, then get real road geometry. Google Directions (with its
// waypoint optimisation) when the Maps key works, the public OSRM server
// otherwise, straight lines as the last resort. Nothing here touches React.

import { loadGoogleMaps } from '../../lib/googleMaps'
import { googleMapsUsable, markGoogleMapsBroken } from '../../lib/geocode'
import { dist, withTimeout } from './util'

export const MAX_STOPS = 25

// Where to start: the phone's GPS if it answers quickly, else the map center.
// Chrome doesn't start the geolocation timeout until the permission prompt is
// answered, so keep a hard deadline of our own.
export function getStartPoint(map) {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null)
    const done = setTimeout(() => res(null), 5000)
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(done); res({ lat: p.coords.latitude, lng: p.coords.longitude, isYou: true }) },
      () => { clearTimeout(done); res(null) }, { timeout: 4000, maximumAge: 60000 }
    )
  }).then(pt => pt || { lat: map.getCenter().lat, lng: map.getCenter().lng, isYou: false })
}

// Greedy nearest-neighbour from the start point, capped for the directions APIs.
export function orderStops(start, leads) {
  let cur = start, left = leads.map(l => ({ lat: Number(l.latitude), lng: Number(l.longitude), lead: l })), order = []
  while (left.length && order.length < MAX_STOPS) {
    let best = null, bd = Infinity
    for (const s of left) { const d = dist(cur, s); if (d < bd) { bd = d; best = s } }
    order.push(best); left = left.filter(x => x !== best); cur = best
  }
  return order
}

// Returns { start, stops, path: [[lat,lng]...], miles, minutes, provider }.
export async function buildRoute(start, leads) {
  let order = orderStops(start, leads)
  let path = null, miles = null, minutes = null, provider = 'straight'

  if (googleMapsUsable()) {
    try {
      const google = await withTimeout(loadGoogleMaps(), 8000, 'Google Maps did not load').catch(e => { markGoogleMapsBroken(); throw e })
      const svc = new google.maps.DirectionsService()
      const res = await withTimeout(svc.route({
        origin: { lat: start.lat, lng: start.lng },
        destination: { lat: order[order.length - 1].lat, lng: order[order.length - 1].lng },
        waypoints: order.slice(0, -1).map(s => ({ location: { lat: s.lat, lng: s.lng }, stopover: true })),
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING
      }), 15000, 'Directions timed out')
      const r = res.routes[0]
      const mid = order.slice(0, -1)
      order = [...r.waypoint_order.map(i => mid[i]), order[order.length - 1]]
      path = r.overview_path.map(p => [p.lat(), p.lng()])
      miles = r.legs.reduce((s, l) => s + l.distance.value, 0) / 1609.34
      minutes = r.legs.reduce((s, l) => s + l.duration.value, 0) / 60
      provider = 'Google'
    } catch { /* fall back to OSRM */ }
  }
  if (!path) {
    try {
      const coords = [start, ...order].map(p => `${p.lng},${p.lat}`).join(';')
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
      const j = await res.json()
      const r = j.routes[0]
      path = r.geometry.coordinates.map(([lng, lat]) => [lat, lng])
      miles = r.distance / 1609.34; minutes = r.duration / 60; provider = 'OSRM'
    } catch {
      path = [start, ...order].map(p => [p.lat, p.lng])
    }
  }
  return { start, stops: order, path, miles, minutes, provider }
}

// Draw a built route into a Leaflet layer group: the line, a "you" dot, and
// numbered stop markers.
export function drawRoute(L, group, route) {
  group.clearLayers()
  L.polyline(route.path, { color: '#111', weight: 4, opacity: 0.75, dashArray: route.provider === 'straight' ? '6 6' : null }).addTo(group)
  if (route.start.isYou) L.circleMarker([route.start.lat, route.start.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('You').addTo(group)
  route.stops.forEach((s, i) => L.marker([s.lat, s.lng], {
    icon: L.divIcon({ className: '', html: `<div style="background:#111;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font:700 11px system-ui;border:2px solid #fff">${i + 1}</div>`, iconSize: [20, 20], iconAnchor: [10, 28] }),
    interactive: false
  }).addTo(group))
}

// Hand-off link; the Google Maps URL scheme takes at most ~10 points.
export function googleMapsUrl(route) {
  const pts = route.stops.slice(0, 10)
  const dest = pts[pts.length - 1]
  const way = pts.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${route.start.lat},${route.start.lng}&destination=${dest.lat},${dest.lng}${way ? '&waypoints=' + encodeURIComponent(way) : ''}&travelmode=driving`
}
