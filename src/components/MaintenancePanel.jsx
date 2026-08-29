// What is due on this machine, and what someone has reported about it.
//
// This is the part the fleet layer was missing. Everything else in it is
// written by an owner after the fact — what a machine cost, what it is worth.
// Nothing let the person actually driving it say "this needs attention", and
// nothing said what was due before it broke.
//
// Two halves, deliberately on one panel:
//
//   Due        recurring services, each with its own clocks. A machine has
//              several at once and any of them can be the one that is overdue.
//   Reported   what somebody flagged. Anyone can file one; it does not need a
//              cost, a vendor or an invoice, because at the moment you notice
//              a problem you have none of those.
//
// Kept together because they answer one question — "does this machine need
// anything" — and splitting them across two screens means checking two places
// and eventually checking neither.

import { useEffect, useMemo, useState } from 'react'
import {
  Wrench, Plus, X, AlertTriangle, Sparkles, Clock, ShieldAlert,
  CheckCircle2, Loader, CalendarClock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useIsMobile } from '../hooks/useIsMobile'

const SEVERITIES = [
  // 'safety' asserts the machine should not be operated, which is a different
  // claim from "fix this soon" and is why it leads and is coloured hardest.
  { value: 'safety', label: "Unsafe to run", colour: '#b91c1c', icon: ShieldAlert },
  { value: 'urgent', label: 'Needs attention now', colour: '#c2410c', icon: AlertTriangle },
  { value: 'normal', label: 'Should be looked at', colour: '#8a6d08', icon: Wrench },
  { value: 'minor', label: 'Minor / when convenient', colour: '#4d5a52', icon: Clock },
]

const STATUS_TONE = {
  overdue: { fg: '#b91c1c', bg: 'rgba(239,68,68,.10)', label: 'Overdue' },
  due_soon: { fg: '#8a6d08', bg: 'rgba(234,179,8,.12)', label: 'Due soon' },
  never_done: { fg: '#4d5a52', bg: 'rgba(90,99,73,.10)', label: 'Never done' },
  ok: { fg: '#15803d', bg: 'rgba(34,197,94,.08)', label: 'OK' },
}

const sevMeta = v => SEVERITIES.find(s => s.value === v) || SEVERITIES[2]

function intervalLabel(s) {
  const parts = []
  if (s.interval_miles) parts.push(`${Number(s.interval_miles).toLocaleString()} mi`)
  if (s.interval_hours) parts.push(`${Number(s.interval_hours).toLocaleString()} hrs`)
  if (s.interval_days) parts.push(`${s.interval_days} days`)
  // "or" rather than "and": whichever elapses first is what makes it due, and
  // "and" would read as needing both.
  return parts.join(' or ')
}

export default function MaintenancePanel({ asset, theme, currentMeter = null, onChanged }) {
  const isMobile = useIsMobile()
  const currentEmployee = useStore(s => s.currentEmployee)

  const [pm, setPm] = useState(null)
  const [requests, setRequests] = useState(null)
  const [reporting, setReporting] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ severity: 'normal', description: '', meter: '' })

  const companyId = asset?.company_id ?? null
  const assetId = asset?.id ?? null

  const load = async () => {
    if (!companyId || !assetId) return
    const [p, r] = await Promise.all([
      supabase.from('fleet_pm_status').select('*').eq('company_id', companyId).eq('fleet_id', assetId),
      supabase.from('fleet_service_requests').select('*, reporter:employees!fleet_service_requests_reported_by_fkey(name)')
        .eq('company_id', companyId).eq('fleet_id', assetId).order('reported_at', { ascending: false }),
    ])
    setPm(p.data || [])
    setRequests(r.data || [])
  }

  useEffect(() => {
    let cancelled = false
    if (!companyId || !assetId) return
    ;(async () => {
      const [p, r] = await Promise.all([
        supabase.from('fleet_pm_status').select('*').eq('company_id', companyId).eq('fleet_id', assetId),
        supabase.from('fleet_service_requests').select('*, reporter:employees!fleet_service_requests_reported_by_fkey(name)')
          .eq('company_id', companyId).eq('fleet_id', assetId).order('reported_at', { ascending: false }),
      ])
      if (cancelled) return
      setPm(p.data || [])
      setRequests(r.data || [])
    })()
    return () => { cancelled = true }
  }, [companyId, assetId])

  const openRequests = useMemo(
    () => (requests || []).filter(r => r.status !== 'resolved' && r.status !== 'declined'),
    [requests],
  )
  const dueCount = useMemo(
    () => (pm || []).filter(s => s.status === 'overdue' || s.status === 'due_soon').length,
    [pm],
  )

  const suggest = async () => {
    setSuggesting(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.functions.invoke('fleet-pm-suggest', {
        body: {
          make: asset.make, model: asset.model, model_year: asset.model_year,
          asset_class: asset.asset_class, meter_basis: asset.meter_basis,
        },
      })
      if (err) throw err
      if (!data?.ok) { setError(data?.error || 'Could not build a schedule.'); return }
      // Proposed, never saved outright. A model inventing service intervals and
      // committing them to the schedule a business runs on is not a feature.
      setProposal(data)
    } catch (e) {
      setError(e.message || 'Could not build a schedule.')
    } finally {
      setSuggesting(false)
    }
  }

  const acceptProposal = async () => {
    setSaving(true)
    const rows = proposal.schedules.map(s => ({
      company_id: companyId, fleet_id: assetId,
      name: s.name, category: s.category,
      interval_miles: s.interval_miles, interval_hours: s.interval_hours, interval_days: s.interval_days,
      lead_days: s.lead_days, source: 'ai', notes: s.note,
    }))
    const { error: err } = await supabase.from('fleet_pm_schedules').insert(rows)
    setSaving(false)
    if (err) { setError(err.message); return }
    setProposal(null)
    await load()
    onChanged?.()
  }

  const fileRequest = async () => {
    if (!form.description.trim()) { setError('Say what is wrong.'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('fleet_service_requests').insert({
      company_id: companyId,
      fleet_id: assetId,
      reported_by: currentEmployee?.id ?? null,
      severity: form.severity,
      description: form.description.trim(),
      meter_reading: form.meter === '' ? null : Number(form.meter),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm({ severity: 'normal', description: '', meter: '' })
    setReporting(false)
    await load()
    onChanged?.()
  }

  const resolveRequest = async (req, status) => {
    await supabase.from('fleet_service_requests').update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: currentEmployee?.id ?? null,
    }).eq('id', req.id)
    await load()
    onChanged?.()
  }

  const markDone = async (schedule) => {
    // Both clocks reset together, from the meter as it reads NOW. Advancing
    // the stored reading by one interval instead would be wrong the moment a
    // service happens early or late — which is most of the time — and the
    // error compounds at every service after it.
    //
    // An unknown meter is left null rather than guessed. The view then falls
    // back to the date clock, which is blunter but honest; a fabricated
    // reading would put the next service somewhere nobody can account for.
    await supabase.from('fleet_pm_schedules').update({
      last_done_date: new Date().toISOString().slice(0, 10),
      last_done_meter: currentMeter == null ? null : Number(currentMeter),
      updated_at: new Date().toISOString(),
    }).eq('id', schedule.schedule_id)
    await load()
    onChanged?.()
  }

  const btn = (bg, fg) => ({
    minHeight: 44, padding: '0 14px', borderRadius: 8, border: bg === 'transparent' ? `1px solid ${theme.border}` : 'none',
    background: bg, color: fg, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
  })
  const field = {
    width: '100%', minHeight: 44, padding: '10px', boxSizing: 'border-box',
    background: theme.bg, border: `1px solid ${theme.border}`,
    borderRadius: 8, color: theme.text, fontSize: 16,   // 16px or iOS zooms
  }

  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 16 : 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text }}>Maintenance</h3>
        <button onClick={() => { setForm({ severity: 'normal', description: '', meter: currentMeter == null ? '' : String(Math.round(currentMeter)) }); setReporting(true) }} style={btn(theme.accent, '#fff')}>
          <Plus size={16} /> Report a problem
        </button>
      </div>

      {(dueCount > 0 || openRequests.length > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 4px' }}>
          {dueCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 20, background: 'rgba(234,179,8,.14)', color: '#8a6d08' }}>
              {dueCount} service{dueCount === 1 ? '' : 's'} due
            </span>
          )}
          {openRequests.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 20, background: 'rgba(194,65,12,.12)', color: '#c2410c' }}>
              {openRequests.length} open request{openRequests.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {/* ---- Reported problems ---- */}
      {openRequests.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {openRequests.map(r => {
            const meta = sevMeta(r.severity)
            const Icon = meta.icon
            return (
              <div key={r.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12,
                background: theme.bg, border: `1px solid ${theme.border}`,
                borderLeft: `3px solid ${meta.colour}`, borderRadius: 8,
              }}>
                <Icon size={16} style={{ color: meta.colour, marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{r.description}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    {meta.label}
                    {r.reporter?.name ? ` · ${r.reporter.name}` : ''}
                    {` · ${String(r.reported_at).slice(0, 10)}`}
                    {r.meter_reading ? ` · at ${Number(r.meter_reading).toLocaleString()}` : ''}
                  </div>
                </div>
                <button onClick={() => resolveRequest(r, 'resolved')} title="Mark resolved"
                  style={{ width: 44, height: 44, border: `1px solid ${theme.border}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ---- PM schedules ---- */}
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Service schedule
        </span>
        {(pm?.length || 0) === 0 && (
          <button onClick={suggest} disabled={suggesting} style={btn('transparent', theme.accent)}>
            {suggesting ? <Loader size={15} /> : <Sparkles size={15} />}
            {suggesting ? 'Building…' : 'Build one with Freddy'}
          </button>
        )}
      </div>

      {pm === null ? (
        <div style={{ fontSize: 13, color: theme.textMuted, padding: 12 }}>Loading…</div>
      ) : pm.length === 0 && !proposal ? (
        <div style={{
          marginTop: 8, textAlign: 'center', padding: 18, fontSize: 13, color: theme.textMuted,
          background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 8,
        }}>
          No schedule yet. Freddy can propose one from the make and model — you edit it before it counts.
        </div>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(pm || []).map(s => {
            const tone = STATUS_TONE[s.status] || STATUS_TONE.ok
            const due = []
            if (s.days_remaining != null) due.push(s.days_remaining < 0 ? `${Math.abs(s.days_remaining)}d overdue` : `${s.days_remaining}d`)
            if (s.meter_remaining != null) due.push(s.meter_remaining < 0 ? `${Math.abs(Math.round(s.meter_remaining)).toLocaleString()} over` : `${Math.round(s.meter_remaining).toLocaleString()} to go`)
            return (
              <div key={s.schedule_id} style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: 12,
                background: tone.bg, border: `1px solid ${theme.border}`,
                borderLeft: `3px solid ${tone.fg}`, borderRadius: 8,
              }}>
                <CalendarClock size={15} style={{ color: tone.fg, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    every {intervalLabel(s)}
                    {due.length ? ` · ${due.join(' · ')}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: tone.fg, whiteSpace: 'nowrap' }}>{tone.label}</span>
                <button onClick={() => markDone(s)} title="Mark done today"
                  style={{ width: 44, height: 44, border: `1px solid ${theme.border}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: theme.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {error && <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c' }}>{error}</div>}

      {/* ---- Freddy's proposal, before it counts ---- */}
      {proposal && (
        <>
          <div onClick={() => setProposal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', zIndex: 91, background: theme.bgCard, overflowY: 'auto', padding: 20,
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0', maxHeight: '90vh', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }
              : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, maxWidth: '92vw', borderRadius: 12, maxHeight: '86vh' }),
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>Freddy suggests</h3>
              <button onClick={() => setProposal(null)} style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: theme.textMuted }}><X size={20} /></button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: theme.textMuted }}>
              A starting point, not a rule. Save it and edit anything that does not match how you run this machine.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proposal.schedules.map((s, i) => (
                <div key={i} style={{ padding: 10, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    every {intervalLabel(s)}
                    {s.category === 'safety' ? ' · required' : ''}
                  </div>
                </div>
              ))}
            </div>
            {proposal.basis && (
              <p style={{ marginTop: 12, fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>{proposal.basis}</p>
            )}
            <button onClick={acceptProposal} disabled={saving}
              style={{ width: '100%', minHeight: 48, marginTop: 14, borderRadius: 10, border: 'none', background: theme.accent, color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : `Save these ${proposal.schedules.length}`}
            </button>
          </div>
        </>
      )}

      {/* ---- Report a problem ---- */}
      {reporting && (
        <>
          <div onClick={() => setReporting(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', zIndex: 91, background: theme.bgCard, overflowY: 'auto', padding: 20,
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0', maxHeight: '90vh', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }
              : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 520, maxWidth: '92vw', borderRadius: 12, maxHeight: '86vh' }),
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>What is wrong?</h3>
              <button onClick={() => setReporting(false)} style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: theme.textMuted }}><X size={20} /></button>
            </div>

            {/* Severity as full-width rows, worst first — this gets tapped by
                someone standing next to a machine that is doing something
                wrong, not chosen from a dropdown at a desk. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {SEVERITIES.map(s => {
                const Icon = s.icon
                const on = form.severity === s.value
                return (
                  <button key={s.value} onClick={() => setForm(f => ({ ...f, severity: s.value }))}
                    style={{
                      minHeight: 48, padding: '0 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: `1.5px solid ${on ? s.colour : theme.border}`,
                      background: on ? `${s.colour}14` : 'transparent',
                      color: on ? s.colour : theme.textSecondary,
                      fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                    <Icon size={16} /> {s.label}
                  </button>
                )
              })}
            </div>

            <label style={{ fontSize: 11, color: theme.textMuted, display: 'block', marginBottom: 4 }}>Describe it</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Pulling right under braking, started this morning"
              rows={3}
              style={{ ...field, minHeight: 88, resize: 'vertical' }}
            />

            <label style={{ fontSize: 11, color: theme.textMuted, display: 'block', margin: '12px 0 4px' }}>
              {asset?.meter_basis === 'hours' ? 'Hours now (optional)' : 'Odometer now (optional)'}
            </label>
            <input type="number" inputMode="numeric" value={form.meter}
              onChange={e => setForm(f => ({ ...f, meter: e.target.value }))}
              placeholder="off the dash" style={field} />

            <button onClick={fileRequest} disabled={saving}
              style={{ width: '100%', minHeight: 48, marginTop: 16, borderRadius: 10, border: 'none', background: theme.accent, color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Sending…' : 'Send it'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
