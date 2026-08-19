// The acquisition facts the lifecycle bar runs on, and the fastest way to
// get them in.
//
// The maths has been able to answer "when should I sell this" for a while.
// What it lacks is four numbers per machine, and nobody is typing those for
// a yard of forty. So the VIN does the work: paste it and NHTSA fills make,
// model, year and category for free, leaving two fields a human genuinely has
// to supply — what it cost and what the meter reads.
//
// Local state with an explicit save, not update-on-keystroke. Purchase price
// feeds a recommendation to sell a five-figure asset; it should change when
// someone means it to.

import { useRef, useState } from 'react'
import { Search, Check, AlertTriangle, Loader, Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { decodeVin } from '../lib/vinDecode'
import { CLASS_CURVES } from '../lib/fleetLifecycle'

const CLASSES = Object.keys(CLASS_CURVES)

export default function LifecycleInputs({ asset, theme, onSaved }) {
  const [form, setForm] = useState(() => ({
    serial_vin: asset?.serial_vin || '',
    make: asset?.make || '',
    model: asset?.model || '',
    model_year: asset?.model_year ?? '',
    asset_class: asset?.asset_class || '',
    purchase_price: asset?.purchase_price ?? '',
    purchase_date: asset?.purchase_date || '',
    hours_at_purchase: asset?.hours_at_purchase ?? '',
    miles_at_purchase: asset?.miles_at_purchase ?? '',
  }))
  const [decoding, setDecoding] = useState(false)
  const [note, setNote] = useState(null)     // { kind: 'ok'|'warn'|'err', text }
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const basis = CLASS_CURVES[form.asset_class]?.basis || 'miles'

  const runDecode = async () => {
    setDecoding(true)
    setNote(null)
    const r = await decodeVin(form.serial_vin)
    setDecoding(false)
    if (!r.ok) { setNote({ kind: 'err', text: r.error }); return }
    setForm(f => ({
      ...f,
      make: r.make || f.make,
      model: r.model || f.model,
      model_year: r.modelYear ?? f.model_year,
      // Only fill a class that hasn't been set: a human who chose one knows
      // something about how the machine is actually used that a VIN doesn't.
      asset_class: f.asset_class || r.assetClass,
    }))
    setNote(r.warning
      ? { kind: 'warn', text: r.warning }
      : { kind: 'ok', text: `${r.modelYear || ''} ${r.make} ${r.model}`.trim() })
  }

  // Off-road iron has no VIN and no registry to look it up in — the facts are
  // stamped on a plate bolted to the machine. Photographing it is
  // transcription rather than data entry, which is the only version of this
  // anyone will actually do for a yard full of equipment.
  const scanPlate = async (file) => {
    if (!file) return
    setScanning(true)
    setNote(null)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const fr = new FileReader()
        // Strip the data: prefix — the API wants raw base64.
        fr.onload = () => resolve(String(fr.result).split(',')[1])
        fr.onerror = reject
        fr.readAsDataURL(file)
      })
      const { data, error } = await supabase.functions.invoke('fleet-plate-scan', {
        body: { image: { base64, mediaType: file.type || 'image/jpeg' } },
      })
      if (error) throw error
      if (!data?.ok) { setNote({ kind: 'err', text: data?.error || 'Could not read that plate.' }); return }

      setForm(f => ({
        ...f,
        make: data.make || f.make,
        model: data.model || f.model,
        model_year: data.modelYear ?? f.model_year,
        // Never overwrite something a person chose: they know how the machine
        // is actually used, and a plate does not.
        serial_vin: f.serial_vin || data.serial || '',
        asset_class: f.asset_class || data.assetClass || '',
        hours_at_purchase: f.hours_at_purchase,
      }))

      // Say what could not be read rather than quietly leaving blanks. A
      // serial the model refused is worth re-shooting; a serial it guessed
      // would be a wrong machine recorded as a right one.
      const missed = (data.unreadable || []).filter(Boolean)
      const lowSerial = data.confidence?.serial != null && data.confidence.serial < 0.6
      setNote(
        missed.length || lowSerial || !data.serial
          ? { kind: 'warn', text: `Read ${[data.make, data.model].filter(Boolean).join(' ') || 'the plate'}. ${data.serial ? '' : 'Serial was not legible — '}${data.notes || 'Check anything left blank.'}` }
          : { kind: 'ok', text: `${[data.modelYear, data.make, data.model].filter(Boolean).join(' ')} · ${data.serial}` },
      )
    } catch (e) {
      setNote({ kind: 'err', text: e.message || 'Could not read that plate.' })
    } finally {
      setScanning(false)
      // Reset so the same photo can be retried after a bad read.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    setSaving(true)
    const numeric = v => (v === '' || v === null || v === undefined ? null : Number(v))
    const { error } = await supabase.from('fleet').update({
      serial_vin: form.serial_vin || null,
      make: form.make || null,
      model: form.model || null,
      model_year: numeric(form.model_year),
      asset_class: form.asset_class || null,
      meter_basis: form.asset_class ? basis : null,
      purchase_price: numeric(form.purchase_price),
      purchase_date: form.purchase_date || null,
      hours_at_purchase: numeric(form.hours_at_purchase),
      miles_at_purchase: numeric(form.miles_at_purchase),
    }).eq('id', asset.id)
    setSaving(false)
    if (error) { setNote({ kind: 'err', text: error.message }); return }
    setNote({ kind: 'ok', text: 'Saved.' })
    onSaved?.()
  }

  const field = {
    width: '100%', minHeight: 44, padding: '0 10px',
    background: theme.bg, border: `1px solid ${theme.border}`,
    borderRadius: 8, color: theme.text, boxSizing: 'border-box',
    // 16px: iOS zooms the page on focus for anything smaller, and the user
    // then has to pinch back out to see the rest of the form.
    fontSize: 16,
  }
  const label = { fontSize: 11, color: theme.textMuted, display: 'block', marginBottom: 4 }

  return (
    <div style={{
      background: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: 12, padding: 20, marginBottom: 20,
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: theme.text }}>
        Ownership &amp; lifecycle
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: theme.textMuted }}>
        What it cost and what it is. Depreciation is the largest cost in a fleet and the
        only one that never sends an invoice — these are what let it be measured.
      </p>

      {/* VIN first: it fills three of the fields below on its own. */}
      <div style={{ marginBottom: 14 }}>
        <label style={label}>VIN or serial</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={form.serial_vin}
            onChange={e => set('serial_vin', e.target.value)}
            placeholder="17-character VIN for anything road-legal"
            style={{ ...field, flex: 1, textTransform: 'uppercase' }}
          />
          <button
            onClick={runDecode}
            disabled={decoding || !form.serial_vin}
            style={{
              minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: decoding ? 'wait' : 'pointer',
              background: theme.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6, opacity: form.serial_vin ? 1 : 0.5,
            }}
          >
            {decoding ? <Loader size={14} /> : <Search size={14} />} Decode
          </button>
          {/* capture=environment opens the rear camera straight into the
              viewfinder on a phone rather than a file browser. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => scanPlate(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            title="Photograph the data plate — for equipment with no VIN"
            style={{
              minHeight: 44, padding: '0 14px', borderRadius: 8,
              cursor: scanning ? 'wait' : 'pointer',
              background: 'transparent', color: theme.textSecondary,
              border: `1px solid ${theme.border}`, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            {scanning ? <Loader size={14} /> : <Camera size={14} />} Plate
          </button>
        </div>
        {note && (
          <div style={{
            marginTop: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            color: note.kind === 'err' ? '#b91c1c' : note.kind === 'warn' ? '#8a6d08' : '#15803d',
          }}>
            {note.kind === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />} {note.text}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 150px))', gap: 12 }}>
        <div>
          <label style={label}>Make</label>
          <input value={form.make} onChange={e => set('make', e.target.value)} style={field} />
        </div>
        <div>
          <label style={label}>Model</label>
          <input value={form.model} onChange={e => set('model', e.target.value)} style={field} />
        </div>
        <div>
          <label style={label}>Year</label>
          <input type="number" value={form.model_year} onChange={e => set('model_year', e.target.value)} style={field} />
        </div>
        <div>
          <label style={label}>Category</label>
          <select value={form.asset_class} onChange={e => set('asset_class', e.target.value)} style={field}>
            <option value="">—</option>
            {CLASSES.map(c => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={label}>Purchase price</label>
          <input type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="$" style={field} />
        </div>
        <div>
          <label style={label}>Purchased</label>
          <input type="date" value={form.purchase_date || ''} onChange={e => set('purchase_date', e.target.value)} style={field} />
        </div>
        <div>
          {/* Which meter matters follows the category, because asking a truck
              owner for engine hours is how a form gets abandoned. */}
          <label style={label}>{basis === 'hours' ? 'Hours when bought' : 'Miles when bought'}</label>
          <input
            type="number"
            value={basis === 'hours' ? form.hours_at_purchase : form.miles_at_purchase}
            onChange={e => set(basis === 'hours' ? 'hours_at_purchase' : 'miles_at_purchase', e.target.value)}
            placeholder="0 if bought new"
            style={field}
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{
          marginTop: 16, minHeight: 44, padding: '0 18px', borderRadius: 8,
          background: theme.accent, color: '#fff', border: 'none',
          fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
