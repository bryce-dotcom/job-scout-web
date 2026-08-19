// Measure off a plan sheet.
//
// The flow is: photograph the sheet, tap a known distance to calibrate, then
// trace a run or an outline. Nothing in an image knows how big anything is,
// so calibration comes first and the tool refuses to measure without it.
//
// Built for a thumb on a phone. Drag pans, pinch zooms, and a tap places a
// point — no mode switch between panning and tracing, because getting that
// wrong on a job site means placing a point every time you try to scroll.
// While a finger is down a loupe shows the pixels underneath it, offset up and
// left, because the thing you are trying to tap precisely is the exact thing
// your fingertip is covering.
//
// All the arithmetic lives in src/lib/measure.js (pure, 23 tests). This file
// handles gestures and pixels.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  Crosshair, Spline, Pentagon, Undo2, Trash2, Check, Camera,
  Image as ImageIcon, TriangleAlert, Ruler, ZoomIn,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { prepImage } from '../../lib/imagePrep'
import { calibrate, measure, toTakeoffItem, MEASURE_TARGETS, UNITS } from '../../lib/measure'
import { WORK_TYPES } from '../../lib/digEstimator'
import { T, Btn, Chip, Field, NumInput, Select, Note, Badge, fmtNum } from './DonUI'

const TAP_SLOP = 8          // px of movement still counted as a tap, not a drag
const LOUPE = 116           // diameter
const LOUPE_ZOOM = 3

export default function PlanMeasure({ open, onClose, takeoffId, site, existingCount = 0, onAdded }) {
  const companyId = useStore((s) => s.companyId)
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const wrapRef = useRef(null)
  const imgRef = useRef(null)

  const [img, setImg] = useState(null)            // { src, width, height }
  const [planId, setPlanId] = useState(null)
  const [pxPerFt, setPxPerFt] = useState(null)
  const [sheetLabel, setSheetLabel] = useState('')

  const [mode, setMode] = useState('calibrate')   // calibrate | line | area
  const [points, setPoints] = useState([])
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [loupe, setLoupe] = useState(null)        // { x, y } in client coords
  const [calPrompt, setCalPrompt] = useState(null)
  const [calLen, setCalLen] = useState('')
  const [calUnit, setCalUnit] = useState('ft')
  const [calWarning, setCalWarning] = useState(null)
  const [target, setTarget] = useState(null)
  const [extras, setExtras] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const pointers = useRef(new Map())
  const gesture = useRef(null)

  const reset = () => {
    setImg(null); setPlanId(null); setPxPerFt(null); setSheetLabel('')
    setMode('calibrate'); setPoints([]); setView({ k: 1, x: 0, y: 0 })
    setCalPrompt(null); setCalLen(''); setCalWarning(null); setTarget(null); setExtras({}); setErr('')
  }
  const close = () => { reset(); onClose?.() }

  // ── load an image ──────────────────────────────────────────────────────
  const pickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const prepped = await prepImage(file, 'plan')

      // A new sheet is a new scale. Carrying the previous sheet's px-per-foot
      // over would measure this drawing with the last one's ruler and never
      // say a word about it, so everything measurement-related resets here.
      setPxPerFt(null)
      setPoints([])
      setMode('calibrate')
      setCalPrompt(null)
      setCalLen('')
      setCalWarning(null)
      setTarget(null)
      setExtras({})
      setPlanId(null)

      setImg({ src: prepped.preview, width: prepped.width, height: prepped.height })
      setSheetLabel(file.name.replace(/\.[^.]+$/, ''))
      fitToScreen(prepped.width, prepped.height)

      // Persist in the background. If storage is unhappy we still measure —
      // losing the upload should not lose the afternoon's takeoff.
      const path = `don/${companyId}/${takeoffId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const blob = await (await fetch(prepped.preview)).blob()
      const { error: upErr } = await supabase.storage.from('project-documents').upload(path, blob, {
        contentType: prepped.mediaType, upsert: false,
      })
      if (upErr) {
        console.warn('[Don] plan upload failed:', upErr.message)
      } else {
        const { data: plan } = await supabase.from('dig_plans').insert({
          company_id: companyId,
          site_id: site?.id || null,
          storage_path: path,
          file_name: file.name,
          extraction_status: 'pending',
        }).select().single()
        if (plan) setPlanId(plan.id)
      }
    } catch (e2) {
      setErr(e2.message || 'Could not open that image.')
    }
    setBusy(false)
  }

  const fitToScreen = useCallback((w, h) => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const k = Math.min(r.width / w, r.height / h) * 0.95
    setView({ k, x: (r.width - w * k) / 2, y: (r.height - h * k) / 2 })
  }, [])

  // ── coordinate conversion ──────────────────────────────────────────────
  const toImage = useCallback((clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k }
  }, [view])

  // ── gestures ───────────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    // Capture keeps a drag alive if the finger leaves the element mid-gesture.
    // It throws for a pointer the browser doesn't consider active, and a throw
    // here would abandon the gesture before it started — so it must not be
    // load-bearing.
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* not capturable */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = { kind: 'maybe-tap', startX: e.clientX, startY: e.clientY, view: { ...view }, moved: 0 }
      setLoupe({ x: e.clientX, y: e.clientY })
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        kind: 'pinch',
        startDist: Math.hypot(b.x - a.x, b.y - a.y),
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: { ...view },
      }
      setLoupe(null)
    }
  }

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const scale = dist / (g.startDist || 1)
      const k = Math.max(0.1, Math.min(12, g.view.k * scale))
      const r = wrapRef.current.getBoundingClientRect()
      // Keep the point under the pinch centre pinned while scaling.
      const ix = (g.startMid.x - r.left - g.view.x) / g.view.k
      const iy = (g.startMid.y - r.top - g.view.y) / g.view.k
      setView({ k, x: mid.x - r.left - ix * k, y: mid.y - r.top - iy * k })
      return
    }

    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    g.moved = Math.max(g.moved, Math.hypot(dx, dy))
    if (g.moved > TAP_SLOP) {
      g.kind = 'pan'
      setView({ k: g.view.k, x: g.view.x + dx, y: g.view.y + dy })
      setLoupe(null)
    } else {
      setLoupe({ x: e.clientX, y: e.clientY })
    }
  }

  const onPointerUp = (e) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    setLoupe(null)
    if (pointers.current.size === 0) gesture.current = null
    if (!g || g.kind !== 'maybe-tap' || g.moved > TAP_SLOP) return

    const p = toImage(e.clientX, e.clientY)
    if (p.x < 0 || p.y < 0 || p.x > (img?.width || 0) || p.y > (img?.height || 0)) return

    if (mode === 'calibrate') {
      const next = [...points, p].slice(-2)
      setPoints(next)
      if (next.length === 2) setCalPrompt(next)
    } else {
      setPoints((prev) => [...prev, p])
    }
  }

  const onWheel = (e) => {
    if (!img) return
    e.preventDefault()
    const r = wrapRef.current.getBoundingClientRect()
    const k = Math.max(0.1, Math.min(12, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
    const ix = (e.clientX - r.left - view.x) / view.k
    const iy = (e.clientY - r.top - view.y) / view.k
    setView({ k, x: e.clientX - r.left - ix * k, y: e.clientY - r.top - iy * k })
  }

  // Wheel needs a non-passive listener to be preventable.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const h = (e) => onWheel(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  })

  // ── calibration commit ─────────────────────────────────────────────────
  const applyCalibration = async () => {
    const c = calibrate({ p1: calPrompt[0], p2: calPrompt[1], realLength: calLen, unit: calUnit })
    if (!c.valid) { setErr(c.reason); return }
    setPxPerFt(c.px_per_ft)
    setCalWarning(c.warning)
    setCalPrompt(null)
    setPoints([])
    setMode('line')
    if (planId) {
      await supabase.from('dig_plans').update({ scale_px_per_ft: c.px_per_ft }).eq('id', planId)
    }
  }

  // ── the live measurement ───────────────────────────────────────────────
  const result = useMemo(
    () => (mode === 'calibrate' ? null : measure({ points, mode, px_per_ft: pxPerFt })),
    [points, mode, pxPerFt]
  )

  const targets = MEASURE_TARGETS[mode] || []
  const chosen = targets.find((t) => t.work_type === target) || null
  const missing = (chosen?.needs || []).filter((f) => !extras[f])

  const commit = async () => {
    if (!result?.valid || !chosen || missing.length) return
    setBusy(true)
    const item = toTakeoffItem({
      measurement: result,
      work_type: chosen.work_type,
      extras: {
        ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, Number(v)])),
        protection: chosen.work_type === 'trench' || chosen.work_type === 'leach_field' ? 'sloped' : null,
      },
      source_ref: `Traced on ${sheetLabel || 'plan sheet'}`,
    })
    const { error } = await supabase.from('dig_takeoff_items').insert({
      company_id: companyId,
      takeoff_id: takeoffId,
      sort_order: existingCount,
      work_type: item.work_type,
      label: chosen.label,
      soil_class: site?.default_soil_class || null,
      length_ft: item.length_ft ?? null,
      area_sf: item.area_sf ?? null,
      perimeter_ft: item.perimeter_ft ?? null,
      width_ft: item.width_ft ?? null,
      depth_ft: item.depth_ft ?? null,
      protection: item.protection,
      plan_id: planId,
      source: 'measured',
      source_ref: item.source_ref,
      confidence: 1,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onAdded?.({ label: chosen.label })
    close()
  }

  if (!open) return null

  const readout = mode === 'calibrate'
    ? (pxPerFt ? `${fmtNum(pxPerFt, 2)} px per foot` : `Tap ${2 - points.length} more point${points.length === 1 ? '' : 's'} on a known distance`)
    : result?.valid
      ? (mode === 'line' ? `${fmtNum(result.length_ft, 1)} ft` : `${fmtNum(result.area_sf)} sf`)
      : (result?.reason || '')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1300, background: '#1e211f',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
        background: '#2c3530', borderBottom: '1px solid #46504a', flexShrink: 0,
      }}>
        <Ruler size={18} style={{ color: '#d8c9a8', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, color: '#f2efe6', fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {img ? (sheetLabel || 'Plan sheet') : 'Measure off a plan'}
        </div>
        <button onClick={close} style={topBtn}>Close</button>
      </div>

      {/* canvas */}
      <div
        ref={wrapRef}
        onPointerDown={img ? onPointerDown : undefined}
        onPointerMove={img ? onPointerMove : undefined}
        onPointerUp={img ? onPointerUp : undefined}
        onPointerCancel={img ? onPointerUp : undefined}
        style={{
          flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
          touchAction: 'none', background: '#1e211f', cursor: img ? 'crosshair' : 'default',
        }}
      >
        {!img ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
            <div style={{ textAlign: 'center', maxWidth: 340 }}>
              <Ruler size={40} style={{ color: '#7d8a7f' }} />
              <div style={{ color: '#f2efe6', fontSize: 18, fontWeight: 700, marginTop: 12 }}>Trace it off the sheet</div>
              <div style={{ color: '#a8b3ab', fontSize: 13, lineHeight: 1.5, marginTop: 8, marginBottom: 18 }}>
                Photograph a plan sheet, tap the two ends of its scale bar to tell Don how big it is,
                then trace a pipe run or an outline. Nothing in a photo knows its own size — the scale bar does.
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <Btn variant="clay" onClick={() => cameraRef.current?.click()} full disabled={busy}>
                  <Camera size={18} /> {busy ? 'Opening…' : 'Photograph the sheet'}
                </Btn>
                <button onClick={() => fileRef.current?.click()} style={{ ...topBtn, minHeight: 44 }}>
                  <ImageIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Choose a file
                </button>
              </div>
              {err && <div style={{ color: '#ffb4a8', fontSize: 13, marginTop: 12 }}>{err}</div>}
            </div>
          </div>
        ) : (
          <>
            <div style={{
              position: 'absolute', top: 0, left: 0,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
              transformOrigin: '0 0',
            }}>
              <img ref={imgRef} src={img.src} alt="" width={img.width} height={img.height} draggable={false} style={{ display: 'block', userSelect: 'none' }} />
              <svg
                width={img.width} height={img.height}
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
              >
                {points.length > 1 && (
                  <polyline
                    points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={mode === 'calibrate' ? '#f5b700' : '#5ad18a'}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={mode === 'calibrate' ? '6 4' : undefined}
                  />
                )}
                {mode === 'area' && points.length > 2 && (
                  <polygon
                    points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(90,209,138,0.22)"
                    stroke="#5ad18a"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {points.map((p, i) => (
                  <circle
                    key={i} cx={p.x} cy={p.y} r={6 / view.k}
                    fill={mode === 'calibrate' ? '#f5b700' : '#5ad18a'}
                    stroke="#fff" strokeWidth={2 / view.k}
                  />
                ))}
              </svg>
            </div>

            {/* Loupe — your fingertip is covering the thing you're aiming at */}
            {loupe && (
              <div style={{
                position: 'fixed',
                left: loupe.x - LOUPE / 2 - 46,
                top: loupe.y - LOUPE - 46,
                width: LOUPE, height: LOUPE, borderRadius: '50%',
                border: '3px solid #f2efe6', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                backgroundImage: `url(${img.src})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${img.width * view.k * LOUPE_ZOOM}px ${img.height * view.k * LOUPE_ZOOM}px`,
                backgroundPosition: `${-((loupe.x - wrapRef.current.getBoundingClientRect().left - view.x) * LOUPE_ZOOM) + LOUPE / 2}px ${-((loupe.y - wrapRef.current.getBoundingClientRect().top - view.y) * LOUPE_ZOOM) + LOUPE / 2}px`,
                pointerEvents: 'none', zIndex: 1400, overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(245,183,0,0.9)' }} />
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(245,183,0,0.9)' }} />
              </div>
            )}

            {/* live readout */}
            <div style={{
              position: 'absolute', top: 10, left: 10, right: 10,
              display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(28,33,31,0.88)', color: '#f2efe6', padding: '8px 12px',
                borderRadius: 10, fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                border: '1px solid #46504a', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {readout}
              </div>
              {pxPerFt && mode !== 'calibrate' && (
                <div style={{ background: 'rgba(28,33,31,0.7)', color: '#a8b3ab', padding: '6px 9px', borderRadius: 8, fontSize: 11, whiteSpace: 'nowrap' }}>
                  <ZoomIn size={11} style={{ verticalAlign: -1 }} /> {fmtNum(view.k, 1)}×
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* bottom controls */}
      {img && (
        <div style={{
          background: '#2c3530', borderTop: '1px solid #46504a', padding: 12,
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', flexShrink: 0,
          display: 'grid', gap: 10, maxHeight: '52dvh', overflowY: 'auto',
        }}>
          {(result?.warnings || []).map((w, i) => (
            <Note key={i} tone="warning" icon={TriangleAlert}>{w}</Note>
          ))}
          {calWarning && <Note tone="warning" icon={TriangleAlert}>{calWarning}</Note>}
          {err && <Note tone="danger" icon={TriangleAlert}>{err}</Note>}

          {/* mode + edit row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto' }}>
            <ModeBtn active={mode === 'calibrate'} onClick={() => { setMode('calibrate'); setPoints([]) }} icon={Crosshair} label="Scale" />
            <ModeBtn active={mode === 'line'} onClick={() => { setMode('line'); setPoints([]); setTarget(null) }} icon={Spline} label="Run" disabled={!pxPerFt} />
            <ModeBtn active={mode === 'area'} onClick={() => { setMode('area'); setPoints([]); setTarget(null) }} icon={Pentagon} label="Area" disabled={!pxPerFt} />
            <div style={{ flex: 1 }} />
            <button onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length} style={{ ...topBtn, opacity: points.length ? 1 : 0.4 }} aria-label="Undo last point"><Undo2 size={17} /></button>
            <button onClick={() => setPoints([])} disabled={!points.length} style={{ ...topBtn, opacity: points.length ? 1 : 0.4 }} aria-label="Clear points"><Trash2 size={17} /></button>
          </div>

          {mode === 'calibrate' && !pxPerFt && (
            <div style={{ color: '#a8b3ab', fontSize: 12.5, lineHeight: 1.5 }}>
              Tap both ends of the printed scale bar — or any line with a written dimension —
              then type what it really measures. Don’t use the printed “1 inch = 20 feet”:
              a photo has no true inches.
            </div>
          )}

          {/* what this trace becomes */}
          {mode !== 'calibrate' && result?.valid && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {targets.map((t) => (
                  <Chip
                    key={t.work_type}
                    active={target === t.work_type}
                    onClick={() => { setTarget(t.work_type); setExtras({}) }}
                    style={{ background: target === t.work_type ? T.accentBg : '#39423c', borderColor: target === t.work_type ? T.accent : '#5a6459', color: target === t.work_type ? '#dbe7cf' : '#c6cfc6' }}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>

              {chosen && chosen.needs.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chosen.needs.length}, minmax(0,1fr))`, gap: 8 }}>
                  {chosen.needs.map((f) => (
                    <div key={f} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#a8b3ab', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        {f === 'depth_ft' ? 'Depth' : 'Width'}
                      </div>
                      <NumInput value={extras[f] ?? ''} onChange={(v) => setExtras((x) => ({ ...x, [f]: v }))} unit="ft" />
                    </div>
                  ))}
                </div>
              )}

              {chosen && chosen.needs.length > 0 && missing.length > 0 && (
                <div style={{ color: '#d8c9a8', fontSize: 12 }}>
                  A plan view can’t show you depth — type it and the volume follows.
                </div>
              )}

              <Btn onClick={commit} disabled={!chosen || missing.length > 0 || busy} full>
                <Check size={18} /> {busy ? 'Adding…' : chosen ? `Add ${chosen.label.toLowerCase()} to takeoff` : 'Pick what this is'}
              </Btn>
            </>
          )}
        </div>
      )}

      {/* calibration prompt */}
      {calPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,33,31,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ background: T.bgCard, width: '100%', maxWidth: 460, borderRadius: '16px 16px 0 0', padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 4 }}>How long is that really?</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 14 }}>
              The distance between the two points you tapped, in real-world units.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 8 }}>
              <Field label="Distance"><NumInput big value={calLen} onChange={setCalLen} /></Field>
              <Field label="Units">
                <Select value={calUnit} onChange={setCalUnit} options={Object.entries(UNITS).map(([v, u]) => ({ value: v, label: u.label }))} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Btn variant="ghost" onClick={() => { setCalPrompt(null); setPoints([]) }} style={{ flex: 1 }}>Retap</Btn>
              <Btn onClick={applyCalibration} disabled={!calLen} style={{ flex: 2 }}>Set the scale</Btn>
            </div>
          </div>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pickFile} style={{ display: 'none' }} />
      <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: 'none' }} />
    </div>
  )
}

const topBtn = {
  minHeight: 40, minWidth: 44, padding: '0 12px', borderRadius: 9,
  background: '#39423c', color: '#e8ece7', border: '1px solid #5a6459',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
}

function ModeBtn({ active, onClick, icon: Icon, label, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 46, padding: '0 14px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? '#5a6349' : '#39423c',
        color: active ? '#fff' : '#c6cfc6',
        border: `1px solid ${active ? '#7a8563' : '#5a6459'}`,
        fontSize: 14, fontWeight: 700, opacity: disabled ? 0.4 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
      }}
    >
      <Icon size={17} /> {label}
    </button>
  )
}
