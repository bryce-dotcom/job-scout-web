// TimeLogWalkthrough.jsx — Time Log feature walkthrough
// Source: src/lib/featureKnowledge/time-log.js

import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Filter, ChevronDown, MapPin, Edit2, AlertTriangle, User, Briefcase, CheckCircle, TrendingUp } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/time-log.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_ENTRIES = [
  { id: 1, employee: 'Marcus Webb',     date: 'Jun 9',  job: 'JOB-041 · Northbridge',  clockIn: '7:58 AM',  clockOut: '5:02 PM',  regular: 8.0,  ot: 0,   total: 9.07, missingOut: false },
  { id: 2, employee: 'Doug Anderson',   date: 'Jun 9',  job: 'JOB-038 · Suncrest',     clockIn: '8:05 AM',  clockOut: '4:48 PM',  regular: 8.0,  ot: 0,   total: 8.72, missingOut: false },
  { id: 3, employee: 'Linda Park',      date: 'Jun 9',  job: 'Admin',                  clockIn: '8:00 AM',  clockOut: '5:00 PM',  regular: 9.0,  ot: 0,   total: 9.0,  missingOut: false },
  { id: 4, employee: 'Marcus Webb',     date: 'Jun 10', job: 'JOB-041 · Northbridge',  clockIn: '7:55 AM',  clockOut: '5:30 PM',  regular: 8.0,  ot: 0.5, total: 9.58, missingOut: false, hasOT: true },
  { id: 5, employee: 'Carlos Rivera',   date: 'Jun 10', job: 'JOB-044 · Maricopa',     clockIn: '7:30 AM',  clockOut: null,       regular: 0,    ot: 0,   total: 0,    missingOut: true  },
  { id: 6, employee: 'Tracy Benson',    date: 'Jun 10', job: 'JOB-038 · Suncrest',     clockIn: '8:15 AM',  clockOut: '4:30 PM',  regular: 8.0,  ot: 0,   total: 8.25, missingOut: false },
  { id: 7, employee: 'Ryan Torres',     date: 'Jun 11', job: 'Drive time',             clockIn: '7:45 AM',  clockOut: '3:45 PM',  regular: 8.0,  ot: 0,   total: 8.0,  missingOut: false },
  { id: 8, employee: 'Doug Anderson',   date: 'Jun 11', job: 'JOB-044 · Maricopa',     clockIn: '8:00 AM',  clockOut: '5:15 PM',  regular: 8.0,  ot: 0,   total: 9.25, missingOut: false },
]

const JOB_BREAKDOWN = [
  { job: 'JOB-041 · Northbridge', hours: 18.0, color: T.accent },
  { job: 'JOB-038 · Suncrest',    hours: 14.0, color: '#3b82f6' },
  { job: 'Admin',                  hours: 5.0,  color: '#7d8a7f' },
  { job: 'Drive time',             hours: 5.5,  color: '#a855f7' },
]

export default function TimeLogWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every hour accounted." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Time Log</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>Jun 9–11, 2026</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600', backgroundColor: 'rgba(239,68,68,0.1)', padding: '2px 7px', borderRadius: '8px' }}>1 missing</span>
          <span style={{ fontSize: '9px', color: '#eab308', fontWeight: '600', backgroundColor: 'rgba(234,179,8,0.1)', padding: '2px 7px', borderRadius: '8px' }}>1 OT</span>
        </div>
      </div>

      {scene === 'log' && <SceneLog />}
      {scene === 'entry' && <SceneEntry />}
      {scene === 'correction' && <SceneCorrection />}
      {scene === 'summary' && <SceneSummary />}
    </div>
  )
}

function SceneLog() {
  return (
    <>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textSecondary }}>
          <User size={10} style={{ color: T.textMuted }} />
          <span>All employees</span>
          <ChevronDown size={9} style={{ color: T.textMuted }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textSecondary }}>
          <span>Jun 9 – Jun 11</span>
          <ChevronDown size={9} style={{ color: T.textMuted }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textSecondary }}>
          <Briefcase size={10} style={{ color: T.textMuted }} />
          <span>All jobs</span>
          <ChevronDown size={9} style={{ color: T.textMuted }} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted }}>
          <Filter size={9} />
          <span>Filter</span>
        </div>
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Employee', 'Date', 'Job / Task', 'Clock In', 'Clock Out', 'Regular', 'OT', 'Total'].map(col => (
                <th key={col} style={{ padding: '5px 9px', textAlign: ['Regular', 'OT', 'Total'].includes(col) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_ENTRIES.map((row, i) => (
              <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: row.missingOut ? 'rgba(234,179,8,0.07)' : 'transparent', cursor: 'pointer' }}>
                <td style={{ padding: '5px 9px', fontWeight: '500', color: T.text, whiteSpace: 'nowrap' }}>{row.employee}</td>
                <td style={{ padding: '5px 9px', color: T.textMuted }}>{row.date}</td>
                <td style={{ padding: '5px 9px', color: T.textSecondary, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.job}</td>
                <td style={{ padding: '5px 9px', color: T.textSecondary }}>{row.clockIn}</td>
                <td style={{ padding: '5px 9px' }}>
                  {row.missingOut
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#c28b38', fontWeight: '600', fontSize: '9px' }}><AlertTriangle size={9} />Missing</span>
                    : <span style={{ color: T.textSecondary }}>{row.clockOut}</span>
                  }
                </td>
                <td style={{ padding: '5px 9px', textAlign: 'right', color: T.text }}>{row.missingOut ? '—' : row.regular.toFixed(1)}</td>
                <td style={{ padding: '5px 9px', textAlign: 'right' }}>
                  {row.hasOT
                    ? <span style={{ padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(234,179,8,0.15)', color: '#c28b38', fontSize: '9px', fontWeight: '700' }}>0.5h</span>
                    : <span style={{ color: T.textMuted }}>—</span>
                  }
                </td>
                <td style={{ padding: '5px 9px', textAlign: 'right', fontWeight: '600', color: row.missingOut ? T.textMuted : T.text }}>{row.missingOut ? '—' : row.total.toFixed(2)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 'auto', padding: '6px 9px', borderTop: `2px solid ${T.border}`, backgroundColor: T.accentBg, display: 'flex', justifyContent: 'flex-end', gap: '24px', fontSize: '10px', fontWeight: '700', color: T.text }}>
          <span style={{ color: T.textMuted, fontWeight: '400' }}>Totals (this week)</span>
          <span>Regular: 148.5h</span>
          <span style={{ color: '#c28b38' }}>OT: 2.5h</span>
          <span>Total: 151.0h</span>
        </div>
      </div>
    </>
  )
}

function SceneEntry() {
  const row = MOCK_ENTRIES[0]
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.accentBg }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Entry Detail</span>
          <span style={{ fontSize: '9px', color: T.textMuted }}>Jun 9, 2026</span>
        </div>
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: T.accent, flexShrink: 0 }}>M</div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>Marcus Webb</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>Field Technician · Employee #004</div>
            </div>
          </div>
          <div style={{ padding: '8px 10px', backgroundColor: T.accentBg, borderRadius: '7px', border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <Briefcase size={11} style={{ color: T.accent }} />
              <span style={{ fontSize: '10px', fontWeight: '600', color: T.accent }}>JOB-041 · Northbridge · LED Retrofit</span>
            </div>
            <div style={{ fontSize: '9px', color: T.textSecondary }}>Phoenix, AZ · $24,500 contract</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Clock In', value: '7:58 AM', icon: <Clock size={10} style={{ color: '#22c55e' }} /> },
              { label: 'Clock Out', value: '5:02 PM', icon: <Clock size={10} style={{ color: '#ef4444' }} /> },
              { label: 'Total Hours', value: '9.07h', icon: <TrendingUp size={10} style={{ color: T.accent }} /> },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{ padding: '8px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '3px' }}>{icon}<span style={{ fontSize: '8px', color: T.textMuted }}>{label}</span></div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bg, display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
            <MapPin size={11} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>GPS at punch-in</div>
              <div style={{ fontSize: '9px', color: T.textSecondary }}>4201 N 16th St, Phoenix</div>
              <div style={{ fontSize: '9px', color: '#22c55e', fontWeight: '500' }}>0.2 mi from job site</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '9px', color: T.textMuted, fontWeight: '600' }}>NOTES</label>
            <div style={{ padding: '7px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '10px', color: T.textSecondary, minHeight: '32px' }}>Ran conduit on east wing, finished panel swap.</div>
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Edit2 size={10} />Edit Times
          </button>
        </div>
      </div>
    </div>
  )
}

function SceneCorrection() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(234,179,8,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={13} style={{ color: '#c28b38' }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Correct Clock-out</span>
          </div>
          <span style={{ fontSize: '9px', color: T.textMuted }}>Carlos Rivera · Jun 10</span>
        </div>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '11px', flex: 1 }}>
          <div style={{ padding: '8px 11px', backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={11} style={{ color: '#c28b38', flexShrink: 0 }} />
            <div style={{ fontSize: '9px', color: '#c28b38', fontWeight: '500' }}>Original clock-out: <strong>missing</strong> — employee never clocked out</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '9px', color: T.textMuted, fontWeight: '600' }}>CLOCK IN</label>
              <div style={{ padding: '7px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '10px', color: T.textSecondary }}>7:30 AM (locked)</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '9px', color: '#c28b38', fontWeight: '600' }}>NEW CLOCK-OUT *</label>
              <div style={{ padding: '7px 9px', border: '2px solid #c28b38', borderRadius: '6px', backgroundColor: '#fffbf0', fontSize: '10px', color: T.text, fontWeight: '600' }}>4:30 PM</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '9px', color: T.textMuted, fontWeight: '600' }}>REASON *</label>
            <div style={{ padding: '7px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '10px', color: T.text, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Forgot to clock out</span>
              <ChevronDown size={10} style={{ color: T.textMuted }} />
            </div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>Options: Forgot to clock out · Manager correction · System error · Other</div>
          </div>
          <div style={{ padding: '9px 11px', backgroundColor: T.accentBg, border: `1px solid ${T.border}`, borderRadius: '7px' }}>
            <div style={{ fontSize: '9px', fontWeight: '600', color: T.textMuted, marginBottom: '5px' }}>AUDIT TRAIL</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px', color: T.textSecondary }}>
              <div><span style={{ color: T.textMuted }}>Original:</span> missing</div>
              <div><span style={{ color: T.textMuted }}>Corrected by:</span> <span style={{ color: T.accent, fontWeight: '600' }}>Sarah M. (Admin)</span></div>
              <div><span style={{ color: T.textMuted }}>Timestamp:</span> Jun 11 · 3:42 PM</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button style={{ padding: '5px 12px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
          <button style={{ padding: '5px 14px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Save Correction</button>
        </div>
      </div>
    </div>
  )
}

function SceneSummary() {
  const totalH = 42.5
  const otH = 2.5
  const regularH = totalH - otH
  const totalBarW = 100
  const otPct = (otH / totalH) * 100
  const regularPct = (regularH / totalH) * 100

  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: T.accentBg }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#fff' }}>M</div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Marcus Webb</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Week of Jun 9–15, 2026</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: T.text }}>42.5h</div>
            <div style={{ fontSize: '8px', color: '#c28b38', fontWeight: '600' }}>2.5h OT</div>
          </div>
        </div>
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: T.textMuted, marginBottom: '4px' }}>
              <span>Regular ({regularH}h)</span>
              <span style={{ color: '#c28b38' }}>OT ({otH}h)</span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', overflow: 'hidden', backgroundColor: T.border, display: 'flex' }}>
              <div style={{ width: `${regularPct}%`, backgroundColor: T.accent, borderRadius: '4px 0 0 4px' }} />
              <div style={{ width: `${otPct}%`, backgroundColor: '#c28b38', borderRadius: '0 4px 4px 0' }} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', fontWeight: '600', color: T.textMuted, marginBottom: '6px' }}>HOURS BY JOB</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {JOB_BREAKDOWN.map((j, i) => (
                <motion.div key={j.job} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '9px', color: T.textSecondary, width: '140px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.job}</div>
                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', backgroundColor: T.border, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(j.hours / totalH) * 100}%`, backgroundColor: j.color, borderRadius: '3px' }} />
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: '600', color: T.text, width: '28px', textAlign: 'right' }}>{j.hours}h</div>
                </motion.div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
            {[
              { label: 'Comp Time Balance', value: '0h', color: T.textMuted },
              { label: 'Annualized Pace', value: '1,840h / yr', color: T.accent },
            ].map(({ label, value, color }) => (
              <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bg }}>
                <div style={{ fontSize: '8px', color: T.textMuted, marginBottom: '3px' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color }}>{value}</div>
              </motion.div>
            ))}
          </div>

          <div style={{ padding: '8px 10px', backgroundColor: T.accentBg, border: `1px solid ${T.border}`, borderRadius: '7px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
              <CheckCircle size={10} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>Payroll status</span>
            </div>
            <div style={{ fontSize: '9px', color: T.textSecondary }}>All entries verified · Ready for Jun 15 payroll run</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    log:        '1 · Time log table — every punch this week, OT badge, amber flag for missing clock-outs, totals row',
    entry:      '2 · Entry detail — job linked, GPS at punch-in, exact times, notes field, edit button',
    correction: '3 · Correct clock-out dialog — reason dropdown, audit trail records who changed what and when',
    summary:    '4 · Employee summary — 42.5h total, OT breakdown, hours by job, annualized pace',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Time Log works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
