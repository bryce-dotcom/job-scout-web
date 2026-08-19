// Don reads a page — the review-and-correct surface.
//
// Photo in, takeoff items out, with a human between the two. Nothing the model
// produces lands on a bid unseen: every candidate arrives with its confidence,
// the exact text it was read from, and any assumption that was made to fill a
// gap. The user accepts, edits or drops each one.
//
// Edits are not just edits. Any number the user changes before accepting is
// written to dougie_corrections, which the reader replays as few-shot examples
// next time. That table already existed for Dougie — Don's learning loop cost
// one field_type value rather than a new table.

import { useState, useRef, useMemo } from 'react'
import {
  Camera, FileText, ScanLine, Check, X, TriangleAlert, Ruler,
  Clock, Mountain, Quote, Loader2, Image as ImageIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { prepImages } from '../../lib/imagePrep'
import { WORK_TYPES, SOIL_PROFILES } from '../../lib/digEstimator'
import {
  T, Btn, Chip, Sheet, Note, Badge, SectionLabel, fmtNum,
} from './DonUI'

const MODES = {
  notes: {
    label: 'Field notes',
    icon: 'Camera',
    fn: 'don-read-notes',
    fieldType: 'dig_note',
    blurb: 'A legal pad, a takeoff sheet, the back of an envelope.',
  },
  plan: {
    label: 'Plan sheet',
    icon: 'FileText',
    fn: 'don-read-plan',
    fieldType: 'dig_plan',
    blurb: 'Grading, utility or site sheets. Don reads the tables and schedules.',
  },
}

// Which geometry fields to show per work type, so a trench card doesn't ask
// about basin areas.
const FIELDS_BY_GEOMETRY = {
  trench: [['length_ft', 'Length', 'ft'], ['width_ft', 'Width', 'ft'], ['depth_ft', 'Depth', 'ft']],
  prism: [['area_sf', 'Area', 'sf'], ['depth_ft', 'Depth', 'ft']],
  footing: [['perimeter_ft', 'Perimeter', 'ft'], ['width_ft', 'Width', 'ft'], ['depth_ft', 'Depth', 'ft']],
  basin: [['top_area_sf', 'Top area', 'sf'], ['bottom_area_sf', 'Bottom', 'sf'], ['depth_ft', 'Depth', 'ft']],
  area: [['area_sf', 'Area', 'sf']],
  volume: [['volume_bcy', 'Volume', 'bcy']],
}

export default function ReadSheet({ open, onClose, isMobile, takeoffId, site, existingCount = 0, onAdded }) {
  const companyId = useStore((s) => s.companyId)
  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  const [mode, setMode] = useState('notes')
  const [images, setImages] = useState([])
  const [stage, setStage] = useState('pick')      // pick | reading | review | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [rows, setRows] = useState([])            // editable candidates
  const [originals, setOriginals] = useState([])  // for the corrections diff
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setImages([]); setStage('pick'); setError(''); setResult(null); setRows([]); setOriginals([])
  }

  const close = () => { reset(); onClose?.() }

  const pickFiles = async (e) => {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    const prepped = await prepImages(files, mode)
    setImages((prev) => [...prev, ...prepped].slice(0, mode === 'plan' ? 4 : 6))
    e.target.value = ''
  }

  const read = async () => {
    if (!images.length) return
    setStage('reading'); setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(MODES[mode].fn, {
        body: {
          images: images.map((i) => ({ base64: i.base64, mediaType: i.mediaType })),
          site: site ? {
            default_soil_class: site.default_soil_class,
            rock_expected: site.rock_expected,
            haul_destination: site.haul_destination,
          } : null,
        },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) {
        // An outage is our problem, not theirs — say so and leave the manual
        // path open rather than blocking the bid on something they can't fix.
        setError(data.ai_unavailable
          ? `${data.error} You can still add items by hand — nothing is blocked.`
          : data.error)
        setStage('error')
        return
      }
      const items = (data.items || []).map((it, i) => ({ ...it, _accept: true, _key: i }))
      setResult(data)
      setRows(items)
      setOriginals(items.map((it) => ({ ...it })))
      setStage('review')
    } catch (err) {
      setError(err.message || 'Something went wrong reading that.')
      setStage('error')
    }
  }

  const patch = (key, field, value) => {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, [field]: value === '' ? null : Number(value) } : r)))
  }
  const toggle = (key) => setRows((rs) => rs.map((r) => (r._key === key ? { ...r, _accept: !r._accept } : r)))

  const accepted = useMemo(() => rows.filter((r) => r._accept), [rows])

  const commit = async () => {
    if (!accepted.length) return
    setSaving(true)

    // ── the items ──────────────────────────────────────────────────────
    const payload = accepted.map((r, i) => ({
      company_id: companyId,
      takeoff_id: takeoffId,
      sort_order: existingCount + i,
      work_type: r.work_type,
      label: r.label || WORK_TYPES[r.work_type]?.label || null,
      soil_class: r.soil_class || site?.default_soil_class || null,
      length_ft: r.length_ft, width_ft: r.width_ft, depth_ft: r.depth_ft,
      perimeter_ft: r.perimeter_ft, area_sf: r.area_sf,
      top_area_sf: r.top_area_sf, bottom_area_sf: r.bottom_area_sf,
      count: r.count,
      volume_bcy_input: r.volume_bcy,
      tons_input: r.tons,
      loads_input: r.loads,
      protection: r.protection || null,
      source: mode === 'plan' ? 'plan' : 'handwritten',
      source_ref: r.source_ref || null,
      // If a human corrected a number, they have vouched for it — that is a
      // confirmation, not a guess, so it stops counting against ready_to_send.
      confidence: wasEdited(r, originals) ? 1 : r.confidence,
      notes: (r.assumptions || []).length ? `Assumed: ${r.assumptions.join('; ')}` : null,
    }))
    const { error: insErr } = await supabase.from('dig_takeoff_items').insert(payload)
    if (insErr) { setSaving(false); setError(insErr.message); setStage('error'); return }

    // ── the learning loop ──────────────────────────────────────────────
    const corrections = []
    rows.forEach((r) => {
      const o = originals.find((x) => x._key === r._key)
      if (!o) return
      Object.keys(FIELD_LABELS).forEach((f) => {
        if (o[f] == null && r[f] == null) return
        if (String(o[f]) === String(r[f])) return
        corrections.push({
          company_id: companyId,
          field_type: MODES[mode].fieldType,
          field_name: f,
          original_value: String(o[f] ?? ''),
          corrected_value: String(r[f] ?? ''),
          context: { work_type: r.work_type, label: r.label, source_ref: r.source_ref },
        })
      })
    })
    if (corrections.length) {
      const { error: cErr } = await supabase.from('dougie_corrections').insert(corrections)
      if (cErr) console.warn('[Don] corrections insert failed:', cErr.message)
    }

    // ── actuals, if the page was a day's log rather than a bid ─────────
    const actuals = (result?.actuals || []).filter((a) => Number(a.hours) > 0 || Number(a.loads) > 0)
    if (actuals.length) {
      const { error: aErr } = await supabase.from('dig_actuals').insert(
        actuals.map((a) => ({
          company_id: companyId,
          takeoff_id: takeoffId,
          equipment: a.equipment || null,
          actual_hours: Number(a.hours) || null,
          actual_loads: Number(a.loads) || null,
          work_date: a.work_date || null,
          source: 'handwritten',
          notes: a.source_ref || null,
        }))
      )
      if (aErr) console.warn('[Don] actuals insert failed:', aErr.message)
    }

    setSaving(false)
    onAdded?.({ items: payload.length, corrections: corrections.length, actuals: actuals.length })
    close()
  }

  const M = MODES[mode]

  return (
    <Sheet
      open={open}
      onClose={close}
      isMobile={isMobile}
      title={stage === 'review' ? 'Check Don’s reading' : 'Read a page'}
      footer={
        stage === 'pick' ? (
          <Btn onClick={read} disabled={!images.length} full>
            <ScanLine size={18} /> Read {images.length || ''} {images.length === 1 ? 'page' : 'pages'}
          </Btn>
        ) : stage === 'review' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={close} style={{ flex: 1 }}>Discard</Btn>
            <Btn onClick={commit} disabled={!accepted.length || saving} style={{ flex: 2 }}>
              {saving ? 'Adding…' : `Add ${accepted.length} item${accepted.length === 1 ? '' : 's'}`}
            </Btn>
          </div>
        ) : stage === 'error' ? (
          <Btn variant="ghost" onClick={() => setStage('pick')} full>Back</Btn>
        ) : null
      }
    >
      {/* ── pick ─────────────────────────────────────────────────────── */}
      {stage === 'pick' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 8 }}>What are we reading?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              {Object.entries(MODES).map(([key, m]) => {
                const Icon = key === 'notes' ? Camera : FileText
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setMode(key); setImages([]) }}
                    style={{
                      minHeight: 84, padding: 12, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      border: `1.5px solid ${mode === key ? T.accent : T.border}`,
                      background: mode === key ? T.accentBg : T.bgCard,
                    }}
                  >
                    <Icon size={20} style={{ color: mode === key ? T.accent : T.textMuted }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 6 }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.35 }}>{m.blurb}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {mode === 'plan' && (
            <Note tone="info" icon={TriangleAlert}>
              Don reads what the sheet <strong>says</strong> — earthwork tables, pipe schedules, callouts.
              He will not estimate cut and fill off contour lines, because a PDF carries no elevations.
              Anything that needs scaling comes back as “trace this”.
            </Note>
          )}

          {/* Camera first on a phone: this happens standing at the tailgate. */}
          <div style={{ display: 'grid', gap: 8 }}>
            <Btn onClick={() => cameraRef.current?.click()} full variant="clay">
              <Camera size={18} /> Take a photo
            </Btn>
            <Btn onClick={() => fileRef.current?.click()} variant="ghost" full>
              <ImageIcon size={18} /> Choose from files
            </Btn>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple onChange={pickFiles} style={{ display: 'none' }} />
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={pickFiles} style={{ display: 'none' }} />
          </div>

          {images.length > 0 && (
            <div>
              <SectionLabel>{images.length} page{images.length === 1 ? '' : 's'}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 96px), 1fr))', gap: 8 }}>
                {images.map((img, i) => (
                  <div key={i} style={{ position: 'relative', minWidth: 0 }}>
                    <img src={img.preview} alt={`Page ${i + 1}`} style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }} />
                    <button
                      onClick={() => setImages((p) => p.filter((_, x) => x !== i))}
                      style={{
                        position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(44,53,48,0.8)', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      aria-label="Remove page"
                    ><X size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── reading ──────────────────────────────────────────────────── */}
      {stage === 'reading' && (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <Loader2 size={34} style={{ color: T.accent, animation: 'don-spin 1s linear infinite' }} />
          <style>{`@keyframes don-spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 14 }}>
            {mode === 'plan' ? 'Reading the sheets' : 'Reading your notes'}
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 6, maxWidth: 300, margin: '6px auto 0' }}>
            {mode === 'plan'
              ? 'Finding the title block, the scale, and any quantity tables. Two passes — survey, then extract.'
              : 'Transcribing first, then working out what it means. Two passes, because handwriting and interpretation fail differently.'}
          </div>
        </div>
      )}

      {/* ── error ────────────────────────────────────────────────────── */}
      {stage === 'error' && <Note tone="danger" icon={TriangleAlert}>{error}</Note>}

      {/* ── review ───────────────────────────────────────────────────── */}
      {stage === 'review' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.length === 0 && (
            <Note tone="warning" icon={TriangleAlert}>
              Don couldn’t pull any quantities off that. {result?.unreadable?.length
                ? `He couldn’t read: ${result.unreadable.slice(0, 3).join(', ')}.`
                : 'Try a straighter, closer shot with more light.'}
            </Note>
          )}

          {rows.map((r) => {
            const spec = WORK_TYPES[r.work_type]
            const fields = FIELDS_BY_GEOMETRY[spec?.geometry] || FIELDS_BY_GEOMETRY.volume
            const low = (r.confidence ?? 0) < 0.7
            const edited = wasEdited(r, originals)
            return (
              <div
                key={r._key}
                style={{
                  border: `1px solid ${r._accept ? T.border : '#e6e0d2'}`,
                  borderLeft: `4px solid ${edited ? T.success : low ? T.warning : T.accent}`,
                  borderRadius: 12, padding: 12, background: r._accept ? T.bgCard : T.bgSunk,
                  opacity: r._accept ? 1 : 0.6, minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <button
                    onClick={() => toggle(r._key)}
                    style={{
                      width: 30, height: 30, minWidth: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
                      border: `1.5px solid ${r._accept ? T.accent : T.border}`,
                      background: r._accept ? T.accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
                    }}
                    aria-label={r._accept ? 'Exclude this item' : 'Include this item'}
                  >
                    {r._accept && <Check size={17} style={{ color: '#fff' }} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                      {r.label || spec?.label || r.work_type}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      <Badge tone="muted">{spec?.label || r.work_type}</Badge>
                      {edited
                        ? <Badge tone="success">You corrected it</Badge>
                        : <Badge tone={low ? 'warning' : 'accent'}>{Math.round((r.confidence ?? 0) * 100)}% sure</Badge>}
                      {r.tier === 1 && <Badge tone="accent">read from table</Badge>}
                      {r.tier === 2 && <Badge tone="muted">derived</Badge>}
                    </div>
                  </div>
                </div>

                {/* The numbers, editable in place */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(fields.length, 3)}, minmax(0,1fr))`,
                  gap: 8, marginTop: 10,
                }}>
                  {fields.map(([f, label, unit]) => (
                    <div key={f} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        {label}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number" inputMode="decimal" step="any"
                          value={r[f] ?? ''}
                          onChange={(e) => patch(r._key, f, e.target.value)}
                          style={{
                            width: '100%', minHeight: 44, padding: '6px 26px 6px 8px',
                            border: `1px solid ${T.border}`, borderRadius: 8,
                            background: T.bg, color: T.text, fontSize: 16,
                            boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                          }}
                        />
                        <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: T.textMuted, pointerEvents: 'none' }}>{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Where it came from — tap-to-verify is the trust story */}
                {r.source_ref && (
                  <div style={{
                    display: 'flex', gap: 6, marginTop: 10, padding: '7px 9px',
                    background: T.bgSunk, borderRadius: 8, fontSize: 12, color: T.textSecondary,
                    fontStyle: 'italic', minWidth: 0,
                  }}>
                    <Quote size={12} style={{ flexShrink: 0, marginTop: 2, color: T.textMuted }} />
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.source_ref}</span>
                  </div>
                )}

                {(r.assumptions || []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Note tone="warning" icon={TriangleAlert}>
                      {r.assumptions.join(' · ')}
                    </Note>
                  </div>
                )}
              </div>
            )
          })}

          {/* Machine hours and loads — work already done, not work to price */}
          {(result?.actuals || []).length > 0 && (
            <>
              <SectionLabel>Also on the page — work already done</SectionLabel>
              {result.actuals.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  <Clock size={16} style={{ color: T.clay, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: T.textSecondary, minWidth: 0 }}>
                    <strong style={{ color: T.text }}>{a.equipment || 'Machine'}</strong>
                    {a.hours ? ` · ${fmtNum(a.hours, 1)} hrs` : ''}{a.loads ? ` · ${a.loads} loads` : ''}
                    <div style={{ fontSize: 11, color: T.textMuted }}>Goes to actuals, not the bid — it feeds the calibration loop.</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {(result?.exposures || []).length > 0 && (
            <>
              <SectionLabel>Flagged</SectionLabel>
              {result.exposures.map((e, i) => (
                <Note key={i} tone="warning" icon={Mountain}>
                  <strong style={{ textTransform: 'capitalize' }}>{e.kind}</strong> — {e.note}
                </Note>
              ))}
            </>
          )}

          {(result?.needs_measurement || []).length > 0 && (
            <>
              <SectionLabel>Don can’t read these — they need tracing</SectionLabel>
              {result.needs_measurement.map((m, i) => (
                <Note key={i} tone="info" icon={Ruler}>
                  <strong>{m.what}</strong>{m.sheet ? ` (${m.sheet})` : ''} — {m.why}
                </Note>
              ))}
            </>
          )}

          {(result?.earthwork_notes || []).length > 0 && (
            <>
              <SectionLabel>Plan notes affecting earthwork</SectionLabel>
              <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, padding: 10, background: T.bgSunk, borderRadius: 10 }}>
                {result.earthwork_notes.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

const FIELD_LABELS = {
  length_ft: 'Length', width_ft: 'Width', depth_ft: 'Depth',
  perimeter_ft: 'Perimeter', area_sf: 'Area',
  top_area_sf: 'Top area', bottom_area_sf: 'Bottom area',
  count: 'Count', volume_bcy: 'Volume',
}

function wasEdited(row, originals) {
  const o = originals.find((x) => x._key === row._key)
  if (!o) return false
  return Object.keys(FIELD_LABELS).some((f) => String(o[f] ?? '') !== String(row[f] ?? ''))
}
