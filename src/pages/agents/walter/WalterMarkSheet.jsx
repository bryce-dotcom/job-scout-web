// Add or change one mark on the damage register.
//
// The register is the bid: a mark added here is a zone the tech works, and a
// mark recorded as a repeat of another is one they do not. So what counts as a
// valid register is NOT decided here — windowEstimator.validateRegister owns
// that, and this sheet runs it over the register with the draft applied and
// shows whatever it says about this mark. A second rule set in the UI would
// drift from the engine's within a week, and the engine's is the one that
// prices.
//
// `duplicate_of` is still chosen from a list rather than typed. A dangling
// reference is now survivable — the engine counts the mark instead of losing
// it — but a picker means the question never arises.

import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import {
  SEVERITY_PROFILES, NOT_RESTORABLE, validateRegister, newZone,
} from '../../../lib/windowEstimator'
import { zonesFromRows } from '../../../lib/walterRows'
import {
  Sheet, Btn, FormField, TextInput, NumInput, Select, Toggle, Note,
} from './WalterUI'

const FACES = [
  { value: 'out', label: 'Outside' },
  { value: 'in', label: 'Inside (room side)' },
]

const SEVERITY_OPTIONS = Object.entries(SEVERITY_PROFILES).map(([k, p]) => ({ value: k, label: p.label }))

const REASON_LABEL = {
  coated_surface: 'Coated surface — cannot be abraded',
  factory_defect: 'Factory defect — warranty, not restoration',
  through_crack: 'Crack through the glass — replacement',
}
const REASON_OPTIONS = NOT_RESTORABLE.map((r) => ({ value: r, label: REASON_LABEL[r] || r }))

// Which box to put the engine's complaint next to. A mapping, not a rule.
const FIELD_FOR = {
  missing_code: 'code',
  duplicate_code: 'code',
  self_duplicate: 'duplicate_of',
  dangling_duplicate: 'duplicate_of',
  duplicate_cycle: 'duplicate_of',
  unknown_severity: 'severity',
  unknown_reason: 'not_restorable_reason',
}

export default function WalterMarkSheet({
  onClose, onSaved, companyId, assessmentId, rows, editing, isMobile,
}) {
  // Mounted fresh each time the sheet opens, so the draft is set up here
  // rather than synced in an effect.
  const [draft, setDraft] = useState(() =>
    editing ? { ...newZone(rows), ...editing } : newZone(zonesFromRows(rows)))
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  const set = (k) => (v) => { setTouched(true); setDraft((d) => ({ ...d, [k]: v })) }

  // The register as it WOULD be with this draft in it, handed to the engine.
  const errors = useMemo(() => {
    const others = (rows || []).filter((r) => String(r.id) !== String(editing?.id))
    const zones = zonesFromRows([...others, { ...draft, id: null }])
    const { problems } = validateRegister(zones)
    const mine = problems.filter(
      (p) => p.code == null || String(p.code) === String(draft.code || ''),
    )
    const out = {}
    for (const p of mine) {
      const field = FIELD_FOR[p.kind] || '_other'
      if (!out[field]) out[field] = p.message
    }
    if (!String(draft.code ?? '').trim()) out.code = 'Every mark needs a code — it is what repeats point at.'
    // Not an engine rule: a zone scale of zero is simply ignored when pricing,
    // so it is a confusing thing to type rather than a dangerous one.
    const zs = draft.zone_scale
    if (zs !== null && zs !== undefined && zs !== '' && !(Number(zs) > 0)) {
      out.zone_scale = 'Leave this empty unless the marked area is bigger than usual.'
    }
    return out
  }, [draft, rows, editing])

  const blocking = Object.keys(errors).filter((k) => k !== 'zone_scale')
  const canSave = blocking.length === 0

  const dupOptions = useMemo(
    () => (rows || [])
      .filter((r) => String(r.id) !== String(editing?.id) && String(r.code || '').trim())
      .map((r) => ({ value: r.code, label: `${r.code}${r.location ? ` — ${r.location}` : ''}` })),
    [rows, editing],
  )

  const save = async () => {
    setTouched(true)
    if (!canSave) return
    setSaving(true)
    const payload = {
      code: String(draft.code).trim(),
      location: draft.location || null,
      lite_id: draft.lite_id || null,
      face: draft.face || null,
      severity: draft.severity,
      edge: !!draft.edge,
      zone_scale: draft.zone_scale === '' ? null : draft.zone_scale,
      glass_size: draft.glass_size || null,
      zone_size: draft.zone_size || null,
      duplicate_of: draft.duplicate_of || null,
      not_restorable_reason: draft.not_restorable_reason || null,
      price_note: draft.price_note || null,
      updated_at: new Date().toISOString(),
    }
    const res = editing
      ? await supabase.from('glass_damage_items').update(payload)
          .eq('company_id', companyId).eq('id', editing.id)
      : await supabase.from('glass_damage_items').insert({
          ...payload, company_id: companyId, assessment_id: assessmentId,
        })
    setSaving(false)
    if (res.error) { setSaveError(res.error.message); return }
    onSaved?.()
    onClose?.()
  }

  const remove = async () => {
    if (!editing) return
    // A dangling reference no longer loses a mark, but the marks that pointed
    // here stop being recorded as repeats and start being counted — which
    // moves the price. Say so before doing it.
    const pointingHere = (rows || []).filter(
      (r) => String(r.duplicate_of || '') === String(editing.code || ''),
    )
    const warning = pointingHere.length
      ? `\n\n${pointingHere.length} mark(s) are recorded as repeats of ${editing.code} ` +
        `(${pointingHere.map((r) => r.code).join(', ')}). They will start counting as marks of their own.`
      : ''
    if (!confirm(`Remove ${editing.code} from the register?${warning}`)) return
    setSaving(true)
    const res = await supabase.from('glass_damage_items').delete()
      .eq('company_id', companyId).eq('id', editing.id)
    setSaving(false)
    if (res.error) { setSaveError(res.error.message); return }
    onSaved?.()
    onClose?.()
  }

  const show = (field) => (touched ? errors[field] : null)

  return (
    <Sheet
      open
      onClose={onClose}
      isMobile={isMobile}
      title={editing ? `Mark ${editing.code}` : 'Add a mark'}
      footer={
        <>
          {editing && (
            <Btn variant="danger" onClick={remove} disabled={saving} style={{ marginRight: 'auto' }}>
              <Trash2 size={15} /> Remove
            </Btn>
          )}
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={save} disabled={saving || (touched && !canSave)}>
            {saving ? 'Saving…' : editing ? 'Save mark' : 'Add mark'}
          </Btn>
        </>
      }
    >
      {saveError && <Note tone="danger">Could not save: {saveError}</Note>}
      {show('_other') && <Note tone="danger">{errors._other}</Note>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Code" error={show('code')} hint={show('code') ? null : 'What repeats point at'}>
          <TextInput value={draft.code} onChange={set('code')} invalid={!!show('code')} />
        </FormField>
        <FormField label="Pane / lite" hint="Groups the setup time">
          <TextInput value={draft.lite_id} onChange={set('lite_id')} placeholder="GR-1" />
        </FormField>
      </div>

      <FormField label="Location">
        <TextInput value={draft.location} onChange={set('location')} placeholder="Great room, south elevation" />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Face">
          <Select value={draft.face} onChange={set('face')} options={FACES} />
        </FormField>
        <FormField label="Severity" error={show('severity')}>
          <Select
            value={draft.severity}
            onChange={set('severity')}
            options={SEVERITY_OPTIONS}
            invalid={!!show('severity')}
          />
        </FormField>
      </div>

      {draft.severity === 'L0' && (
        <Note tone="accent">
          An L0 is tried with a cloth first. It costs no restoration minutes and goes to the
          cleaning crew instead of the tech.
        </Note>
      )}

      <div style={{ marginTop: 4 }}>
        <Toggle
          checked={!!draft.edge}
          onChange={set('edge')}
          label="Close to an edge"
          hint="Slower, and riskier on tempered glass"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, marginTop: 8 }}>
        <FormField label="Glass size">
          <TextInput value={draft.glass_size} onChange={set('glass_size')} placeholder={'48" x 72"'} />
        </FormField>
        <FormField label="Marked zone">
          <TextInput value={draft.zone_size} onChange={set('zone_size')} placeholder={'6" x 2"'} />
        </FormField>
      </div>

      <FormField
        label="Zone scale"
        error={show('zone_scale')}
        hint={show('zone_scale') ? null : 'Leave empty unless the marked area is bigger than usual. 2 = twice the work.'}
      >
        <NumInput value={draft.zone_scale} onChange={set('zone_scale')} step="0.1" placeholder="1" invalid={!!show('zone_scale')} />
      </FormField>

      <FormField
        label="Repeat of"
        error={show('duplicate_of')}
        hint={show('duplicate_of') ? null : 'Another photograph of a mark already in the register. It will not be counted twice.'}
      >
        <Select
          value={draft.duplicate_of}
          onChange={set('duplicate_of')}
          options={dupOptions}
          placeholder="Not a repeat — this is its own mark"
          invalid={!!show('duplicate_of')}
        />
      </FormField>

      {!draft.duplicate_of && (
        <FormField
          label="Cannot be restored"
          error={show('not_restorable_reason')}
          hint={show('not_restorable_reason') ? null : 'Leave empty if the tech will work it. A reason keeps it out of the bid and on the page.'}
        >
          <Select
            value={draft.not_restorable_reason}
            onChange={set('not_restorable_reason')}
            options={REASON_OPTIONS}
            placeholder="It will be worked"
            invalid={!!show('not_restorable_reason')}
          />
        </FormField>
      )}

      <FormField label="Note">
        <TextInput value={draft.price_note} onChange={set('price_note')} placeholder="What drives the price here" />
      </FormField>
    </Sheet>
  )
}
