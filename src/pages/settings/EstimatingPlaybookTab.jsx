// Settings → Estimating Playbook.
//
// Phase 4 of the Arnie & Jenny plan: "Cole's rules become the template other
// companies fill in." The assistant builds a lighting estimate from a spoken
// takeoff by these rules (supabase/functions/_shared/lightingPlaybook.ts).
// This page shows them in plain words, lets an admin start from the Energy
// Scout template and adjust it, and will not save a template the engine
// cannot use — templateProblems is the same check the server makes, so a
// half-filled playbook never reaches an estimate.

import { useMemo, useState } from 'react'
import {
  ENERGY_SCOUT_TEMPLATE, templateProblems, playbookFor,
} from '../../../supabase/functions/_shared/lightingPlaybook.ts'

const KIND_LABEL = {
  cobra: 'Cobra head / shoebox', flood: 'Flood', wall_pack: 'Wall pack', mini_wall_pack: 'Mini wall pack (over a door)',
  dome: 'Dome', high_bay: 'High bay', t5_high_bay: 'T5 high bay', t8_4ft: '4 ft T8', t8_8ft: '8 ft T8',
}
const REBATE_LABEL = { per_watt_reduced: 'per watt reduced', highbay_tier: 'per fixture, by watts reduced', none: 'from the utility tool only' }

function ledText(led) {
  if (typeof led === 'number') return `${led}W`
  if (led?.per_lamp) return `${led.per_lamp}W per lamp`
  if (Array.isArray(led?.by_existing)) return led.by_existing.map(([upTo, w]) => (upTo == null ? `else ${w}W` : `up to ${upTo}W → ${w}W`)).join(', ')
  return '?'
}
function productText(p) {
  if (!p) return '?'
  if (p.one_lamp) return `${p.one_lamp} (1 lamp) · ${p.lamps}`
  return p.lift ? `${p.no_lift} · on a lift: ${p.lift}` : p.no_lift
}

/** The value as stored → the template it means (a built-in key → its template). */
function templateOf(value) {
  let v = value
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { /* a bare key */ } }
  if (typeof v === 'string') return v === ENERGY_SCOUT_TEMPLATE.key ? { builtIn: true, t: ENERGY_SCOUT_TEMPLATE } : null
  if (v && typeof v === 'object' && v.fixtures) return { builtIn: false, t: v }
  return null
}

export default function EstimatingPlaybookTab({ theme, settings, saveSetting, companyName }) {
  const stored = settings.find((s) => s.key === 'estimating_playbook')?.value
  const current = useMemo(() => templateOf(stored), [stored])
  const [draft, setDraft] = useState(null)       // JSON text while editing
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => {
    if (draft == null) return null
    try { return { t: JSON.parse(draft) } } catch (e) { return { error: `Not valid JSON: ${e.message}` } }
  }, [draft])
  const problems = parsed?.error ? [parsed.error] : parsed ? templateProblems(parsed.t) : []

  const startCopy = () => {
    const slug = String(companyName || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const base = current?.t || ENERGY_SCOUT_TEMPLATE
    setDraft(JSON.stringify({ ...base, key: current && !current.builtIn ? base.key : `${slug}_lighting`, name: current && !current.builtIn ? base.name : `${companyName || 'Our'} lighting` }, null, 2))
  }
  const save = async () => {
    if (!parsed?.t || problems.length) return
    setSaving(true)
    try { if (await saveSetting('estimating_playbook', parsed.t)) setDraft(null) } finally { setSaving(false) }
  }
  const useBuiltIn = async () => { setSaving(true); try { await saveSetting('estimating_playbook', ENERGY_SCOUT_TEMPLATE.key) } finally { setSaving(false) } }
  const turnOff = async () => { setSaving(true); try { await saveSetting('estimating_playbook', null) } finally { setSaving(false) } }

  const card = { background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }
  const btn = (primary) => ({ padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: primary ? 'none' : `1px solid ${theme.border}`, background: primary ? theme.accent : 'transparent', color: primary ? '#fff' : theme.text, minHeight: 40 })
  const t = current?.t

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.text, margin: '0 0 6px' }}>Estimating Playbook</h3>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 16px', lineHeight: 1.5, maxWidth: 720 }}>
        When a rep walks a site and counts fixtures out loud, your assistant builds the estimate by these rules —
        which product each fixture becomes, lift or no lift, the line notes, the GMs, the business unit. Change a
        rule here and the next estimate follows it.
      </p>

      {!t && draft == null && (
        <div style={card}>
          <div style={{ fontSize: 14, color: theme.text, marginBottom: 10 }}>No playbook yet — takeoffs are not built into estimates for this company.</div>
          <button type="button" style={btn(true)} onClick={startCopy}>Start from the Energy Scout template</button>
        </div>
      )}

      {t && draft == null && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: theme.textSecondary }}>
              <span><b style={{ color: theme.text }}>{t.name}</b>{current.builtIn ? ' (built in)' : ''}</span>
              <span>Business unit: <b style={{ color: theme.text }}>{t.business_unit}</b></span>
              <span>Products from: <b style={{ color: theme.text }}>{t.catalog_type}</b></span>
              <span>Mount GM: <b style={{ color: theme.text }}>${t.gm.mount_price}</b></span>
              <span>Lift GM: <b style={{ color: theme.text }}>{t.gm.lift_product}</b>, {t.gm.lift_hours_on} hr on a lift / {t.gm.lift_hours_off} off</span>
            </div>
          </div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.textMuted }}>
                  {['Existing', 'Becomes', 'Product', 'Mount GM', 'Rebate', 'Where'].map((h) => <th key={h} style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(t.fixtures).map(([kind, f]) => (
                  <tr key={kind} style={{ color: theme.text, verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>{KIND_LABEL[kind] || kind}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>{ledText(f.led)} {f.label}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary }}>{productText(f.product)}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary }}>{f.mount ? f.mount.default + (f.mount.arm ? ` · arm: ${f.mount.arm}` : '') : '—'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary }}>{REBATE_LABEL[f.rebate] || f.rebate}</td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary }}>{f.location}{f.never_lift ? ', never on a lift' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btn(true)} onClick={startCopy}>{current.builtIn ? 'Make a copy to change it' : 'Edit'}</button>
            {!current.builtIn && <button type="button" style={btn(false)} disabled={saving} onClick={useBuiltIn}>Go back to the Energy Scout template</button>}
            <button type="button" style={btn(false)} disabled={saving} onClick={turnOff}>Turn off</button>
          </div>
        </>
      )}

      {draft != null && (
        <div style={card}>
          <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 8 }}>
            The playbook as data. Product names must match Products &amp; Services exactly, in the section named in catalog_type.
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            style={{ width: '100%', minHeight: 420, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12, padding: 12, borderRadius: 8, border: `1px solid ${problems.length ? '#ef4444' : theme.border}`, background: theme.bg, color: theme.text, boxSizing: 'border-box' }}
          />
          {problems.length > 0 && (
            <ul style={{ color: '#ef4444', fontSize: 13, margin: '10px 0 0', paddingLeft: 18 }}>
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" style={{ ...btn(true), opacity: problems.length ? 0.5 : 1 }} disabled={saving || !!problems.length} onClick={save}>{saving ? 'Saving…' : 'Save playbook'}</button>
            <button type="button" style={btn(false)} onClick={() => setDraft(null)}>Cancel</button>
          </div>
          {!problems.length && playbookFor(draft) && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>Ready — the engine can build from this.</div>}
        </div>
      )}
    </div>
  )
}
