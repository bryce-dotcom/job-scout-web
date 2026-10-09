// Chris Christmas Lighting — price a roofline from the air.
//
// Antonino Lawn Care asked for it. A lawn crew has the customers, the trucks
// and nothing to do in December, so this is the winter half of Zach's year.
//
// The flow: type an address, the free Census geocoder finds it, free Esri
// imagery draws it, Claude proposes the runs you would hang lights on, the rep
// confirms them, and the toggle decides how much of the house is lit. The feet
// are real traced feet at a scale the map gives us exactly — no calibration
// step, no multiplier, no guessing.
//
// The estimate goes out through createEstimateFromIntake like every other
// agent that produces a bid. There is one writer of quotes and quote_lines.

import { useState, useRef, useMemo } from 'react'
import { MapPin, Sparkles, Trash2, Undo2, FileText, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { useTheme } from '../../components/Layout'
import { toast } from '../../lib/toast'
import PageHeader from '../../components/PageHeader'
import SearchableSelect from '../../components/SearchableSelect'
import { createEstimateFromIntake } from '../../lib/estimateIntake'
import {
  TILE_PX, ATTRIBUTION, geocodeUrl, tilePlan, firstGeocodeMatch, geocodeProblem,
  tileXY, tilemapUrl, tilemapHasImagery, gridFor, ZOOM_LADDER,
} from '../../lib/aerialTile'
import {
  COVERAGE, FACES, feetPerPixel, runLengthFt, coverageFeet, coverageOptions,
  lightsPrice, quoteProblem, lightsIntakeLines,
} from '../../lib/chrisLights'


const FACE_COLOR = { front: '#e11d48', side: '#f59e0b', back: '#3b82f6' }

export default function ChrisLights() {
  const theme = useTheme()
  const companyId = useStore((s) => s.companyId)
  const customers = useStore((s) => s.customers)
  const user = useStore((s) => s.user)
  const getSettingValue = useStore((s) => s.getSettingValue)

  const [address, setAddress] = useState('')
  const [place, setPlace] = useState(null)          // { lat, lng, matched }
  const [imageUrl, setImageUrl] = useState(null)
  const [plan, setPlan] = useState(null)
  const [zoom, setZoom] = useState(null)
  const [finding, setFinding] = useState(false)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [runs, setRuns] = useState([])
  const [draft, setDraft] = useState([])             // points of the run being drawn
  const [face, setFace] = useState('front')
  const [coverage, setCoverage] = useState('full')
  const [customerId, setCustomerId] = useState('')
  const [aiNote, setAiNote] = useState(null)

  const canvasRef = useRef(null)

  // Per-foot price lives in settings so every tenant sets their own. No
  // default rate is invented here — a made-up number that reaches a customer
  // is worse than a page that says it needs configuring.
  const cfg = useMemo(() => {
    try {
      const raw = getSettingValue?.('chris_lights_config')
      return typeof raw === 'string' ? JSON.parse(raw) : (raw || {})
    } catch { return {} }
  }, [getSettingValue])
  const perFootRate = Number(cfg?.per_foot_rate) || 0
  const minimumCharge = Number(cfg?.minimum_charge) || 0

  const feetPerPx = place && zoom ? feetPerPixel(place.lat, zoom) : null
  const options = useMemo(() => coverageOptions(runs), [runs])
  const feet = coverageFeet(runs, coverage)
  const priced = lightsPrice({ feet, perFootRate, minimumCharge })
  const problem = quoteProblem({ runs, coverage, perFootRate })

  // ── Find the house ──────────────────────────────────────────────────────
  const findAddress = async () => {
    setFinding(true)
    setRuns([]); setDraft([]); setAiNote(null); setImageUrl(null)
    let payload = null
    try {
      payload = await (await fetch(geocodeUrl(address))).json()
    } catch { payload = null }
    const bad = geocodeProblem(address, payload)
    if (bad) { toast.error(bad); setFinding(false); return }

    const match = firstGeocodeMatch(payload)

    // Deepest zoom that actually HAS imagery here. Esri answers 200 with a
    // grey "Map data not yet available" JPEG rather than a 404, so asking
    // the tilemap is the only honest way to know — zoom 20 looked fine over
    // Highland, Utah and rendered nine grey squares.
    let z = null
    for (const candidate of ZOOM_LADDER) {
      const t = tileXY(match.lat, match.lng, candidate)
      try {
        const tm = await (await fetch(tilemapUrl(candidate, Math.floor(t.y), Math.floor(t.x)))).json()
        if (tilemapHasImagery(tm)) { z = candidate; break }
      } catch { /* try the next one down */ }
    }
    if (!z) {
      toast.error('No aerial imagery for that address. Try a nearby address, or trace from a photo.')
      setFinding(false); return
    }

    const p = tilePlan(match.lat, match.lng, z, gridFor(match.lat, z))
    setPlace(match)
    setZoom(z)
    setPlan(p)

    // Stitch the tiles onto a canvas. Esri needs no key, so this works for
    // every tenant on day one with nothing configured.
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = p.size; canvas.height = p.size
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#2c3530'; ctx.fillRect(0, 0, p.size, p.size)
    await Promise.all(p.tiles.map((t) => new Promise((done) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, t.dx, t.dy, TILE_PX, TILE_PX); done() }
      img.onerror = () => done()          // a missing tile leaves a dark square, not a crash
      img.src = t.url
    })))
    try { setImageUrl(canvas.toDataURL('image/jpeg', 0.9)) }
    catch { toast.error('Could not read the imagery back. Try again.') }
    setFinding(false)
  }

  // ── Let Chris propose the runs ──────────────────────────────────────────
  const readRoof = async () => {
    if (!imageUrl || !place) return
    setReading(true)
    try {
      const { data, error } = await supabase.functions.invoke('chris-roofline', {
        body: {
          company_id: companyId,
          image_base64: imageUrl.replace(/^data:image\/\w+;base64,/, ''),
          lat: place.lat, lng: place.lng, zoom,
          address: place.matched, image_width: plan?.size, feet_per_pixel: feetPerPx,
        },
      })
      if (error) throw error
      // Cross-check the model against itself: it reports est_ft, we measure
      // its own points. When those disagree badly it has traced a fence or
      // two houses as one, and a 152 ft "front eave" is how an overbilled
      // quote starts. Flag it rather than price it.
      const all = (data?.runs || []).map((r, i) => {
        const length_ft = runLengthFt(r.points, feetPerPx)
        const est = Number(r.est_ft)
        const disputed = Number.isFinite(est) && est > 0
          && (length_ft / est > 1.6 || est / length_ft > 1.6)
        return { id: `ai-${i}`, face: r.face, note: r.note, points: r.points, length_ft, est_ft: est || null, disputed, source: 'ai' }
      }).filter((r) => r.length_ft > 0)
      const proposed = all.filter((r) => !r.disputed)
      const dropped = all.length - proposed.length
      setRuns(proposed)
      if (dropped) toast.info(`${dropped} proposed run${dropped === 1 ? '' : 's'} did not add up and ${dropped === 1 ? 'was' : 'were'} left off — trace ${dropped === 1 ? 'it' : 'them'} by hand.`)
      setAiNote(data?.notes || null)
      if (!proposed.length) toast.info(data?.notes || 'Nothing proposed — trace the runs by hand.')
      else toast.success(`${proposed.length} runs proposed — check them before quoting`)
    } catch (e) {
      toast.error('Could not read the roof: ' + (e?.message || 'unknown error'))
    }
    setReading(false)
  }

  // ── Trace by hand ───────────────────────────────────────────────────────
  const addPoint = (e) => {
    if (!imageUrl) return
    const box = e.currentTarget.getBoundingClientRect()
    const scale = (plan?.size || 1) / box.width
    setDraft((d) => [...d, { x: (e.clientX - box.left) * scale, y: (e.clientY - box.top) * scale }])
  }
  const finishRun = () => {
    if (draft.length < 2) { toast.error('Tap at least two points along the run.'); return }
    setRuns((r) => [...r, {
      id: `me-${Date.now()}`, face, points: draft,
      length_ft: runLengthFt(draft, feetPerPx), source: 'traced',
    }])
    setDraft([])
  }

  // ── Turn it into an estimate ────────────────────────────────────────────
  const createEstimate = async () => {
    if (problem) { toast.error(problem); return }
    setSaving(true)
    try {
      const { quote } = await createEstimateFromIntake(supabase, {
        source: 'chris',
        company_id: companyId,
        customer_id: customerId ? parseInt(customerId) : null,
        salesperson_id: user?.id || null,
        service_type: 'Christmas Lighting',
        estimate_name: `Christmas lights — ${place?.matched || address}`,
        summary: `${feet} ft of roofline · ${COVERAGE[coverage].label}`,
        notes: [
          `Address: ${place?.matched || address}`,
          `Measured from aerial imagery at zoom ${zoom} (${feetPerPx?.toFixed(3)} ft/px).`,
          `${ATTRIBUTION}.`,
        ].join(String.fromCharCode(10)),
        quote_amount: priced.total,
        lines: lightsIntakeLines({ runs, coverage, perFootRate, minimumCharge, address: place?.matched }),
      })
      toast.success('Estimate created')
      if (quote?.id) window.location.assign(`/estimates/${quote.id}`)
    } catch (e) {
      toast.error('Could not create the estimate: ' + (e?.message || 'unknown error'))
    }
    setSaving(false)
  }

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16 }
  const input = {
    padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: 8,
    fontSize: 14, color: theme.text, backgroundColor: theme.bgCard, boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Chris Christmas Lighting"
        subtitle="Find the house, trace the roofline, price it by the foot"
      />

      {/* Address */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') findAddress() }}
            placeholder="123 Main St, Highland, UT"
            style={{ ...input, flex: 1, minWidth: 220 }}
          />
          <button type="button" onClick={findAddress} disabled={finding}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', minHeight: 44, backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: finding ? 'not-allowed' : 'pointer', opacity: finding ? 0.6 : 1 }}>
            {finding ? <Loader2 size={16} /> : <MapPin size={16} />} {finding ? 'Finding…' : 'Find it'}
          </button>
        </div>
        {place && (
          <p style={{ fontSize: 12.5, color: theme.textMuted, margin: '8px 0 0' }}>
            {place.matched} · {feetPerPx?.toFixed(3)} ft per pixel — measured, not estimated
          </p>
        )}
      </div>

      {imageUrl && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="responsive-grid">
          {/* The roof */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button type="button" onClick={readRoof} disabled={reading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', minHeight: 40, backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: reading ? 'not-allowed' : 'pointer', opacity: reading ? 0.6 : 1 }}>
                <Sparkles size={15} /> {reading ? 'Reading the roof…' : 'Read the roof'}
              </button>
              {FACES.map((f) => (
                <button key={f} type="button" onClick={() => setFace(f)}
                  style={{ padding: '8px 12px', minHeight: 40, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                    border: `1px solid ${face === f ? FACE_COLOR[f] : theme.border}`,
                    backgroundColor: face === f ? FACE_COLOR[f] : 'transparent',
                    color: face === f ? '#fff' : theme.textSecondary }}>
                  {f}
                </button>
              ))}
              {draft.length > 0 && (
                <>
                  <button type="button" onClick={finishRun}
                    style={{ padding: '8px 12px', minHeight: 40, borderRadius: 8, border: `1px solid ${theme.accent}`, background: 'transparent', color: theme.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Finish run ({draft.length})
                  </button>
                  <button type="button" onClick={() => setDraft((d) => d.slice(0, -1))} title="Undo last point"
                    style={{ padding: '8px 10px', minHeight: 40, borderRadius: 8, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textSecondary, cursor: 'pointer' }}>
                    <Undo2 size={15} />
                  </button>
                </>
              )}
            </div>

            <div style={{ position: 'relative', lineHeight: 0 }}>
              <img src={imageUrl} alt="Aerial view of the property" onClick={addPoint}
                style={{ width: '100%', borderRadius: 8, cursor: 'crosshair', display: 'block' }} />
              <svg viewBox={`0 0 ${plan.size} ${plan.size}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {runs.map((r) => (
                  <polyline key={r.id} points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none" stroke={FACE_COLOR[r.face]} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                ))}
                {draft.length > 0 && (
                  <polyline points={draft.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none" stroke={FACE_COLOR[face]} strokeWidth="5" strokeDasharray="10 8" strokeLinecap="round" />
                )}
                {plan?.center && <circle cx={plan.center.x} cy={plan.center.y} r="7" fill="#fff" stroke="#2c3530" strokeWidth="3" />}
              </svg>
            </div>
            <p style={{ fontSize: 11, color: theme.textMuted, margin: '8px 0 0' }}>
              Tap along a run, then Finish run. {ATTRIBUTION}.
            </p>
            {aiNote && (
              <p style={{ fontSize: 12.5, color: theme.textSecondary, margin: '8px 0 0', padding: '8px 10px', backgroundColor: theme.bg, borderRadius: 8 }}>
                Chris says: {aiNote}
              </p>
            )}
          </div>

          {/* The price */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: '0 0 10px' }}>How much of the house</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {options.map((o) => (
                  <button key={o.key} type="button" onClick={() => setCoverage(o.key)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', minHeight: 44, borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${coverage === o.key ? theme.accent : theme.border}`,
                      backgroundColor: coverage === o.key ? theme.accentBg : 'transparent' }}>
                    <span>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: theme.text }}>{o.label}</span>
                      <span style={{ fontSize: 11.5, color: theme.textMuted }}>{o.hint}</span>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: coverage === o.key ? theme.accent : theme.textSecondary, whiteSpace: 'nowrap' }}>
                      {o.feet} ft
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: '0 0 10px' }}>Price</h3>
              {perFootRate > 0 ? (
                <>
                  <div style={{ fontSize: 30, fontWeight: 700, color: theme.text }}>
                    ${priced.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p style={{ fontSize: 12.5, color: theme.textMuted, margin: '4px 0 0' }}>
                    {feet} ft × ${perFootRate}/ft{priced.minimum_applied ? ' · minimum applied' : ''}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: theme.textSecondary, margin: 0 }}>
                  Set a price per foot in Settings → Christmas Lighting before quoting.
                </p>
              )}
            </div>

            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: '0 0 10px' }}>Customer</h3>
              <SearchableSelect
                options={[...(customers || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                  .map((c) => ({ value: c.id, label: c.business_name ? `${c.name} (${c.business_name})` : c.name }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder="-- Optional --"
                theme={theme}
              />
              <button type="button" onClick={createEstimate} disabled={!!problem || saving}
                title={problem || undefined}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, padding: '12px 16px', minHeight: 46, backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: (problem || saving) ? 'not-allowed' : 'pointer', opacity: (problem || saving) ? 0.5 : 1 }}>
                <FileText size={16} /> {saving ? 'Creating…' : 'Create estimate'}
              </button>
              {problem && <p style={{ fontSize: 12, color: theme.textMuted, margin: '8px 0 0' }}>{problem}</p>}
            </div>

            {runs.length > 0 && (
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: '0 0 10px' }}>Runs ({runs.length})</h3>
                {runs.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: FACE_COLOR[r.face], flexShrink: 0 }} />
                    <select value={r.face} onChange={(e) => setRuns((all) => all.map((x) => x.id === r.id ? { ...x, face: e.target.value } : x))}
                      style={{ ...input, padding: '4px 6px', fontSize: 12.5, flex: 1 }}>
                      {FACES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap' }}>{r.length_ft} ft</span>
                    <button type="button" onClick={() => setRuns((all) => all.filter((x) => x.id !== r.id))} aria-label="Remove run"
                      style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
