import { useState, useEffect } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTheme } from './Layout'
import { defaultMissedShiftEnd, missedShiftEndProblem, closeMissedShiftPatch } from '../lib/openShifts'

// "You never clocked out yesterday — when did you finish?"
//
// The one-open-punch rule stops a tech clocking in while yesterday's shift
// is still open. Until now the message said "close it out first" and pointed
// at a list it was not on, while the banner said "no action needed" —
// Christopher spent five minutes looking for a button that did not exist
// and stayed clocked into the wrong day (02e30d0c); London the day before
// (b25b596a). Only they know when they stopped, so this asks, closes the
// shift at that time flagged for payroll to confirm, and hands back to the
// clock-in that was interrupted. Field Scout and the Dashboard both use it.
export default function MissedShiftSheet({ entry, employee, companyId, onDone, onDismiss, continueLabel = 'Close it and clock in' }) {
  const { theme } = useTheme()
  const [endLocal, setEndLocal] = useState(() => defaultMissedShiftEnd(entry))
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    if (!entry?.job_id) return undefined
    supabase.from('jobs').select('id, job_id, job_title, customer_name').eq('id', entry.job_id).maybeSingle()
      .then(({ data }) => { if (live) setJob(data || null) }, () => {})
    return () => { live = false }
  }, [entry?.job_id])

  if (!entry) return null
  const startedAt = new Date(entry.clock_in)
  const when = startedAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  // Only the job this entry is on — never a label left over from another entry.
  const jobForEntry = job && job.id === entry.job_id ? job : null
  const jobLabel = jobForEntry ? [jobForEntry.job_title, jobForEntry.customer_name].filter(Boolean).join(' — ') : (entry.job_id ? `job #${entry.job_id}` : null)

  const submit = async () => {
    if (saving) return
    const endedAt = new Date(endLocal)
    const problem = missedShiftEndProblem(entry, endedAt)
    if (problem) { setError(problem); return }
    setSaving(true); setError(null)
    const patch = closeMissedShiftPatch(entry, endedAt, { byEmployeeId: employee?.id ?? null, byName: employee?.name || employee?.email || '' })
    // `.is('clock_out', null)` — if payroll closed it while this sheet was
    // open, do not overwrite their number with a memory.
    const { data, error: err } = await supabase.from('time_clock').update(patch)
      .eq('id', entry.id).eq('company_id', companyId).is('clock_out', null).select('id')
    setSaving(false)
    if (err) { setError(`Could not close it: ${err.message}`); return }
    if (!data || data.length === 0) { setError('That shift was already closed by your manager — carry on and clock in.'); onDone?.({ alreadyClosed: true }); return }
    onDone?.({ closedAt: endedAt })
  }

  const btn = (primary) => ({
    flex: 1, minHeight: '44px', padding: '10px 14px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'default' : 'pointer',
    border: primary ? 'none' : `1px solid ${theme.border}`,
    backgroundColor: primary ? theme.accent : theme.bgCard, color: primary ? '#fff' : theme.text, opacity: saving ? 0.7 : 1,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={() => !saving && onDismiss?.()} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
      <div role="dialog" aria-label="Finish your unfinished shift" style={{
        position: 'relative', width: '100%', maxWidth: '520px', backgroundColor: theme.bg, borderRadius: '16px 16px 0 0',
        padding: '18px 16px calc(16px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <AlertTriangle size={18} style={{ color: '#f97316', flexShrink: 0 }} />
          <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Finish your shift from {startedAt.toLocaleDateString('en-US', { weekday: 'long' })} first</div>
        </div>
        <div style={{ fontSize: '14px', color: theme.textSecondary, lineHeight: 1.5, marginBottom: '14px' }}>
          You clocked in <strong style={{ color: theme.text }}>{when}</strong>{jobLabel ? <> on <strong style={{ color: theme.text }}>{jobLabel}</strong></> : null} and never clocked out. When did you finish that day? Payroll will see it as a correction and confirm the hours.
        </div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          <Clock size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />I finished at
        </label>
        <input
          type="datetime-local"
          value={endLocal}
          max={defaultMissedShiftEnd({ clock_in: new Date().toISOString() })}
          onChange={(e) => { setEndLocal(e.target.value); setError(null) }}
          style={{ width: '100%', minHeight: '44px', padding: '10px 12px', fontSize: '16px', borderRadius: '10px', border: `1px solid ${error ? '#ef4444' : theme.border}`, backgroundColor: theme.bgCard, color: theme.text, boxSizing: 'border-box' }}
        />
        {error && <div style={{ marginTop: '8px', fontSize: '13px', color: '#ef4444' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="button" onClick={() => !saving && onDismiss?.()} style={btn(false)}>Not now</button>
          <button type="button" onClick={submit} disabled={saving} style={btn(true)}>{saving ? 'Saving…' : continueLabel}</button>
        </div>
      </div>
    </div>
  )
}
