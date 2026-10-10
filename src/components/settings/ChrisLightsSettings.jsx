// Settings → Christmas Lighting — the numbers Chris prices with.
//
// The Chris page told reps to "Set a price per foot in Settings → Christmas
// Lighting" from the day it shipped, and there was no such screen: the only
// way to change Antonino's starter $6.50/ft was a database edit. This is that
// screen. It reads and validates through lib/chrisLights so the page and the
// settings can never disagree about a saved value.
//
// The hourly labour rate is NOT kept here. It lives in labor_rates with every
// other labour price the company has, and Chris reads the default from there;
// this screen only shows it and says where to change it.

import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { LIGHTS_CONFIG_KEY, LIGHTS_CONFIG_FIELDS, readLightsConfig, lightsConfigProblem } from '../../lib/chrisLights'
import { ACCESS_DEFAULTS } from '../../lib/chrisAccess'

export default function ChrisLightsSettings({ theme, companyId, settings, saveSetting }) {
  const stored = useMemo(
    () => readLightsConfig(settings?.find((s) => s.key === LIGHTS_CONFIG_KEY)?.value),
    [settings],
  )
  // Only what the user has typed; everything else shows the saved value.
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [laborRate, setLaborRate] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let live = true
    supabase.from('labor_rates').select('name, rate_per_hour, is_default')
      .eq('company_id', companyId).eq('active', true)
      .order('is_default', { ascending: false }).limit(1)
      .then(({ data }) => { if (live) setLaborRate(data?.[0] || false) })
    return () => { live = false }
  }, [companyId])

  // Blank fields are left out so the starter in chrisAccess applies.
  const form = {}
  LIGHTS_CONFIG_FIELDS.forEach((x) => { form[x.key] = edits[x.key] ?? (stored[x.key] != null ? String(stored[x.key]) : '') })
  const next = readLightsConfig(form)
  const problem = lightsConfigProblem(next)
  const dirty = JSON.stringify(next) !== JSON.stringify(stored)

  const save = async () => {
    if (problem) { toast.error(problem); return }
    setSaving(true)
    const ok = await saveSetting(LIGHTS_CONFIG_KEY, next)
    setSaving(false)
    if (ok) { setEdits({}); toast.success('Christmas lighting prices saved') }
  }

  const input = {
    width: '100%', padding: '9px 10px', fontSize: 14, borderRadius: 8, boxSizing: 'border-box',
    border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text,
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, margin: '0 0 4px' }}>Christmas Lighting</h3>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 20px' }}>
        What Chris charges. Change a number here and the next quote uses it — quotes already sent keep their prices.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
        {LIGHTS_CONFIG_FIELDS.map((f) => {
          const starter = ACCESS_DEFAULTS[f.key]
          return (
            <label key={f.key} style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 4 }}>
                {f.label} <span style={{ fontWeight: 400, color: theme.textMuted }}>({f.unit})</span>
                {f.required && <span style={{ color: theme.error || '#ef4444' }}> *</span>}
              </span>
              <input
                type="number" inputMode="decimal" min="0" step="any" style={input}
                value={form[f.key] ?? ''}
                placeholder={starter != null ? `${starter} (starter)` : f.required ? 'Required' : 'None'}
                onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
              />
              {f.hint && <span style={{ display: 'block', fontSize: 11.5, color: theme.textMuted, marginTop: 4 }}>{f.hint}</span>}
            </label>
          )
        })}
      </div>

      <div style={{ marginTop: 20, padding: '12px 14px', borderRadius: 8, backgroundColor: theme.bg, fontSize: 13, color: theme.textSecondary }}>
        <strong style={{ color: theme.text }}>Hourly rate for extra time: </strong>
        {laborRate === null ? 'Loading…'
          : laborRate ? `$${Number(laborRate.rate_per_hour).toFixed(2)}/hr (${laborRate.name || 'default labor rate'})`
            : 'None set — tall or steep houses get no extra-time line until you add one.'}
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
          This comes from your default labor rate in Products &amp; Services → Labor Rates, shared with every other quote.
        </div>
      </div>

      {problem && dirty && <p style={{ fontSize: 13, color: theme.error || '#ef4444', margin: '14px 0 0' }}>{problem}</p>}

      <button type="button" onClick={save} disabled={saving || !dirty || !!problem}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 18px', minHeight: 44,
          borderRadius: 8, border: 'none', backgroundColor: theme.accent, color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: saving || !dirty || problem ? 'not-allowed' : 'pointer', opacity: saving || !dirty || problem ? 0.5 : 1,
        }}>
        <Save size={16} /> {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
