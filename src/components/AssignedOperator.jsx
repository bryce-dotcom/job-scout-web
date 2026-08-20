// Who normally operates this machine, and whether that is actually allowed.
//
// The fleet side has been reading fleet.assigned_to since before the column
// existed — FreddyDrivers builds its whole scorecard on it — so this is both a
// new feature and the other half of a link that was only ever half built.
//
// The check is the point, not the dropdown. An assignment can be wrong in ways
// that only matter when something goes badly: a lapsed licence, a class that
// does not cover the vehicle, a medical card nobody was tracking. None of
// those announce themselves, and all of them are the sort of thing an insurer
// asks about afterwards.
//
// So the list shows WHY someone is unsuitable rather than hiding them. Hiding
// an ineligible driver produces a confusing empty dropdown; showing them with
// the reason turns the same moment into an answer.

import { useEffect, useMemo, useState } from 'react'
import { UserCheck, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { canOperate, credentialStatus, OPERATOR_ROLES } from '../lib/driverCredentials'

export default function AssignedOperator({ asset, theme, onChanged }) {
  const [people, setPeople] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Read out plainly rather than optional-chaining inside dependency
  // arrays, which defeats the compiler memoization analysis.
  const companyId = asset?.company_id ?? null
  const assignedId = asset?.assigned_to ?? null

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('employees')
        .select('id,name,operator_role,license_class,license_expires,medical_card_expires,active')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')
      if (!cancelled) setPeople(data || [])
    })()
    return () => { cancelled = true }
  }, [companyId])

  const assigned = useMemo(
    () => (people || []).find(p => p.id === assignedId) || null,
    [people, assignedId],
  )

  const check = useMemo(() => canOperate(assigned, asset), [assigned, asset])

  // Everyone marked as a driver or operator, each carrying its own verdict for
  // THIS machine so the reason travels with the name.
  const candidates = useMemo(() => (people || [])
    .filter(p => p.operator_role)
    .map(p => ({ ...p, verdict: canOperate(p, asset) }))
    .sort((a, b) => (a.verdict.ok === b.verdict.ok ? a.name.localeCompare(b.name) : a.verdict.ok ? -1 : 1)),
  [people, asset])

  const assign = async (employeeId) => {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('fleet')
      .update({ assigned_to: employeeId || null })
      .eq('id', asset.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onChanged?.()
  }

  const tone = {
    error: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.35)', fg: '#b91c1c' },
    warn: { bg: 'rgba(234,179,8,.10)', border: 'rgba(234,179,8,.4)', fg: '#8a6d08' },
    ok: { bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.3)', fg: '#15803d' },
    info: { bg: theme.bg, border: theme.border, fg: theme.textMuted },
  }[check.severity] || { bg: theme.bg, border: theme.border, fg: theme.textMuted }

  return (
    <div style={{
      background: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: 12, padding: 20, marginBottom: 20,
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: theme.text }}>
        Assigned operator
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: theme.textMuted }}>
        Who normally runs this machine. Drives the driver scorecard, and flags an assignment
        that would not stand up to a roadside check.
      </p>

      <select
        value={assignedId || ''}
        onChange={e => assign(e.target.value ? Number(e.target.value) : null)}
        disabled={saving || people === null}
        style={{
          width: '100%', minHeight: 44, padding: '0 10px', boxSizing: 'border-box',
          background: theme.bg, border: `1px solid ${theme.border}`,
          borderRadius: 8, color: theme.text, fontSize: 16,   // 16px or iOS zooms
        }}
      >
        <option value="">Nobody assigned</option>
        {candidates.map(p => (
          // The reason rides along in the label. A dropdown that silently
          // omits ineligible people just looks broken to whoever is looking
          // for them.
          <option key={p.id} value={p.id}>
            {p.name}
            {p.verdict.ok ? '' : ` — ${p.verdict.message}`}
          </option>
        ))}
      </select>

      {people !== null && candidates.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: theme.textMuted }}>
          Nobody is marked as a driver or operator yet. Set that on an employee and they will
          appear here.
        </div>
      )}

      {(assigned || check.severity !== 'info') && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 8,
          background: tone.bg, border: `1px solid ${tone.border}`,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          {check.ok
            ? <Check size={14} style={{ color: tone.fg, marginTop: 2, flexShrink: 0 }} />
            : <AlertTriangle size={14} style={{ color: tone.fg, marginTop: 2, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            {assigned && (
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={13} style={{ color: theme.textMuted }} />
                {assigned.name}
                <span style={{ fontSize: 11, fontWeight: 500, color: theme.textMuted }}>
                  {OPERATOR_ROLES.find(r => r.value === assigned.operator_role)?.label}
                  {assigned.license_class ? ` · ${assigned.license_class}` : ''}
                </span>
              </div>
            )}
            <div style={{ fontSize: 12, color: tone.fg, marginTop: assigned ? 3 : 0, lineHeight: 1.4 }}>
              {check.message}
            </div>
            {assigned && credentialStatus(assigned).status === 'unknown' && (
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
                Add an expiry date on their employee record — an unrecorded one is the usual way
                a lapsed licence goes unnoticed.
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c' }}>{error}</div>
      )}
    </div>
  )
}
