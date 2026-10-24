// Count a run of windows, and see what it sells for while you type.
//
// This is the cleaning half of Walter, and it is the Lenard shape: a takeoff
// records WHAT IS THERE — this type of window, this many of them, this side,
// this high — and the product comes off the tenant's own price book. The sheet
// prices nothing itself. Every figure under "What this adds" comes back from
// glassCleaningPricing.priceTakeoff over the one row being edited, which is
// the same function that prices the whole takeoff on the page behind it. One
// rule, so the preview cannot disagree with the bid.
//
// The window TYPE is the field that matters most, and it is a picker rather
// than a number because the pane count is not a thing anyone should be typing.
// Six double-hungs is twelve panes and six casements is six; the catalogue
// knows, and a rep who had to remember would eventually bill half a house.

import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { priceTakeoff } from '../../../lib/glassCleaningPricing'
import { rowPanes, rowSizeBand, accessFor } from '../../../lib/windowTypes'
import { useTheme } from '../../../components/ThemeContext'
import {
  Sheet, Btn, FormField, TextInput, NumInput, Select, Toggle, Note,
} from './WalterUI'
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

const CONDITIONS = [
  { value: 'maintenance', label: 'Maintenance clean' },
  { value: 'first_clean', label: 'First clean — dirty' },
  { value: 'post_construction', label: 'Post construction — residue to scrape' },
  { value: 'hard_water', label: 'Hard water staining' },
]

const FLOORS = [
  { value: '1', label: 'Ground floor' },
  { value: '2', label: '2nd storey' },
  { value: '3', label: '3rd storey' },
  { value: '4', label: '4th storey' },
  { value: '5', label: '5th storey or higher' },
]

const FAMILY_LABEL = {
  operable: 'Opens',
  fixed: 'Fixed glass',
  door: 'Doors',
  specialty: 'Bay, bow and specialty',
  commercial: 'Commercial',
  skylight: 'Skylights',
}

// The light-topo theme has no danger token, so the one colour the Note
// component uses for its danger tone is reused rather than invented here.
const DANGER = '#dc2626'

// The catalogue writes its warnings as sentences — "Counted as one pane. It is
// two — the upper sash and the lower sash…". Lowercasing the whole string to
// join it onto "Most often got wrong:" flattens the second sentence too, so
// only the first letter moves.
const uncapitalise = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '')

const ACCESS_WORDS = {
  ground: 'reached from the ground',
  ladder: 'ladder work',
  waterfed: 'waterfed pole',
  lift: 'needs a lift',
  rope: 'needs rope access',
}

export default function WalterCountSheet({
  onClose, onSaved, companyId, assessmentId, editing, isMobile,
  types = [], products = [], groups = [], recurring = false,
}) {
  const { theme } = useTheme()
  const [draft, setDraft] = useState(() => editing
    ? { ...editing, floor: String(editing.floor ?? 1), units: editing.units ?? editing.pane_count ?? 1 }
    : {
        area_name: '', type_code: 'double_hung', units: 1, face: 'both',
        segment: 'residential', floor: '1', condition: 'maintenance',
        width_in: '', height_in: '', reach_in: '', count_lites: null,
        screens: '', tracks: '', notes: '',
      })
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  const set = (k) => (v) => { setTouched(true); setDraft((d) => ({ ...d, [k]: v })) }

  const typeOptions = useMemo(() => {
    const order = ['operable', 'fixed', 'door', 'specialty', 'commercial', 'skylight']
    const sorted = [...types].sort((a, b) => {
      const ai = order.indexOf(a.family), bi = order.indexOf(b.family)
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
      return String(a.type_name).localeCompare(String(b.type_name))
    })
    return sorted.map((t) => ({
      value: t.type_code,
      label: `${FAMILY_LABEL[t.family] || t.family} · ${t.type_name}`,
    }))
  }, [types])

  const type = useMemo(
    () => types.find((t) => t.type_code === draft.type_code) || null,
    [types, draft.type_code],
  )

  // The row as it would be saved, which is what gets priced. Numbers come off
  // the form as strings, and a string floor would make accessFor read NaN.
  const row = useMemo(() => ({
    area_name: draft.area_name || null,
    type_code: draft.type_code,
    units: Number(draft.units) || 0,
    face: draft.face,
    segment: draft.segment,
    floor: Number(draft.floor) || 1,
    condition: draft.condition,
    width_in: draft.width_in === '' ? null : Number(draft.width_in),
    height_in: draft.height_in === '' ? null : Number(draft.height_in),
    reach_in: draft.reach_in === '' ? null : Number(draft.reach_in),
    count_lites: draft.count_lites,
    screens: draft.screens === '' ? null : Number(draft.screens),
    tracks: draft.tracks === '' ? null : Number(draft.tracks),
  }), [draft])

  // Priced by the same function that prices the page behind this sheet.
  const preview = useMemo(
    () => priceTakeoff([row], { products, groups, types, recurring }),
    [row, products, groups, types, recurring],
  )

  const panes = rowPanes(row, type)
  const band = rowSizeBand(row, type)
  const access = accessFor({ floor: row.floor, face: row.face === 'in' ? 'in' : 'out', reach_in: row.reach_in, segment: row.segment })

  const errors = {}
  if (!draft.type_code) errors.type_code = 'Pick what kind of window it is — that is where the pane count comes from.'
  if (!(Number(draft.units) > 0)) errors.units = 'How many of them did you count?'
  const canSave = Object.keys(errors).length === 0
  const show = (f) => (touched ? errors[f] : null)

  const save = async () => {
    setTouched(true)
    if (!canSave) return
    setSaving(true)
    const payload = {
      area_name: row.area_name,
      type_code: row.type_code,
      units: row.units,
      // Kept in step so anything reading panes directly — a document, an
      // export — sees the same number the bid was built from.
      pane_count: panes.panes,
      face: row.face,
      segment: row.segment,
      floor: row.floor,
      condition: row.condition,
      width_in: row.width_in,
      height_in: row.height_in,
      reach_in: row.reach_in,
      count_lites: row.count_lites,
      screens: row.screens,
      tracks: row.tracks,
      size_band: band,
      access,
      notes: draft.notes || null,
      updated_at: new Date().toISOString(),
    }
    const res = editing
      ? await supabase.from('glass_areas').update(payload)
          .eq('company_id', companyId).eq('id', editing.id)
      : await supabase.from('glass_areas').insert({
          ...payload, company_id: companyId, assessment_id: assessmentId,
        })
    setSaving(false)
    if (res.error) { setSaveError(res.error.message); return }
    onSaved?.()
    onClose?.()
  }

  const remove = async () => {
    if (!editing) return
    if (!confirm(`Remove ${editing.area_name || 'this run of windows'} from the takeoff?`)) return
    setSaving(true)
    const res = await supabase.from('glass_areas').delete()
      .eq('company_id', companyId).eq('id', editing.id)
    setSaving(false)
    if (res.error) { setSaveError(res.error.message); return }
    onSaved?.()
    onClose?.()
  }

  const dividedChoice = type && Number(type.lites_per_unit) !== Number(type.panes_per_unit)

  return (
    <Sheet
      open
      onClose={onClose}
      isMobile={isMobile}
      title={editing ? (editing.area_name || 'Windows counted') : 'Count windows'}
      footer={
        <>
          {editing && (
            <Btn variant="danger" onClick={remove} disabled={saving} style={{ marginRight: 'auto' }}>
              <Trash2 size={15} /> Remove
            </Btn>
          )}
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={save} disabled={saving || (touched && !canSave)}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Add to takeoff'}
          </Btn>
        </>
      }
    >
      {saveError && <Note tone="danger">Could not save: {saveError}</Note>}

      <FormField label="Where" hint="The elevation or room, as the crew will read it">
        <TextInput value={draft.area_name} onChange={set('area_name')} placeholder="Great room, south elevation" />
      </FormField>

      <FormField
        label="What kind of window"
        error={show('type_code')}
        hint={show('type_code') ? null : 'This is where the pane count comes from'}
      >
        <Select value={draft.type_code} onChange={set('type_code')} options={typeOptions} invalid={!!show('type_code')} />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="How many" error={show('units')}>
          <NumInput value={draft.units} onChange={set('units')} step="1" invalid={!!show('units')} />
        </FormField>
        <FormField label="Which sides">
          <Select value={draft.face} onChange={set('face')} options={FACES} />
        </FormField>
      </div>

      {type && (
        <Note tone="accent">
          {panes.units || 0} × {type.type_name} is <strong>{panes.panes} pane{panes.panes === 1 ? '' : 's'}</strong>
          {' '}of glass{draft.face === 'both' ? ', each side priced separately' : ''}.
          {panes.basis === 'lites' && ' Billed by the lites, because a cloth has to go into every corner of each one.'}
          {type.common_mistakes ? ` Most often got wrong: ${uncapitalise(type.common_mistakes)}` : ''}
        </Note>
      )}

      {dividedChoice && (
        <div style={{ marginTop: 4 }}>
          <Toggle
            checked={draft.count_lites == null ? !!type?.bill_lites : !!draft.count_lites}
            onChange={set('count_lites')}
            label={`Bill the ${type.lites_per_unit} lites rather than the ${type.panes_per_unit} sashes`}
            hint="True muntins sit proud of the glass. A snap-in grille lifts out and cleans flat."
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, marginTop: 8 }}>
        <FormField label="House or building">
          <Select value={draft.segment} onChange={set('segment')} options={SEGMENTS} />
        </FormField>
        <FormField label="What state is it in">
          <Select value={draft.condition} onChange={set('condition')} options={CONDITIONS} />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Which storey" hint={ACCESS_WORDS[access] || null}>
          <Select value={String(draft.floor)} onChange={set('floor')} options={FLOORS} />
        </FormField>
        <FormField label="Reach inside" hint="Inches above the floor, if it is high">
          <NumInput value={draft.reach_in} onChange={set('reach_in')} step="12" placeholder="—" />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Width" hint={band ? `Reads as ${band.replace('_', ' ')}ft` : 'Inches'}>
          <NumInput value={draft.width_in} onChange={set('width_in')} step="1" placeholder={type?.typical_width_in ?? '—'} />
        </FormField>
        <FormField label="Height" hint="Inches">
          <NumInput value={draft.height_in} onChange={set('height_in')} step="1" placeholder={type?.typical_height_in ?? '—'} />
        </FormField>
      </div>

      {draft.condition === 'post_construction' && (
        <Note tone="accent">
          Post construction is its own product, priced by size — not a surcharge on a
          maintenance clean. Measure if you can: the bands are under 4ft, over 4ft and over 6ft,
          and they are not priced in that order.
        </Note>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Screens" hint={`${type?.screens_per_unit ?? 0} per window unless you say`}>
          <NumInput value={draft.screens} onChange={set('screens')} step="1" placeholder={String((Number(type?.screens_per_unit) || 0) * (Number(draft.units) || 0))} />
        </FormField>
        <FormField label="Tracks" hint={type?.has_track ? 'This type has one' : 'This type has none'}>
          <NumInput value={draft.tracks} onChange={set('tracks')} step="1" placeholder={String(type?.has_track ? (Number(draft.units) || 0) : 0)} />
        </FormField>
      </div>

      <FormField label="Note">
        <TextInput value={draft.notes} onChange={set('notes')} placeholder="Anything the crew needs to know" />
      </FormField>

      {/* What the book says this run is worth. Not computed here. */}
      <div style={{
        marginTop: 16, padding: 14, borderRadius: 10,
        background: theme.bgCardHover, border: `1px solid ${theme.border}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: theme.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
        }}>
          What this adds
        </div>
        {preview.lines.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 13 }}>Nothing counted yet.</div>
        )}
        {preview.lines.map((l, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', gap: 10,
            padding: '5px 0', fontSize: 13,
            color: l.unpriced ? DANGER : theme.text,
          }}>
            <span>
              {l.item_name}
              <span style={{ color: theme.textMuted }}> · {l.quantity} × {money(l.price)}</span>
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {l.unpriced ? 'no product' : money(l.line_total)}
            </span>
          </div>
        ))}
        {preview.lines.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            borderTop: `1px solid ${theme.border}`, marginTop: 8, paddingTop: 8,
            fontWeight: 700, color: theme.text,
          }}>
            <span>This run</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(preview.total)}</span>
          </div>
        )}
      </div>

      {preview.unpriced.length > 0 && (
        <Note tone="danger">
          {preview.unpriced.length === 1 ? 'There is no product' : 'There are no products'} in the
          price book for {preview.unpriced.map((u) => u.work.replace(/_/g, ' ')).join(', ')}.
          It will show at nothing until somebody adds one — Walter will not make a rate up for it.
        </Note>
      )}

      {preview.ambiguities.length > 0 && (
        <Note tone="warning">
          The book prices this twice, at different figures
          ({preview.ambiguities.map((a) => `${money(a.low)} and ${money(a.high)}`).join('; ')}).
          Walter has taken the first by name, which is not a decision anybody made — worth a look.
        </Note>
      )}

      {preview.unknown_types.length > 0 && (
        <Note tone="warning">
          The catalogue has no entry for {preview.unknown_types.join(', ')}, so it is counted at
          one pane each. Anything with two sashes would be billed at half.
        </Note>
      )}
    </Sheet>
  )
}
