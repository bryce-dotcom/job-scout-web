// Scout a site from photos.
//
// Everything this produces is advisory and lands in a field a human confirms.
// Soil from a photograph is genuinely uncertain — moisture darkens it, low sun
// flattens the texture, and a skim of topsoil hides whatever is underneath —
// so the soil suggestion is offered, never applied, and the access and
// conditions notes are appended to what is already there rather than
// overwriting somebody's own words.

import { useState, useRef } from 'react'
import {
  Camera, Image as ImageIcon, Loader2, TriangleAlert, Check, X,
  Layers, DoorOpen, Droplets, HelpCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { prepImages } from '../../lib/imagePrep'
import { SOIL_PROFILES } from '../../lib/digEstimator'
import { T, Btn, Sheet, Note, Badge, SectionLabel } from './DonUI'

const SEVERITY_TONE = { blocker: 'danger', caution: 'warning', info: 'muted' }

export default function SiteScout({ open, onClose, isMobile, site, onSaved }) {
  const cameraRef = useRef(null)
  const fileRef = useRef(null)

  const [images, setImages] = useState([])
  const [stage, setStage] = useState('pick')      // pick | reading | review | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [applySoil, setApplySoil] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => { setImages([]); setStage('pick'); setResult(null); setError(''); setApplySoil(false) }
  const close = () => { reset(); onClose?.() }

  const pick = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    const prepped = await prepImages(files, 'notes')
    setImages((p) => [...p, ...prepped].slice(0, 8))
  }

  const scout = async () => {
    if (!images.length) return
    setStage('reading'); setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('don-read-site', {
        body: {
          images: images.map((i) => ({ base64: i.base64, mediaType: i.mediaType })),
          site: site ? { address: site.address, default_soil_class: site.default_soil_class } : null,
        },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) {
        setError(data.ai_unavailable
          ? `${data.error} Nothing is blocked — you can type these notes yourself.`
          : data.error)
        setStage('error')
        return
      }
      setResult(data)
      setStage('review')
    } catch (e) {
      setError(e.message || 'Could not read those photos.')
      setStage('error')
    }
  }

  const save = async () => {
    setSaving(true)
    const accessLines = (result.access || []).map((a) => `${a.kind}: ${a.note}`)
    const condLines = (result.conditions || []).map((c) => `${c.kind}: ${c.note}`)
    const patch = { updated_at: new Date().toISOString() }

    // Append rather than replace — somebody may have written notes already,
    // and a photo read should not delete a person's own observation.
    if (accessLines.length) {
      patch.access_notes = [site.access_notes, ...accessLines].filter(Boolean).join('\n')
    }
    if (condLines.length) {
      patch.utility_notes = [site.utility_notes, ...condLines].filter(Boolean).join('\n')
    }
    if (applySoil && result.soil?.soil_class) {
      patch.default_soil_class = result.soil.soil_class
    }

    const { error: err } = await supabase.from('dig_sites').update(patch).eq('id', site.id)
    setSaving(false)
    if (err) { setError(err.message); setStage('error'); return }
    onSaved?.()
    close()
  }

  const soil = result?.soil
  const soilLabel = soil?.soil_class ? SOIL_PROFILES[soil.soil_class]?.label : null

  return (
    <Sheet
      open={open}
      onClose={close}
      isMobile={isMobile}
      title={stage === 'review' ? 'What Don saw' : 'Scout the site'}
      footer={
        stage === 'pick' ? (
          <Btn onClick={scout} disabled={!images.length} full>
            Scout {images.length || ''} photo{images.length === 1 ? '' : 's'}
          </Btn>
        ) : stage === 'review' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={close} style={{ flex: 1 }}>Discard</Btn>
            <Btn onClick={save} disabled={saving} style={{ flex: 2 }}>{saving ? 'Saving…' : 'Save to site'}</Btn>
          </div>
        ) : stage === 'error' ? (
          <Btn variant="ghost" onClick={() => setStage('pick')} full>Back</Btn>
        ) : null
      }
    >
      {stage === 'pick' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <Note tone="info" icon={HelpCircle}>
            Photograph the approach, the gate, any cut face or open trench, and the general lay of the site.
            Don describes what he can see — access, ground conditions, a soil guess where something is actually exposed.
            All of it is advisory and yours to confirm.
          </Note>

          <div style={{ display: 'grid', gap: 8 }}>
            <Btn variant="clay" onClick={() => cameraRef.current?.click()} full><Camera size={18} /> Take photos</Btn>
            <Btn variant="ghost" onClick={() => fileRef.current?.click()} full><ImageIcon size={18} /> Choose from files</Btn>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple onChange={pick} style={{ display: 'none' }} />
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={pick} style={{ display: 'none' }} />
          </div>

          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 90px), 1fr))', gap: 8 }}>
              {images.map((im, i) => (
                <div key={i} style={{ position: 'relative', minWidth: 0 }}>
                  <img src={im.preview} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }} />
                  <button
                    onClick={() => setImages((p) => p.filter((_, x) => x !== i))}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(44,53,48,0.8)', color: '#fff', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    aria-label="Remove photo"
                  ><X size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'reading' && (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <Loader2 size={32} style={{ color: T.accent, animation: 'don-spin 1s linear infinite' }} />
          <style>{`@keyframes don-spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 14 }}>Walking the site</div>
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>Access, ground conditions, anything exposed.</div>
        </div>
      )}

      {stage === 'error' && <Note tone="danger" icon={TriangleAlert}>{error}</Note>}

      {stage === 'review' && result && (
        <div style={{ display: 'grid', gap: 14 }}>
          {result.photo_quality === 'poor' && (
            <Note tone="warning" icon={TriangleAlert}>
              These photos are hard to read. Treat everything below as a rough impression.
            </Note>
          )}

          {/* Soil — offered, never applied */}
          <div>
            <SectionLabel>Soil</SectionLabel>
            {soilLabel ? (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, background: T.bgCard }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Layers size={16} style={{ color: T.clay }} />
                  <strong style={{ color: T.text }}>{soilLabel}</strong>
                  <Badge tone={soil.confidence >= 0.7 ? 'accent' : 'warning'}>
                    {Math.round(soil.confidence * 100)}% sure
                  </Badge>
                </div>
                {soil.seen_in && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>Seen in: {soil.seen_in}</div>}
                {soil.reasoning && <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>{soil.reasoning}</div>}
                <button
                  onClick={() => setApplySoil((v) => !v)}
                  style={{
                    marginTop: 10, minHeight: 44, width: '100%', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${applySoil ? T.accent : T.border}`,
                    background: applySoil ? T.accentBg : 'transparent',
                    color: applySoil ? T.accent : T.textSecondary, fontWeight: 600, fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {applySoil && <Check size={16} />}
                  {applySoil ? `Will set the site default to ${soilLabel}` : 'Use this as the site default soil'}
                </button>
              </div>
            ) : (
              <Note tone="muted" icon={Layers}>
                Nothing exposed enough to call. Don won’t guess soil off a grass surface —
                he needs a cut face, a trench wall or a stockpile.
              </Note>
            )}
          </div>

          {(result.access || []).length > 0 && (
            <div>
              <SectionLabel>Access</SectionLabel>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.access.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    <DoorOpen size={15} style={{ color: T.textMuted, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, color: T.textSecondary }}>{a.note}</div>
                      <div style={{ marginTop: 4 }}>
                        <Badge tone={SEVERITY_TONE[a.severity] || 'muted'}>{a.kind}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(result.conditions || []).length > 0 && (
            <div>
              <SectionLabel>Existing conditions</SectionLabel>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.conditions.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    <Droplets size={15} style={{ color: T.textMuted, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 13, color: T.textSecondary, minWidth: 0 }}>{c.note}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                Worth keeping — documented existing conditions are the cheapest claim defence there is.
              </div>
            </div>
          )}

          {(result.questions || []).length > 0 && (
            <div>
              <SectionLabel>Check these on site</SectionLabel>
              <Note tone="info" icon={HelpCircle}>
                {result.questions.map((q, i) => <div key={i}>• {q}</div>)}
              </Note>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
