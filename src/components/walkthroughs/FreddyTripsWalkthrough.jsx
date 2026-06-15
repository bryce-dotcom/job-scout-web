// FreddyTripsWalkthrough.jsx — Trips & Driver Scores walkthrough.
// Source: src/lib/featureKnowledge/freddy-trips.js

import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Navigation, User, FileDown, ChevronDown, Briefcase, Clock, Gauge, DollarSign, Award } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/freddy-trips.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const TRIPS = [
  { date: 'Jun 11', driver: 'Marcus Webb',   vehicle: 'VEH-001 · F-250',    from: 'Office · Mesa',       to: 'Northbridge Ctr',   miles: 24.3, dur: '38 min', job: 'JOB-041 · EST-041',    cost: '$4.20' },
  { date: 'Jun 11', driver: 'Cole Rivera',   vehicle: 'VEH-004 · Transit',  from: 'Mesa Shop',           to: 'Tempe Warehouse',   miles: 8.1,  dur: '14 min', job: '—',                    cost: '$1.40' },
  { date: 'Jun 11', driver: 'Dana Holt',     vehicle: 'VEH-002 · Chevy',    from: 'Northbridge Ctr',     to: 'Gilbert Yard',      miles: 17.4, dur: '28 min', job: 'JOB-039 · EST-038',    cost: '$3.00' },
  { date: 'Jun 10', driver: 'Marcus Webb',   vehicle: 'VEH-001 · F-250',    from: 'Office · Mesa',       to: 'Scottsdale AZ',     miles: 41.8, dur: '52 min', job: 'JOB-037 · EST-035',    cost: '$7.23' },
  { date: 'Jun 10', driver: 'Ryan Diaz',     vehicle: 'VEH-003 · Sierra',   from: 'Gilbert Yard',        to: 'Chandler Ctr',      miles: 12.6, dur: '21 min', job: '—',                    cost: '$2.18' },
  { date: 'Jun 10', driver: 'Cole Rivera',   vehicle: 'VEH-004 · Transit',  from: 'Tempe Warehouse',     to: 'Phoenix Office',    miles: 9.4,  dur: '17 min', job: '—',                    cost: '$1.63' },
]

const DRIVER_SCORES = [
  { name: 'Marcus Webb',  trips: 42, miles: 840, avgSpeed: 38, hardBrakes: 2,  idlePct: 8,  score: 'A', scoreColor: '#22c55e', scoreBg: 'rgba(34,197,94,0.12)' },
  { name: 'Dana Holt',    trips: 31, miles: 614, avgSpeed: 36, hardBrakes: 4,  idlePct: 11, score: 'B', scoreColor: '#3b82f6', scoreBg: 'rgba(59,130,246,0.12)' },
  { name: 'Ryan Diaz',    trips: 19, miles: 388, avgSpeed: 41, hardBrakes: 5,  idlePct: 9,  score: 'B', scoreColor: '#3b82f6', scoreBg: 'rgba(59,130,246,0.12)' },
  { name: 'Cole Rivera',  trips: 28, miles: 560, avgSpeed: 44, hardBrakes: 7,  idlePct: 14, score: 'C', scoreColor: '#eab308', scoreBg: 'rgba(234,179,8,0.12)' },
]

const REIMBURSEMENT = [
  { name: 'Marcus Webb',  personalTrips: 12, miles: 248, rate: 0.67, amount: 166.16 },
  { name: 'Dana Holt',    personalTrips: 7,  miles: 134, rate: 0.67, amount: 89.78  },
  { name: 'Ryan Diaz',    personalTrips: 4,  miles: 82,  rate: 0.67, amount: 54.94  },
  { name: 'Cole Rivera',  personalTrips: 9,  miles: 178, rate: 0.67, amount: 119.26 },
]
const REIMB_TOTAL = REIMBURSEMENT.reduce((s, r) => s + r.amount, 0)

export default function FreddyTripsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Miles tracked, drivers scored." />}
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
          <MapPin size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>
            {scene === 'trips' && 'Trips'}
            {scene === 'trip' && 'Trip Detail — Jun 11'}
            {scene === 'drivers' && 'Driver Scorecards'}
            {scene === 'reimbursement' && 'Mileage Reimbursement'}
          </span>
          {scene === 'trips' && <span style={{ fontSize: '10px', color: T.textMuted }}>Jun 10–11 · All drivers</span>}
          {scene === 'drivers' && <span style={{ fontSize: '9px', color: T.textMuted, padding: '2px 6px', borderRadius: '4px', backgroundColor: T.accentBg }}>June MTD</span>}
        </div>
        {scene === 'trips' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textSecondary, cursor: 'pointer' }}>
              <User size={10} />
              <span>All Drivers</span>
              <ChevronDown size={9} />
            </div>
          </div>
        )}
        {scene === 'reimbursement' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', backgroundColor: T.accent, color: '#fff', borderRadius: '5px', fontSize: '10px', cursor: 'pointer' }}>
            <FileDown size={10} />
            <span>Export CSV</span>
          </div>
        )}
      </div>

      {scene === 'trips' && <TripsScene />}
      {scene === 'trip' && <TripDetailScene />}
      {scene === 'drivers' && <DriversScene />}
      {scene === 'reimbursement' && <ReimbursementScene />}
    </div>
  )
}

function TripsScene() {
  return (
    <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ backgroundColor: T.accentBg }}>
            {['Date', 'Driver', 'Vehicle', 'From', 'To', 'Miles', 'Duration', 'Job Linked', 'Cost'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: ['Miles', 'Cost'].includes(h) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TRIPS.map((trip, i) => (
            <motion.tr key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: trip.job !== '—' ? 'rgba(90,99,73,0.04)' : 'transparent' }}>
              <td style={{ padding: '6px 8px', color: T.textMuted, whiteSpace: 'nowrap' }}>{trip.date}</td>
              <td style={{ padding: '6px 8px', fontWeight: '500', color: T.text, whiteSpace: 'nowrap' }}>{trip.driver}</td>
              <td style={{ padding: '6px 8px', color: T.textSecondary, fontSize: '9px', whiteSpace: 'nowrap' }}>{trip.vehicle}</td>
              <td style={{ padding: '6px 8px', color: T.textSecondary, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.from}</td>
              <td style={{ padding: '6px 8px', color: T.textSecondary, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.to}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: T.text }}>{trip.miles}</td>
              <td style={{ padding: '6px 8px', color: T.textMuted, whiteSpace: 'nowrap' }}>{trip.dur}</td>
              <td style={{ padding: '6px 8px' }}>
                {trip.job !== '—' ? (
                  <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: T.accentBg, color: T.accent, whiteSpace: 'nowrap' }}>{trip.job}</span>
                ) : (
                  <span style={{ color: T.textMuted, fontSize: '9px' }}>—</span>
                )}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: T.textSecondary }}>{trip.cost}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TripDetailScene() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ flex: 1, backgroundColor: '#e8ede3', border: `1px solid ${T.border}`, borderRadius: '10px', position: 'relative', overflow: 'hidden', minHeight: '100px' }}>
          <svg width="100%" height="100%" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
            <rect width="320" height="140" fill="#e8ede3" />
            <line x1="0" y1="50" x2="320" y2="50" stroke="#d0d8c8" strokeWidth="0.5" />
            <line x1="0" y1="90" x2="320" y2="90" stroke="#d0d8c8" strokeWidth="0.5" />
            <line x1="80" y1="0" x2="80" y2="140" stroke="#d0d8c8" strokeWidth="0.5" />
            <line x1="160" y1="0" x2="160" y2="140" stroke="#d0d8c8" strokeWidth="0.5" />
            <line x1="240" y1="0" x2="240" y2="140" stroke="#d0d8c8" strokeWidth="0.5" />
            <rect x="0" y="60" width="320" height="20" fill="#dce4d6" opacity="0.4" />
            <rect x="0" y="30" width="320" height="10" fill="#dce4d6" opacity="0.3" />
            <path d="M 48 112 Q 90 95 140 80 Q 190 65 260 42" stroke="#5a6349" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle cx="48" cy="112" r="6" fill="#22c55e" />
            <text x="55" y="116" fontSize="8" fill="#2c3530" fontWeight="600">Start</text>
            <circle cx="260" cy="42" r="6" fill="#ef4444" />
            <text x="237" y="38" fontSize="8" fill="#2c3530" fontWeight="600">End</text>
            <circle cx="48" cy="112" r="3" fill="#fff" />
            <circle cx="260" cy="42" r="3" fill="#fff" />
          </svg>
          <div style={{ position: 'absolute', top: '8px', left: '10px', fontSize: '9px', color: T.textSecondary, fontWeight: '600' }}>Route · Jun 11 · Marcus Webb</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', flexShrink: 0 }}>
          {[
            { icon: Navigation, label: 'Miles', val: '24.3 mi' },
            { icon: Clock,      label: 'Duration', val: '38 min' },
            { icon: Gauge,      label: 'Avg Speed', val: '38 mph' },
            { icon: DollarSign, label: 'Fuel Est.', val: '$4.20' },
          ].map(({ icon: Icon, label, val }) => (
            <div key={label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
              <Icon size={12} style={{ color: T.accent, marginBottom: '3px' }} />
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>{val}</div>
              <div style={{ fontSize: '8px', color: T.textMuted }}>{label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
        style={{ width: '170px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: T.text, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Briefcase size={11} style={{ color: T.accent }} />
            Job Linked
          </div>
          <div style={{ padding: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginBottom: '2px' }}>JOB-041</div>
            <div style={{ fontSize: '9px', color: T.text, fontWeight: '500', marginBottom: '2px' }}>LED Retrofit</div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '8px' }}>Northbridge Ctr · EST-041</div>
            <button style={{ width: '100%', padding: '5px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, color: T.textSecondary, fontSize: '9px', cursor: 'pointer' }}>
              Edit link
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px' }}>
          <div style={{ fontSize: '9px', fontWeight: '600', color: T.textMuted, marginBottom: '6px' }}>Trip Info</div>
          {[['Driver', 'Marcus Webb'], ['Vehicle', 'VEH-001 · F-250'], ['Start', '7:42 AM'], ['End', '8:20 AM'], ['Odometer', '42,776 → 42,800']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${T.border}`, fontSize: '9px' }}>
              <span style={{ color: T.textMuted }}>{l}</span>
              <span style={{ color: T.text, fontWeight: '500', textAlign: 'right', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function DriversScene() {
  return (
    <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ backgroundColor: T.accentBg }}>
            {['Driver', 'Trips', 'Miles', 'Avg Speed', 'Hard Brakes', 'Idle Time', 'Score'].map(h => (
              <th key={h} style={{ padding: '7px 10px', textAlign: ['Trips', 'Miles', 'Hard Brakes'].includes(h) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DRIVER_SCORES.map((d, i) => (
            <motion.tr key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: 'transparent' }}>
              <td style={{ padding: '9px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: T.accent, flexShrink: 0 }}>{d.name.charAt(0)}</div>
                  <span style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{d.name}</span>
                </div>
              </td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: T.textSecondary }}>{d.trips}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: T.textSecondary }}>{d.miles} mi</td>
              <td style={{ padding: '9px 10px', color: d.avgSpeed > 42 ? '#eab308' : T.textSecondary }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ height: '4px', width: '40px', backgroundColor: T.border, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (d.avgSpeed / 60) * 100)}%`, backgroundColor: d.avgSpeed > 42 ? '#eab308' : T.accent, borderRadius: '2px' }} />
                  </div>
                  <span style={{ fontSize: '9px' }}>{d.avgSpeed} mph</span>
                </div>
              </td>
              <td style={{ padding: '9px 10px', textAlign: 'right', color: d.hardBrakes >= 6 ? '#ef4444' : T.text, fontWeight: d.hardBrakes >= 6 ? '700' : '400' }}>{d.hardBrakes}</td>
              <td style={{ padding: '9px 10px', color: d.idlePct >= 13 ? '#eab308' : T.textSecondary }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ height: '4px', width: '36px', backgroundColor: T.border, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.idlePct * 4}%`, backgroundColor: d.idlePct >= 13 ? '#eab308' : T.accent, borderRadius: '2px' }} />
                  </div>
                  <span style={{ fontSize: '9px' }}>{d.idlePct}%</span>
                </div>
              </td>
              <td style={{ padding: '9px 10px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', backgroundColor: d.scoreBg }}>
                  <Award size={10} style={{ color: d.scoreColor }} />
                  <span style={{ fontSize: '12px', fontWeight: '800', color: d.scoreColor }}>{d.score}</span>
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 'auto', padding: '7px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: T.bg }}>
        <Award size={10} style={{ color: T.textMuted }} />
        <span style={{ fontSize: '9px', color: T.textMuted }}>Scores update weekly · Based on speed, hard brakes, and idle time</span>
      </div>
    </div>
  )
}

function ReimbursementScene() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', fontSize: '9px', fontWeight: '700', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <DollarSign size={9} />
          IRS Rate $0.67/mi · 2026
        </div>
        <span style={{ fontSize: '9px', color: T.textMuted }}>June MTD · Personal vehicle trips only</span>
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Employee', 'Personal Trips', 'Miles', 'Rate ($/mi)', 'Amount Due'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: ['Personal Trips', 'Miles', 'Rate ($/mi)', 'Amount Due'].includes(h) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REIMBURSEMENT.map((r, i) => (
              <motion.tr key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: T.accent, flexShrink: 0 }}>{r.name.charAt(0)}</div>
                    <span style={{ fontWeight: '500', color: T.text }}>{r.name}</span>
                  </div>
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: T.textSecondary }}>{r.personalTrips}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '600', color: T.text }}>{r.miles} mi</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: T.textMuted }}>${r.rate.toFixed(2)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '700', color: '#22c55e', fontSize: '11px' }}>${r.amount.toFixed(2)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 'auto', padding: '9px 12px', borderTop: `2px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: T.bg }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Total Due — June 2026</span>
          <span style={{ fontSize: '14px', fontWeight: '800', color: '#22c55e' }}>${REIMB_TOTAL.toFixed(2)}</span>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', flexShrink: 0 }}>
        <FileDown size={12} style={{ color: T.accent }} />
        <span style={{ fontSize: '9px', color: T.textSecondary }}>Export CSV includes employee name, trip count, total miles, rate, and amount due — ready to import into payroll.</span>
      </motion.div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    trips:         '1 · Trip log — every drive with driver, vehicle, miles, duration, and job link',
    trip:          '2 · Trip detail — route map, stats, and job linked to JOB-041 · LED Retrofit',
    drivers:       '3 · Driver scorecards — Marcus earns A, Cole racks up hard brakes for a C',
    reimbursement: '4 · Mileage reimbursement — IRS rate export per employee, ready for payroll',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Trips & Driver Scores work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
