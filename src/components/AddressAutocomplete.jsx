// Address input with suggestions, so addresses arrive clean and already
// geocoded instead of as "3550 W 899 S SLC" that a cron has to puzzle out.
//
// Google Places when the Maps key works for this origin (same widget the Zach
// pages use). Otherwise Photon (OpenStreetMap, no key) so the field still
// suggests something rather than silently degrading to a plain box.
//
// Contract: onChange(text) fires on every keystroke like a normal input;
// onSelect({ address, lat, lng }) fires when a suggestion is picked, and
// onSelect(null) when the user types again afterward — so the form knows
// whether the coordinates it holds still describe the text.

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/googleMaps'
import { googleMapsUsable, markGoogleMapsBroken } from '../lib/geocode'

// Bias suggestions toward where the company works; Photon has no country
// filter, so a bounding box does the job (Mountain West, wide).
const BIAS = { lat: 40.76, lon: -111.89 }
const BBOX = '-120.5,31,-104,45.5'

const photonLabel = p => {
  const street = [p.housenumber, p.street || (p.type === 'house' ? p.name : null)].filter(Boolean).join(' ')
  const head = street || p.name || ''
  const tail = [p.city || p.town || p.village || p.county, [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [head, tail].filter(Boolean).join(', ')
}

export default function AddressAutocomplete({
  value, onChange, onSelect, placeholder = 'Street address', style, name = 'address', autoFocus = false, disabled = false
}) {
  const inputRef = useRef(null)
  const acRef = useRef(null)
  const timerRef = useRef(null)
  const watchRef = useRef(null)
  const [useGoogle, setUseGoogle] = useState(false)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // Attach the Google widget once, if the key works here.
  useEffect(() => {
    let alive = true
    if (!googleMapsUsable() || !inputRef.current) return
    const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    Promise.race([loadGoogleMaps(), deadline]).then(google => {
      if (!alive || !inputRef.current || !google?.maps?.places?.Autocomplete) return
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry'],
        types: ['address'],
        componentRestrictions: { country: 'us' }
      })
      acRef.current = ac
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        const loc = place?.geometry?.location
        if (!place?.formatted_address) return
        const address = place.formatted_address.replace(/, USA$/, '')
        onChange?.(address)
        onSelect?.(loc ? { address, lat: loc.lat(), lng: loc.lng() } : null)
      })
      setUseGoogle(true)
    }).catch(() => { markGoogleMapsBroken() })
    // Key rejected after the widget attached (invalid or referrer-restricted):
    // drop the widget and let Photon take over.
    const onBroken = () => {
      if (acRef.current && window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(acRef.current)
      acRef.current = null
      setUseGoogle(false)
    }
    window.addEventListener('google-maps-broken', onBroken)
    return () => {
      alive = false
      clearTimeout(watchRef.current); clearTimeout(timerRef.current)
      window.removeEventListener('google-maps-broken', onBroken)
      if (acRef.current && window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(acRef.current)
      acRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Photon fallback: debounced suggestions while typing.
  const fetchPhoton = q => {
    clearTimeout(timerRef.current)
    if (!q || q.trim().length < 4) { setItems([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?limit=6&lang=en&lat=${BIAS.lat}&lon=${BIAS.lon}&bbox=${BBOX}&q=${encodeURIComponent(q)}`
        const j = await fetch(url, { signal: AbortSignal.timeout(6000) }).then(r => r.json())
        const seen = new Set()
        const list = (j.features || []).map(f => ({
          label: photonLabel(f.properties), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0]
        })).filter(x => x.label && !seen.has(x.label) && seen.add(x.label))
        setItems(list); setOpen(list.length > 0); setActive(-1)
      } catch { setItems([]); setOpen(false) }
    }, 250)
  }

  const handleInput = e => {
    const text = e.target.value
    onChange?.(text)
    onSelect?.(null)          // typed text no longer matches any picked coordinates
    if (!useGoogle) { fetchPhoton(text); return }
    // Watchdog: a rejected or over-quota key leaves Google's widget attached
    // but silent (no gm_authFailure without a map on the page). If nothing
    // has been suggested a few seconds after real typing, switch to Photon.
    clearTimeout(watchRef.current)
    if (text.trim().length >= 5) {
      watchRef.current = setTimeout(() => {
        if (!document.querySelector('.pac-container .pac-item')) { markGoogleMapsBroken(); fetchPhoton(text) }
      }, 3000)
    }
  }

  const pick = item => {
    onChange?.(item.label)
    onSelect?.({ address: item.label, lat: item.lat, lng: item.lng })
    setItems([]); setOpen(false)
  }

  const onKeyDown = e => {
    if (useGoogle || !open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value ?? ''}
        onChange={handleInput}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (!useGoogle && items.length) setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        style={style}
      />
      {!useGoogle && open && (
        <ul role="listbox" style={{
          position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 1300, margin: '2px 0 0', padding: '4px 0', listStyle: 'none',
          backgroundColor: '#fff', border: '1px solid #d6cdb8', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxHeight: 220, overflowY: 'auto'
        }}>
          {items.map((it, i) => (
            <li key={it.label} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(it) }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', color: '#2c3530', backgroundColor: i === active ? 'rgba(90,99,73,0.12)' : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
