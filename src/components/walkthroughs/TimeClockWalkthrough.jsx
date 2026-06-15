// Time Clock walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/TimeClock.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Play, Square, Calendar, MapPin, Coffee, Pencil, CheckCircle } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/time-clock.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_EMPLOYEES = [
  { id: 1, name: 'Doug Anderson',  role: 'Sales',      clockedIn: true,  elapsed: '3:42:17', job: 'LED Retrofit — Northbridge', weekHours: 32.5 },
  { id: 2, name: 'Tracy Benson',   role: 'Manager',    clockedIn: false, elapsed: null,      job: null,                         weekHours: 24.0 },
  { id: 3, name: 'Marcus Webb',    role: 'Field Tech', clockedIn: true,  elapsed: '5:10:44', job: 'Warehouse LED',               weekHours: 36.0 },
  { id: 4, name: 'Linda Park',     role: 'Setter',     clockedIn: false, elapsed: null,      job: null,                         weekHours: 18.5 },
]

export default function TimeClockWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Time tracked, payroll ready." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

const DOUG = MOCK_EMPLOYEES[0]
const MARCUS = MOCK_EMPLOYEES[2]

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Time Clock</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>Mon Jun 9, 2026</span>
        </div>
        <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'monospace', color: T.accent }}>8:12:04 AM</div>
      </div>

      {/* in: employee grid overview */}
      {scene === 'in' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {MOCK_EMPLOYEES.map((emp, i) => (
            <motion.div key={emp.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', boxShadow: emp.clockedIn ? '0 0 16px rgba(34,197,94,0.12)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{emp.name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{emp.role}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: emp.clockedIn ? '#22c55e' : '#d1d5db' }} />
                  <span style={{ fontSize: '8px', color: emp.clockedIn ? '#22c55e' : T.textMuted }}>{emp.clockedIn ? 'In' : 'Out'}</span>
                </div>
              </div>
              {emp.clockedIn
                ? <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'monospace', color: '#22c55e', marginBottom: '6px' }}>{emp.elapsed}</div>
                : <div style={{ fontSize: '12px', fontWeight: '600', color: T.textSecondary, marginBottom: '6px' }}>{emp.weekHours.toFixed(1)} hrs / wk</div>
              }
              <button style={{ width: '100%', padding: '6px', border: 'none', borderRadius: '6px', backgroundColor: emp.clockedIn ? 'rgba(239,68,68,0.1)' : T.accent, color: emp.clockedIn ? '#ef4444' : '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                {emp.clockedIn ? <><Square size={9} />Clock Out</> : <><Play size={9} />Clock In</>}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* work: employee clocked in with job picked */}
      {scene === 'work' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          {/* Large active card for Marcus */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 0 28px rgba(34,197,94,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>Clocked In</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>{MARCUS.name}</div>
            <div style={{ fontSize: '32px', fontWeight: '800', fontFamily: 'monospace', color: '#22c55e' }}>{MARCUS.elapsed}</div>
            <div style={{ padding: '6px 14px', backgroundColor: T.accentBg, borderRadius: '8px', border: `1px solid ${T.accent}`, textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '2px' }}>Linked Job</div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: T.accent }}>{MARCUS.job}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: T.textMuted }}>
              <MapPin size={9} style={{ color: '#22c55e' }} />GPS stamped · 40.4276°N -111.7987°W
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ padding: '7px 18px', border: 'none', borderRadius: '7px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Square size={10} />Clock Out
              </button>
            </div>
          </motion.div>
          {/* Other employees mini */}
          <div style={{ width: '160px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {MOCK_EMPLOYEES.filter(e => e.id !== MARCUS.id).map((emp) => (
              <div key={emp.id} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{emp.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: emp.clockedIn ? '#22c55e' : '#d1d5db' }} />
                  <span style={{ fontSize: '8px', color: emp.clockedIn ? '#22c55e' : T.textMuted }}>{emp.clockedIn ? emp.elapsed : 'Out'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* lunch: lunch break active */}
      {scene === 'lunch' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid #eab308`, borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 0 24px rgba(234,179,8,0.15)' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'rgba(234,179,8,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Coffee size={20} style={{ color: '#eab308' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>{DOUG.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#eab308' }}>On Lunch Break</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'monospace', color: '#eab308' }}>00:22:14</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Timer paused · resumed at clock-back-in</div>
            <div style={{ padding: '5px 12px', backgroundColor: T.accentBg, borderRadius: '7px', fontSize: '10px', color: T.accent, fontWeight: '500' }}>
              Linked: LED Retrofit — Northbridge
            </div>
            <button style={{ padding: '8px 24px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Play size={11} />Back to Work
            </button>
          </motion.div>
          <div style={{ width: '160px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {MOCK_EMPLOYEES.filter(e => e.id !== DOUG.id).map(emp => (
              <div key={emp.id} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{emp.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: emp.clockedIn ? '#22c55e' : '#d1d5db' }} />
                  <span style={{ fontSize: '8px', color: emp.clockedIn ? '#22c55e' : T.textMuted }}>{emp.clockedIn ? emp.elapsed : 'Out'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* out: clock-out confirmation with GPS stamp */}
      {scene === 'out' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '22px', width: '280px', boxShadow: '0 6px 24px rgba(0,0,0,0.1)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <CheckCircle size={28} style={{ color: '#22c55e' }} />
            <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Clocked Out</div>
            <div style={{ fontSize: '11px', color: T.textSecondary }}>{MARCUS.name} · {MARCUS.role}</div>
            <div style={{ width: '100%', backgroundColor: T.bg, borderRadius: '8px', padding: '10px', border: `1px solid ${T.border}` }}>
              {[['Total today', '6h 48m'], ['Job', MARCUS.job], ['GPS', '40.3891°N -111.7532°W'], ['Address', 'Warehouse District, SLC']].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '10px', borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ color: T.textMuted }}>{l}</span>
                  <span style={{ color: T.text, fontWeight: '500', maxWidth: '150px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Hours land in time log · labor cost on JOB-2138</div>
          </motion.div>
        </div>
      )}

      {/* adjust: admin adjustment form */}
      {scene === 'adjust' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '14px', width: '310px', boxShadow: '0 6px 24px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: `1px solid ${T.border}`, backgroundColor: 'rgba(234,179,8,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Pencil size={12} style={{ color: '#eab308' }} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>Admin Adjustment</span>
              </div>
              <span style={{ fontSize: '9px', color: T.textMuted }}>Linda Park</span>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[['Clock In (before)', '7:30 AM'], ['Clock Out (before)', 'missing'], ['Clock In (after)', '7:30 AM'], ['Clock Out (after)', '4:15 PM']].map(([l, v]) => (
                  <div key={l}>
                    <label style={{ display: 'block', fontSize: '9px', color: T.textMuted, marginBottom: '2px' }}>{l}</label>
                    <div style={{ padding: '5px 7px', border: `1px solid ${l.includes('after') ? T.accent : T.border}`, borderRadius: '5px', backgroundColor: l.includes('after') ? T.accentBg : T.bg, fontSize: '10px', color: l.includes('after') ? T.accent : v === 'missing' ? '#ef4444' : T.text, fontWeight: l.includes('after') ? '600' : '400' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '9px', color: T.textMuted, marginBottom: '2px' }}>Reason (required)</label>
                <div style={{ padding: '6px 8px', border: `1px solid ${T.accent}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '10px', color: T.text }}>
                  Forgot to clock out — confirmed with employee via text
                </div>
              </div>
              <div style={{ fontSize: '8px', color: T.textMuted, padding: '5px 8px', backgroundColor: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '5px' }}>
                Audit trail: before, after, reason, admin user, timestamp all captured
              </div>
              <button style={{ padding: '8px', border: 'none', borderRadius: '7px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                Save Adjustment
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    in:     '1 · Clock In — green glow for active employees, monospace timer, week total for the rest',
    work:   '2 · Active session — GPS stamps the punch, labor rolls into job costing in real time',
    lunch:  '3 · Lunch break — timer pauses, yellow state, auto-resumes on Back to Work',
    out:    '4 · Clock Out — GPS stamp, total hours, job logged · lands in time log instantly',
    adjust: '5 · Admin adjustment — before/after, reason required · full audit trail captured',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Time Clock works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
