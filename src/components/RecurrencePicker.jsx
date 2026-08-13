import { useState, useMemo } from 'react'
import { Repeat, Calendar, Wrench, Check } from 'lucide-react'

// RecurrencePicker — a self-contained "make this job repeat" panel.
// Writes back { recurrence, recurrence_end_date, recurrence_landing } via onChange.
// The DB trigger spawn_next_recurring_job (migration 20260812120000) reads these
// three fields; this component never creates jobs itself.
//
// recurrence      -> one of the DB enum values below (or 'None')
// recurrence_end_date -> 'YYYY-MM-DD' or null  (null = repeat forever)
// recurrence_landing  -> 'schedule' (Calendar/Board) | 'services' (Services list)

const REC = '#8b5cf6'
const REC_BG = 'rgba(139,92,246,0.12)'
const REC_DK = '#6b21a8'

const DEFAULT_THEME = {
  bgCard: '#ffffff', bg: '#f7f5ef', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Friendly label -> DB enum value (the trigger's CASE understands these exactly).
const FREQS = [
  { v: 'None', label: 'Off' },
  { v: 'Weekly', label: 'Weekly' },
  { v: 'Bi-Weekly', label: 'Every 2 weeks' },
  { v: 'Monthly', label: 'Monthly' },
  { v: 'Quarterly', label: 'Quarterly' },
  { v: 'Bi-Annually', label: 'Every 6 months' },
  { v: 'Annually', label: 'Yearly' },
]

function addMonths(d, n) {
  const x = new Date(d.getTime())
  const day = x.getDate()
  x.setMonth(x.getMonth() + n)
  if (x.getDate() < day) x.setDate(0) // clamp e.g. Jan 31 -> Feb 28
  return x
}
function addInterval(d, freq) {
  const x = new Date(d.getTime())
  switch (freq) {
    case 'Daily': x.setDate(x.getDate() + 1); return x
    case 'Weekly': x.setDate(x.getDate() + 7); return x
    case 'Bi-Weekly': x.setDate(x.getDate() + 14); return x
    case 'Every 6 Weeks': x.setDate(x.getDate() + 42); return x
    case 'Monthly': return addMonths(d, 1)
    case 'Bi-Monthly': return addMonths(d, 2)
    case 'Quarterly': return addMonths(d, 3)
    case 'Bi-Annually': return addMonths(d, 6)
    case 'Annually': return addMonths(d, 12)
    default: x.setDate(x.getDate() + 7); return x
  }
}
function toISODate(d) {
  // local YYYY-MM-DD (avoid UTC shift from toISOString)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function fmt(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function RecurrencePicker({ value = {}, startDate, onChange, theme }) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) }
  const recurrence = value.recurrence || 'None'
  const landing = value.recurrence_landing || 'schedule'
  const on = recurrence && recurrence !== 'None'

  // Derive the initial "ends" mode from the stored end date.
  const [endsMode, setEndsMode] = useState(value.recurrence_end_date ? 'date' : 'never')
  const [countN, setCountN] = useState(12)
  const [chosenDate, setChosenDate] = useState(value.recurrence_end_date || '')

  const baseDate = useMemo(() => {
    if (!startDate) return null
    const d = new Date(startDate)
    return isNaN(d.getTime()) ? null : d
  }, [startDate])

  // Compute the end date implied by the current "ends" controls.
  function endDateFor(mode, n, chosen, freq) {
    if (!freq || freq === 'None') return null
    if (mode === 'never') return null
    if (mode === 'date') return chosen || null
    if (mode === 'count') {
      if (!baseDate) return null
      let d = new Date(baseDate.getTime())
      for (let i = 1; i < Math.max(1, n); i++) d = addInterval(d, freq)
      return toISODate(d) // the Nth occurrence date
    }
    return null
  }

  function pickFreq(v) {
    if (v === 'None') { onChange?.({ recurrence: 'None', recurrence_end_date: null, recurrence_landing: landing }); return }
    onChange?.({ recurrence: v, recurrence_end_date: endDateFor(endsMode, countN, chosenDate, v), recurrence_landing: landing })
  }
  function pickEnds(mode) {
    setEndsMode(mode)
    onChange?.({ recurrence, recurrence_landing: landing, recurrence_end_date: endDateFor(mode, countN, chosenDate, recurrence) })
  }
  function pickLanding(l) { onChange?.({ recurrence, recurrence_end_date: endDateFor(endsMode, countN, chosenDate, recurrence), recurrence_landing: l }) }

  const preview = useMemo(() => {
    if (!on || !baseDate) return []
    const end = value.recurrence_end_date ? new Date(value.recurrence_end_date + 'T23:59:59') : null
    const out = []
    let d = new Date(baseDate.getTime())
    for (let i = 0; i < 6; i++) {
      if (end && d > end) break
      out.push(new Date(d.getTime()))
      d = addInterval(d, recurrence)
    }
    return out
  }, [on, baseDate, recurrence, value.recurrence_end_date])

  const chip = (active) => ({
    padding: '8px 13px', minHeight: 40, borderRadius: 10, cursor: 'pointer',
    fontSize: 13.5, fontWeight: 650, transition: 'all .12s',
    border: `1.5px solid ${active ? REC : t.border}`,
    background: active ? REC : t.bgCard, color: active ? '#fff' : t.textSecondary,
  })
  const label = { fontSize: 11, fontWeight: 700, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '.04em', fontFamily: 'ui-monospace, Menlo, monospace', display: 'block', marginBottom: 7 }
  const field = { marginBottom: 15 }
  const inputStyle = { fontSize: 14, padding: '9px 11px', border: `1.5px solid ${t.border}`, borderRadius: 10, background: t.bgCard, color: t.text, minHeight: 40 }

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden', background: t.bgCard }}>
      {/* header / toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 15px', borderBottom: on ? `1px solid ${t.border}` : 'none', background: on ? REC_BG : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Repeat size={18} color={on ? REC : t.textMuted} />
          <div>
            <div style={{ fontWeight: 750, fontSize: 14.5, color: t.text }}>Repeat this job</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>Auto-create the next one on a schedule</div>
          </div>
        </div>
        <button type="button" onClick={() => pickFreq(on ? 'None' : 'Monthly')}
          style={{ width: 46, height: 27, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', flex: 'none', background: on ? REC : t.border, transition: 'background .18s' }}>
          <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .18s' }} />
        </button>
      </div>

      {on && (
        <div style={{ padding: 15 }}>
          {/* frequency */}
          <div style={field}>
            <span style={label}>How often</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {FREQS.filter(f => f.v !== 'None').map(f => (
                <button type="button" key={f.v} onClick={() => pickFreq(f.v)} style={chip(recurrence === f.v)}>{f.label}</button>
              ))}
            </div>
          </div>

          {/* ends */}
          <div style={field}>
            <span style={label}>Ends</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {[['never', 'Never'], ['count', 'After…'], ['date', 'On date']].map(([m, lbl]) => (
                <button type="button" key={m} onClick={() => pickEnds(m)} style={chip(endsMode === m)}>{lbl}</button>
              ))}
              {endsMode === 'count' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" min={1} value={countN}
                    onChange={e => { const n = parseInt(e.target.value) || 1; setCountN(n); onChange?.({ recurrence, recurrence_landing: landing, recurrence_end_date: endDateFor('count', n, chosenDate, recurrence) }) }}
                    style={{ ...inputStyle, width: 68 }} />
                  <span style={{ fontSize: 13, color: t.textMuted }}>visits</span>
                </span>
              )}
              {endsMode === 'date' && (
                <input type="date" value={chosenDate}
                  onChange={e => { setChosenDate(e.target.value); onChange?.({ recurrence, recurrence_landing: landing, recurrence_end_date: e.target.value || null }) }}
                  style={inputStyle} />
              )}
            </div>
          </div>

          {/* landing */}
          <div style={{ marginBottom: 4 }}>
            <span style={label}>How should each one show up?</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 9 }}>
              {[
                { v: 'schedule', icon: Calendar, title: 'Auto-schedule it', desc: 'Lands on the Calendar & Job Board, ready to dispatch' },
                { v: 'services', icon: Wrench, title: 'Send to Services', desc: 'Shows in “upcoming due” to schedule & call the customer' },
              ].map(opt => {
                const active = landing === opt.v
                const Icon = opt.icon
                return (
                  <div key={opt.v} onClick={() => pickLanding(opt.v)} role="button"
                    style={{ border: `1.5px solid ${active ? REC : t.border}`, background: active ? REC_BG : t.bgCard, borderRadius: 12, padding: '11px 12px', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Icon size={17} color={active ? REC : t.textMuted} style={{ marginTop: 1, flex: 'none' }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: t.text }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{opt.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* live preview */}
          <div style={{ marginTop: 15, background: '#12160e', color: '#eef2eb', borderRadius: 12, padding: 14 }}>
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9aa88c', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8fbf6a', display: 'inline-block' }} /> Next visits
            </div>
            {baseDate ? (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {preview.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ width: 20, height: 20, flex: 'none', borderRadius: 5, background: 'rgba(255,255,255,.08)', display: 'grid', placeItems: 'center', fontSize: 10.5, fontFamily: 'ui-monospace, monospace', color: '#9aa88c' }}>{i + 1}</span>
                    <span style={{ fontWeight: 650 }}>{fmt(d)}</span>
                    {i === 0 && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'ui-monospace, monospace', color: '#8fbf6a' }}>first</span>}
                  </div>
                ))}
                <div style={{ marginTop: 4, fontSize: 12, color: '#c3ccb8' }}>
                  {value.recurrence_end_date
                    ? `Repeats until ${fmt(new Date(value.recurrence_end_date + 'T00:00:00'))}. `
                    : 'Repeats with no end. '}
                  Each becomes a real job on {landing === 'services' ? 'the Services list' : 'the Calendar & Job Board'}.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#9aa88c' }}>Set a start date to preview the schedule.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
