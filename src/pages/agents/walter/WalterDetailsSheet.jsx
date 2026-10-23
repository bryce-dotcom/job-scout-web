// The building, the glass, and what the customer's alternative costs.
//
// Only the assessment's own facts. The company's rates are not here on
// purpose: pricing is a per-company setting with documented seeds in the
// engine, and putting rate boxes on every assessment is how a company ends up
// with forty different day rates and no idea which one is right. The `pricing`
// column is never sent by this sheet, so whatever is on the row survives.

import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { ACCESS_PROFILES, CONDITION_PROFILES } from '../../../lib/windowEstimator'
import { Sheet, Btn, FormField, TextInput, TextArea, NumInput, Select, Note } from './WalterUI'

const VERTICALS = [
  { value: 'both', label: 'Cleaning and restoration' },
  { value: 'cleaning', label: 'Cleaning only' },
  { value: 'restoration', label: 'Restoration only' },
]

const STATUSES = ['draft', 'final', 'sent', 'won', 'lost']
  .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))

const ACCESS_OPTIONS = Object.entries(ACCESS_PROFILES).map(([k, p]) => ({ value: k, label: p.label }))
const CONDITION_OPTIONS = Object.entries(CONDITION_PROFILES).map(([k, p]) => ({ value: k, label: p.label }))

/** Coatings are a text[] in the database and a comma-separated line on screen. */
const coatingsToText = (arr) => (Array.isArray(arr) ? arr.join(', ') : '')
const textToCoatings = (s) => {
  const parts = String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return parts.length ? parts : null
}

export default function WalterDetailsSheet({
  onClose, onSaved, companyId, assessment, isMobile,
}) {
  const [d, setD] = useState(() => ({ ...(assessment || {}) }))
  const [coatings, setCoatings] = useState(() => coatingsToText(assessment?.coatings))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (k) => (v) => setD((p) => ({ ...p, [k]: v }))

  const lo = Number(d.replacement_cost_low) || 0
  const hi = Number(d.replacement_cost_high) || 0
  const rangeBackwards = lo > 0 && hi > 0 && lo > hi

  const save = async () => {
    if (rangeBackwards) { setError('The low end of the replacement range is above the high end.'); return }
    setSaving(true)
    const payload = {
      site_name: d.site_name || null,
      address: d.address || null,
      city: d.city || null,
      state: d.state || null,
      zip: d.zip || null,
      assessment_date: d.assessment_date || null,
      vertical: d.vertical || 'both',
      status: d.status || 'draft',
      access: d.access || 'ground',
      condition: d.condition || 'maintenance',
      glass_make: d.glass_make || null,
      glass_product: d.glass_product || null,
      coatings: textToCoatings(coatings),
      panes: d.panes ?? null,
      faces: d.faces ?? 2,
      tracks: d.tracks ?? 0,
      screens: d.screens ?? 0,
      replacement_cost_low: d.replacement_cost_low ?? null,
      replacement_cost_high: d.replacement_cost_high ?? null,
      notes: d.notes || null,
      updated_at: new Date().toISOString(),
    }
    const res = await supabase.from('glass_assessments').update(payload)
      .eq('company_id', companyId).eq('id', assessment.id)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    onSaved?.()
    onClose?.()
  }

  const wantsCleaning = (d.vertical || 'both') !== 'restoration'
  const wantsRestoration = (d.vertical || 'both') !== 'cleaning'

  return (
    <Sheet
      open
      onClose={onClose}
      isMobile={isMobile}
      title="Assessment details"
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save details'}</Btn>
        </>
      }
    >
      {error && <Note tone="danger">Could not save: {error}</Note>}

      <FormField label="Site name">
        <TextInput value={d.site_name} onChange={set('site_name')} placeholder="Eden Ridge — glass review" />
      </FormField>

      <FormField label="Address">
        <TextInput value={d.address} onChange={set('address')} />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
        <FormField label="City"><TextInput value={d.city} onChange={set('city')} /></FormField>
        <FormField label="State"><TextInput value={d.state} onChange={set('state')} /></FormField>
        <FormField label="Zip"><TextInput value={d.zip} onChange={set('zip')} /></FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Date">
          <TextInput type="date" value={d.assessment_date} onChange={set('assessment_date')} />
        </FormField>
        <FormField label="Status">
          <Select value={d.status || 'draft'} onChange={set('status')} options={STATUSES} />
        </FormField>
      </div>

      <FormField label="Scope" hint="Which half of the engine runs">
        <Select value={d.vertical || 'both'} onChange={set('vertical')} options={VERTICALS} />
      </FormField>

      <FormField label="Access" hint="Applies to both halves — reaching the glass costs the same either way">
        <Select value={d.access || 'ground'} onChange={set('access')} options={ACCESS_OPTIONS} />
      </FormField>

      {wantsCleaning && (
        <>
          <FormField label="Condition" hint="A first clean after construction is scraped, not wiped">
            <Select value={d.condition || 'maintenance'} onChange={set('condition')} options={CONDITION_OPTIONS} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            <FormField label="Panes"><NumInput value={d.panes} onChange={set('panes')} /></FormField>
            <FormField label="Faces" hint="2 = inside and out">
              <NumInput value={d.faces ?? 2} onChange={set('faces')} />
            </FormField>
            <FormField label="Tracks"><NumInput value={d.tracks ?? 0} onChange={set('tracks')} /></FormField>
            <FormField label="Screens"><NumInput value={d.screens ?? 0} onChange={set('screens')} /></FormField>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <FormField label="Glass make"><TextInput value={d.glass_make} onChange={set('glass_make')} placeholder="Sierra Pacific" /></FormField>
        <FormField label="Glass product"><TextInput value={d.glass_product} onChange={set('glass_product')} placeholder="Cardinal LoE³-366" /></FormField>
      </div>

      <FormField label="Coatings" hint="Comma separated. A coating on the room side cannot be abraded.">
        <TextInput value={coatings} onChange={setCoatings} placeholder="i89, Neat" />
      </FormField>

      {wantsRestoration && (
        <>
          <FormField
            label="Replacing this glass would cost"
            error={rangeBackwards ? 'The low end is above the high end.' : null}
            hint={rangeBackwards ? null : 'What the customer is really choosing between. Without it the bid falls back to cost plus margin.'}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
              <NumInput value={d.replacement_cost_low} onChange={set('replacement_cost_low')} placeholder="Low" invalid={rangeBackwards} />
              <NumInput value={d.replacement_cost_high} onChange={set('replacement_cost_high')} placeholder="High" invalid={rangeBackwards} />
            </div>
          </FormField>
          {!lo && !hi && (
            <Note tone="warning">
              With no replacement range the engine prices on cost plus margin, which for glass
              restoration bids well under what the trade clears.
            </Note>
          )}
        </>
      )}

      <FormField label="Notes">
        <TextArea value={d.notes} onChange={set('notes')} rows={4} />
      </FormField>
    </Sheet>
  )
}
