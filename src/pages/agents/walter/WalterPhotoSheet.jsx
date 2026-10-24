// Count the windows in a photograph.
//
// This is the Lenard move on glass: the rep stands in the yard, takes one
// picture, and Walter reads the elevation into runs of windows — this type,
// this many, this storey, this far off the ground. Nothing here prices
// anything. Every figure under a proposal comes back from the same
// priceTakeoff() the count sheet and the assessment page use, so what the rep
// sees before accepting a run is what the bid will say after.
//
// Three things this screen refuses to do, each because the alternative costs
// somebody money:
//
//   NOTHING IS ADDED WITHOUT BEING SEEN. Walter proposes; the rep ticks. A
//   photo that silently wrote fourteen rows into a bid would be a photo nobody
//   checked, and the first wrong one would be found by a customer.
//
//   A RUN WITH NO TYPE CANNOT BE TICKED. When Walter names a window the
//   catalogue does not have, the run keeps its count and loses its type, and
//   the rep has to pick one — see runReady() for why a null type is worse than
//   a wrong one.
//
//   THE PHOTO IS KEPT BEFORE IT IS READ. NewLightingAudit learned this the
//   hard way: photos used to be handed to the AI and dropped on the floor, so
//   a count had nothing behind it. The upload goes first and its path lands on
//   every row the picture produced.

import { useState, useMemo, useRef } from 'react'
import { Camera, Upload, X, ScanEye, Loader2, Check, Pencil, Ruler } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { normalizeAnalysis, runReady, photoRunToRow } from '../../../lib/windowPhoto'
import { priceTakeoff } from '../../../lib/glassCleaningPricing'
import { rowPanes } from '../../../lib/windowTypes'
import { useTheme } from '../../../components/ThemeContext'
import { Sheet, Btn, FormField, Select, TextArea, Note, Tag, MiniStat } from './WalterUI'
import { money } from '../../../lib/walterFormat'

const FACES = [
  { value: 'both', label: 'Inside and out' },
  { value: 'out', label: 'Outside only' },
  { value: 'in', label: 'Inside only' },
]

const SEGMENTS = [
  { value: 'residential', label: 'Residential — a house' },
  { value: 'commercial', label: 'Commercial — storefront, office' },
]

const CONFIDENCE_TONE = { high: 'ok', medium: 'warn', low: 'danger' }
const CONFIDENCE_WORD = {
  high: 'Seen plainly',
  medium: 'Partly inferred',
  low: 'Largely a guess',
}

const CONDITION_WORD = {
  maintenance: 'Maintenance clean',
  first_clean: 'First clean — dirty',
  post_construction: 'Post construction',
  hard_water: 'Hard water staining',
}

const FLOOR_WORD = (n) => (n === 1 ? 'Ground floor' : `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} storey`)

const feet = (inches) => {
  if (inches === null || inches === undefined) return null
  const ft = Math.round((inches / 12) * 10) / 10
  return `${ft}ft up`
}

export default function WalterPhotoSheet({
  onClose, onSaved, onEditRun, companyId, assessmentId, isMobile,
  types = [], products = [], groups = [], recurring = false,
  defaultSegment = 'residential',
}) {
  const { theme } = useTheme()
  const [face, setFace] = useState('both')
  const [segment, setSegment] = useState(defaultSegment)
  const [note, setNote] = useState('')

  const [preview, setPreview] = useState(null)
  const [mediaType, setMediaType] = useState('image/jpeg')
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [photoPath, setPhotoPath] = useState(null)
  const [photoKept, setPhotoKept] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [adding, setAdding] = useState(false)

  const fileRef = useRef(null)
  const camRef = useRef(null)

  const choose = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setPhotoPath(null)
    setPhotoKept(null)
    setMediaType(file.type || 'image/jpeg')
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const clear = () => {
    setPreview(null)
    setResult(null)
    setError(null)
    setPhotoPath(null)
    setPhotoKept(null)
    setPicked(new Set())
    if (fileRef.current) fileRef.current.value = ''
    if (camRef.current) camRef.current.value = ''
  }

  // The rows as they would be saved, so the preview prices exactly what the
  // Add button will write. Built for every proposal, ticked or not — the price
  // is part of deciding.
  const rows = useMemo(
    () => (result?.runs || []).map((r) => photoRunToRow(r, { face, segment })),
    [result, face, segment],
  )

  const perRun = useMemo(
    () => rows.map((row) => priceTakeoff([row], { products, groups, types, recurring })),
    [rows, products, groups, types, recurring],
  )

  const chosen = useMemo(
    () => rows.filter((_, i) => picked.has(i)),
    [rows, picked],
  )

  const chosenPriced = useMemo(
    () => priceTakeoff(chosen, { products, groups, types, recurring }),
    [chosen, products, groups, types, recurring],
  )

  /**
   * Keep the photo, then read it.
   *
   * The path goes in areas/<companyId>/… because that is the prefix
   * storage_object_company() resolves by company id — a walter/ prefix of its
   * own would resolve to nobody and the upload would be refused by RLS.
   */
  const analyse = async () => {
    if (!preview) return
    setAnalysing(true)
    setError(null)
    setResult(null)
    setPicked(new Set())

    const base64 = String(preview).split(',')[1]

    // 1. Keep it. A failed upload does not stop the count — it is evidence,
    //    not a gate — but the rep is told the picture was not saved.
    //
    //    The PATH is stored and no URL is. audit-photos is a private bucket,
    //    so getPublicUrl() hands back a link that answers 400 — the same trap
    //    that left every employee headshot broken. Whatever shows this photo
    //    later signs the path; a stored public URL would be a dead one.
    let path = null
    try {
      const ext = (mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const key = `areas/${companyId}/walter/${assessmentId}/${Date.now()}.${ext}`
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const up = await supabase.storage.from('audit-photos')
        .upload(key, bin, { contentType: mediaType, upsert: false })
      if (!up.error) path = key
    } catch {
      // Keeping the photo is best-effort; reading it is the job.
    }
    setPhotoPath(path)
    setPhotoKept(!!path)

    // 2. Read it.
    try {
      // The caller's own token, with no anon fallback. The anon key ships in
      // the client bundle and carries no email, so a call made with it meters
      // the vision charge to nobody — a free AI endpoint for anyone who reads
      // the JavaScript. walter-analyze pins verify_jwt on for the same reason.
      const sess = await supabase.auth.getSession()
      const token = sess?.data?.session?.access_token
      if (!token) {
        setError('Your session has expired. Sign in again and the photo will count.')
        return
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/walter-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType,
          context: { face, segment, notes: note || null },
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Walter could not read the photo.')
        return
      }
      // Normalised on the server too; run again so a hand-rolled response or a
      // stale deploy cannot put an invented type_code on screen.
      const a = normalizeAnalysis(data.analysis, types)
      setResult(a)
      // Everything Walter is sure of starts ticked. A low-confidence run does
      // not, so accepting it is a decision somebody made.
      setPicked(new Set(a.runs.map((r, i) => (runReady(r) && r.confidence !== 'low' ? i : -1)).filter((i) => i >= 0)))
    } catch (err) {
      setError(err.message || 'Walter could not be reached.')
    } finally {
      setAnalysing(false)
    }
  }

  const toggle = (i) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })

  const add = async () => {
    if (chosen.length === 0) return
    setAdding(true)
    setError(null)
    // Walk the ticked indices themselves rather than reading them back out of
    // the order of `chosen`. The two agree today, but nothing makes them: any
    // change to how `chosen` is built would quietly paste one run's reasons
    // onto another run's row, and the rows would still look right.
    const payload = [...picked].sort((a, b) => a - b).map((i) => {
      const row = rows[i]
      const run = result.runs[i]
      const type = types.find((t) => t.type_code === row.type_code) || null
      return {
        ...row,
        company_id: companyId,
        assessment_id: assessmentId,
        // Kept in step with the takeoff the way the count sheet does it.
        pane_count: rowPanes(row, type).panes,
        photo_path: photoPath,
        // What Walter said, in the rep's own notes field, so the reason a run
        // is on the bid survives the sheet being closed.
        notes: [run.why, run.watch_for ? `Watch for: ${run.watch_for}` : null]
          .filter(Boolean).join(' — ') || null,
      }
    })
    const res = await supabase.from('glass_areas').insert(payload)
    setAdding(false)
    if (res.error) { setError(res.error.message); return }
    onSaved?.()
    onClose?.()
  }

  const needType = (result?.runs || []).filter((r) => !runReady(r)).length

  return (
    <Sheet
      open
      onClose={onClose}
      title="Count windows from a photo"
      isMobile={isMobile}
      footer={result ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn variant="secondary" onClick={clear}>Another photo</Btn>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div style={{ fontSize: 13, color: theme.textSecondary, whiteSpace: 'nowrap' }}>
            {chosen.length} of {result.runs.length} runs · <strong style={{ color: theme.text }}>{money(chosenPriced.total)}</strong>
          </div>
          <Btn onClick={add} disabled={adding || chosen.length === 0}>
            {adding ? <Loader2 size={15} className="walter-spin" /> : <Check size={15} />}
            {adding ? 'Adding…' : `Add ${chosen.length} run${chosen.length === 1 ? '' : 's'}`}
          </Btn>
        </div>
      ) : null}
    >
      {/* What the rep owns. A photograph of the outside says nothing about
          whether the inside was sold, and the assessment knows whose building
          it is — so these two stamp every proposal rather than being guessed. */}
      {!result && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))',
          gap: 12,
        }}>
          <FormField label="What is being quoted" hint="Walter counts the glass; you say which side of it is sold.">
            <Select value={face} onChange={setFace} options={FACES} />
          </FormField>
          <FormField label="What kind of building">
            <Select value={segment} onChange={setSegment} options={SEGMENTS} />
          </FormField>
        </div>
      )}

      {!preview && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            {[
              { ref: camRef, Icon: Camera, label: 'Take a photo', capture: 'environment' },
              { ref: fileRef, Icon: Upload, label: 'Choose a photo', capture: undefined },
            ].map(({ ref, Icon, label, capture }) => (
              <div key={label}>
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  style={{
                    width: '100%', padding: '22px 14px', background: theme.accentBg,
                    border: `2px dashed ${theme.border}`, borderRadius: 10, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    color: theme.accent, fontWeight: 700, fontSize: 13,
                  }}
                >
                  <Icon size={24} />
                  {label}
                </button>
                <input
                  ref={ref} type="file" accept="image/*" capture={capture}
                  onChange={choose} style={{ display: 'none' }}
                />
              </div>
            ))}
          </div>

          <FormField
            label="Anything Walter should know (optional)"
            hint="What the photo does not show — the back is all sliders, the upstairs is screened, there is scaffolding up."
          >
            <TextArea value={note} onChange={setNote} rows={2} placeholder="" />
          </FormField>

          <Note tone="info" icon={ScanEye}>
            Walter reads the elevation into runs of windows and names each one off
            your window catalogue — he never picks a product and never sets a price.
            Your own price book does that afterwards, from his count. Stand back far
            enough to get the door in frame: a door leaf is 6ft 8in almost without
            exception, and it is how he works out how high the glass is.
          </Note>
        </>
      )}

      {preview && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <img
            src={preview}
            alt="The photo being counted"
            style={{
              width: '100%', maxHeight: 240, objectFit: 'cover',
              borderRadius: 10, border: `1px solid ${theme.border}`, display: 'block',
            }}
          />
          <button
            type="button"
            onClick={clear}
            aria-label="Remove this photo"
            style={{
              position: 'absolute', top: 8, right: 8, width: 30, height: 30,
              borderRadius: '50%', background: 'rgba(20,24,21,0.65)', border: 'none',
              cursor: 'pointer', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {preview && !result && (
        <Btn onClick={analyse} disabled={analysing} style={{ width: '100%' }}>
          {analysing ? <Loader2 size={16} className="walter-spin" /> : <ScanEye size={16} />}
          {analysing ? 'Walter is counting…' : 'Count the windows'}
        </Btn>
      )}

      {error && <Note tone="danger" icon={X}>{error}</Note>}

      {photoKept === false && result && (
        <Note tone="warning">
          The count went through but the photo itself was not saved, so these runs
          will have no picture behind them.
        </Note>
      )}

      {result && (
        <>
          {/* What Walter is looking at, said out loud, the way Lenard describes
              a fixture before naming it. */}
          <div style={{
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: 10, padding: 12, marginTop: 12,
          }}>
            <div style={{ fontWeight: 700, color: theme.text, fontSize: 14 }}>
              {result.surface || 'What Walter sees'}
            </div>
            <div style={{
              display: 'grid', gap: 10, marginTop: 10,
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
            }}>
              <MiniStat label="Runs counted" value={result.runs.length} />
              <MiniStat label="Windows" value={rows.reduce((s, r) => s + (Number(r.units) || 0), 0)} />
              <MiniStat label="Storeys" value={result.storeys ?? '—'} />
              <MiniStat label="Wall" value={result.wall_material || '—'} />
            </div>
            {result.scale && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10,
                fontSize: 13, color: theme.textSecondary, lineHeight: 1.5,
              }}>
                <Ruler size={15} style={{ color: theme.accent, flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  Heights measured against{' '}
                  <strong style={{ color: theme.text }}>
                    {result.scale.reference_name || result.scale.reference_code}
                  </strong>
                  {result.scale.dimension_in ? ` at ${result.scale.dimension_in}in` : ''}
                  {result.scale.reliability ? ` (${result.scale.reliability} reliability)` : ''}
                  {result.scale.how ? ` — ${result.scale.how}` : ''}
                </div>
              </div>
            )}
            {!result.scale && (
              <Note tone="warning" icon={Ruler}>
                Nothing of a known size was in the frame, so the heights here are
                not measured against anything. Check the reach before the crew is
                scheduled.
              </Note>
            )}
          </div>

          {result.runs.length === 0 && (
            <Note tone="warning">
              Walter could not find any windows in this photo. {result.notes || 'Try standing further back, with the whole elevation and the door in frame.'}
            </Note>
          )}

          {result.runs.map((run, i) => {
            const type = types.find((t) => t.type_code === run.type_code) || null
            const ready = runReady(run)
            const on = picked.has(i)
            const priced = perRun[i]
            const panes = rowPanes(rows[i], type)
            return (
              <div
                key={i}
                style={{
                  marginTop: 12, padding: 12, borderRadius: 10,
                  background: on ? theme.accentBg : theme.bgCard,
                  border: `1px solid ${on ? theme.accent : theme.border}`,
                  opacity: ready ? 1 : 0.92,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!ready}
                    onChange={() => toggle(i)}
                    aria-label={`Add ${run.area_name || 'this run'} to the takeoff`}
                    style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: theme.accent }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ color: theme.text, fontSize: 14 }}>
                        {run.units} × {type ? type.type_name : 'window, unnamed'}
                      </strong>
                      <Tag tone={CONFIDENCE_TONE[run.confidence]}>{CONFIDENCE_WORD[run.confidence]}</Tag>
                    </div>
                    <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 3 }}>
                      {[
                        run.area_name,
                        FLOOR_WORD(run.floor),
                        feet(run.reach_in),
                        type ? `${panes.panes} pane${panes.panes === 1 ? '' : 's'}` : null,
                        run.condition !== 'maintenance' ? CONDITION_WORD[run.condition] : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                    {run.why && (
                      <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 5, lineHeight: 1.5 }}>
                        {run.why}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 800, color: theme.text, fontSize: 15 }}>
                      {ready ? money(priced.total) : '—'}
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditRun?.(rows[i])}
                      style={{
                        marginTop: 4, background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', color: theme.accent, fontSize: 12, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Pencil size={12} /> {ready ? 'Change' : 'Name it'}
                    </button>
                  </div>
                </div>

                {!ready && (
                  <Note tone="danger">
                    Walter called this <strong>{run.type_code_rejected || 'something not in the catalogue'}</strong>,
                    which is not a window type you have. The count is right — pick what
                    kind of window it is and the pane count comes off the catalogue.
                  </Note>
                )}
                {run.watch_for && <Note tone="warning">{run.watch_for}</Note>}
                {ready && priced.unpriced.length > 0 && (
                  <Note tone="warning">
                    Your price book has nothing for {priced.unpriced.join(', ').replace(/_/g, ' ')},
                    so that part of this run is not on the total.
                  </Note>
                )}
              </div>
            )
          })}

          {needType > 0 && (
            <Note tone="info">
              {needType} run{needType === 1 ? '' : 's'} need{needType === 1 ? 's' : ''} a window
              type before {needType === 1 ? 'it' : 'they'} can be added.
            </Note>
          )}

          {result.not_counted.length > 0 && (
            <Note tone="info" icon={ScanEye}>
              <strong>Not in this photo, so not counted:</strong>{' '}
              {result.not_counted.join('; ')}.
            </Note>
          )}

          {result.notes && <Note tone="info">{result.notes}</Note>}

          {result.segment_looks_like && result.segment_looks_like !== segment && (
            <Note tone="warning">
              This was counted as {segment}, but the photo looks{' '}
              {result.segment_looks_like} to Walter. That changes which products the
              book reaches for, so it is worth a second look.
            </Note>
          )}
        </>
      )}

      <style>{`
        @keyframes walter-spin { to { transform: rotate(360deg); } }
        .walter-spin { animation: walter-spin 1s linear infinite; }
      `}</style>
    </Sheet>
  )
}
