// Fleet walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Fleet.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Truck, Plus, Search, AlertTriangle, Calendar, Wrench, ChevronLeft, Fuel, User, CheckCircle } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/fleet.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// statusColors from Fleet.jsx lines 29-34
const STATUS_COLORS = {
  'Available':      { bg: 'rgba(74,124,89,0.15)',   text: '#4a7c59' },
  'In Use':         { bg: 'rgba(90,99,73,0.15)',     text: '#5a6349' },
  'Maintenance':    { bg: 'rgba(194,139,56,0.15)',   text: '#c28b38' },
  'Out of Service': { bg: 'rgba(194,90,90,0.15)',    text: '#c25a5a' },
}

const MOCK_FLEET = [
  { id: 1, asset_id: 'VEH-001', name: '2022 Ford F-250 — White',   type: 'Vehicle',   status: 'In Use',         mileage: 42800, next_pm: 'Jun 15, 2026', overdue: false, icon: Truck   },
  { id: 2, asset_id: 'VEH-002', name: '2020 Chevy Express — Blue', type: 'Vehicle',   status: 'Available',      mileage: 68100, next_pm: 'Aug 1, 2026',  overdue: false, icon: Truck   },
  { id: 3, asset_id: 'EQP-001', name: '16\' Enclosed Trailer',    type: 'Trailer',   status: 'Available',      mileage: 12400, next_pm: 'Jul 10, 2026', overdue: false, icon: Truck   },
  { id: 4, asset_id: 'VEH-003', name: '2018 GMC Sierra — Gray',   type: 'Vehicle',   status: 'Maintenance',    mileage: 91300, next_pm: 'May 1, 2026',  overdue: true,  icon: Truck   },
  { id: 5, asset_id: 'EQP-002', name: 'Boom Lift — JLG 45T',      type: 'Equipment', status: 'Out of Service', mileage: 2100,  next_pm: null,           overdue: false, icon: Wrench },
]

export default function FleetWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Fleet tracked." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

const F250 = MOCK_FLEET[0]

const SERVICE_HISTORY = [
  { date: 'Apr 2, 2026', type: 'Oil Change',         cost: 89, miles: 41200 },
  { date: 'Jan 15, 2026', type: 'Tire Rotation',     cost: 45, miles: 38900 },
  { date: 'Oct 8, 2025', type: 'Brake Inspection',   cost: 220, miles: 35600 },
  { date: 'Jul 3, 2025', type: 'A/C Recharge',       cost: 180, miles: 32100 },
]

const FUEL_LOGS = [
  { date: 'Jun 8', driver: 'Marcus', gallons: 22.4, total: 71.62, miles: 312 },
  { date: 'Jun 7', driver: 'Doug',   gallons: 18.1, total: 57.84, miles: 248 },
  { date: 'Jun 5', driver: 'Marcus', gallons: 61.8, total: 197.52, miles: 287, spike: true },
  { date: 'Jun 3', driver: 'Ryan',   gallons: 19.2, total: 61.38, miles: 264 },
]

const PM_SCHEDULE = [
  { asset: 'VEH-001', name: '2022 Ford F-250', task: 'Oil Change',       due: 'Jun 15, 2026', overdue: false },
  { asset: 'VEH-003', name: '2018 GMC Sierra', task: 'Full PM Service',  due: 'May 1, 2026',  overdue: true  },
  { asset: 'VEH-002', name: '2020 Chevy Express', task: 'Tire Rotation', due: 'Aug 1, 2026',  overdue: false },
  { asset: 'EQP-001', name: '16\' Trailer',    task: 'Safety Inspection',due: 'Jul 10, 2026', overdue: false },
]

const DRIVERS = [
  { name: 'Marcus Webb',    vehicle: 'VEH-001 — F-250',     since: 'Jan 2025', primary: true  },
  { name: 'Doug Anderson',  vehicle: 'VEH-002 — Chevy',     since: 'Mar 2025', primary: true  },
  { name: 'Ryan Diaz',      vehicle: 'VEH-001 — F-250',     since: 'Jun 2026', primary: false },
]

function FleetCard({ asset, highlight }) {
  const sc = STATUS_COLORS[asset.status] || STATUS_COLORS['Available']
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${highlight ? T.accent : asset.overdue ? '#c25a5a' : T.border}`, padding: '11px', cursor: 'pointer', outline: highlight ? `2px solid ${T.accent}` : 'none', outlineOffset: '-1px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '7px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '7px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Truck size={14} style={{ color: T.accent }} />
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>{asset.name}</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>{asset.asset_id} · {asset.type}</div>
          </div>
        </div>
        <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text, flexShrink: 0 }}>{asset.status}</span>
      </div>
      {asset.overdue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px', backgroundColor: 'rgba(194,90,90,0.1)', borderRadius: '4px', marginBottom: '5px' }}>
          <AlertTriangle size={9} style={{ color: '#c25a5a' }} />
          <span style={{ fontSize: '8px', fontWeight: '600', color: '#c25a5a' }}>PM OVERDUE</span>
        </div>
      )}
      <div style={{ fontSize: '9px', color: T.textMuted }}>{asset.mileage.toLocaleString()} mi · PM: {asset.next_pm || 'N/A'}</div>
    </motion.div>
  )
}

function Stage({ scene }) {
  const showDetail = scene === 'truck' || scene === 'fuel'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {showDetail && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: T.textMuted, cursor: 'pointer', fontSize: '10px' }}><ChevronLeft size={13} />Fleet</div>}
          {!showDetail && <Truck size={15} style={{ color: T.accent }} />}
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>{showDetail ? F250.name : 'Fleet'}</span>
          {showDetail && <span style={{ padding: '2px 6px', borderRadius: '5px', fontSize: '9px', backgroundColor: STATUS_COLORS['In Use'].bg, color: STATUS_COLORS['In Use'].text }}>In Use</span>}
        </div>
        {!showDetail && (
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={10} />Add Asset
          </button>
        )}
      </div>

      {/* list: full fleet grid */}
      {scene === 'list' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {MOCK_FLEET.map(asset => <FleetCard key={asset.id} asset={asset} />)}
        </div>
      )}

      {/* truck: vehicle detail + service history */}
      {scene === 'truck' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          {/* Detail card */}
          <div style={{ width: '180px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', overflow: 'auto' }}>
            {[['Asset ID', F250.asset_id], ['Type', F250.type], ['Status', 'In Use'], ['Mileage', '42,800 mi'], ['Next PM', 'Jun 15, 2026'], ['Driver', 'Marcus Webb']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${T.border}`, fontSize: '10px' }}>
                <span style={{ color: T.textMuted }}>{l}</span>
                <span style={{ color: T.text, fontWeight: '500' }}>{v}</span>
              </div>
            ))}
          </div>
          {/* Service history */}
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '11px', fontWeight: '700', color: T.text }}>Service History</div>
            {SERVICE_HISTORY.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{s.type}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{s.date} · {s.miles.toLocaleString()} mi</div>
                </div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent }}>${s.cost}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* fuel: fuel logs + Freddy spike alert */}
      {scene === 'fuel' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
          {/* Freddy spike alert */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <AlertTriangle size={12} style={{ color: '#ef4444' }} />
            <div style={{ flex: 1, fontSize: '10px', color: T.text }}>
              <span style={{ fontWeight: '600', color: '#ef4444' }}>Freddy alert: </span>
              Fuel fill Jun 5 was 61.8 gal — 3.4× above VEH-001 average (18.5 gal). Possible off-vehicle fill or theft.
            </div>
          </motion.div>
          {/* Fuel log table */}
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: T.accentBg }}>
                  {['Date', 'Driver', 'Gallons', 'Total', 'Miles'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Total' || h === 'Miles' || h === 'Gallons' ? 'right' : 'left', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FUEL_LOGS.map((f, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: f.spike ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                    <td style={{ padding: '6px 10px', color: T.textMuted }}>{f.date}</td>
                    <td style={{ padding: '6px 10px', color: T.text }}>{f.driver}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: f.spike ? '#ef4444' : T.text, fontWeight: f.spike ? '700' : '400' }}>
                      {f.gallons} gal {f.spike && <AlertTriangle size={9} style={{ color: '#ef4444', display: 'inline' }} />}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.text }}>${f.total}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.textMuted }}>{f.miles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* schedule: maintenance schedule */}
      {scene === 'schedule' && (
        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wrench size={12} style={{ color: T.accent }} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>PM Schedule</span>
            </div>
            <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600' }}>1 overdue</span>
          </div>
          {PM_SCHEDULE.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `1px solid ${T.border}`, backgroundColor: p.overdue ? 'rgba(194,90,90,0.04)' : 'transparent' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{p.name}</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>{p.asset} · {p.task}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: p.overdue ? '#ef4444' : T.textSecondary }}>
                  {p.overdue ? 'OVERDUE' : p.due}
                </div>
                {p.overdue && <div style={{ fontSize: '8px', color: '#ef4444' }}>was {p.due}</div>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* drivers: driver assignment list */}
      {scene === 'drivers' && (
        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={12} style={{ color: T.accent }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Driver Assignments</span>
          </div>
          {DRIVERS.map((d, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: T.accent }}>{d.name.charAt(0)}</div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{d.name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{d.vehicle}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: d.primary ? T.accentBg : 'rgba(107,114,128,0.1)', color: d.primary ? T.accent : '#6b7280' }}>
                  {d.primary ? 'Primary' : 'Secondary'}
                </span>
                <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px' }}>since {d.since}</div>
              </div>
            </motion.div>
          ))}
          <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'center' }}>
            <button style={{ padding: '6px 14px', border: `1px dashed ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textMuted, fontSize: '9px', cursor: 'pointer' }}>+ Assign driver</button>
          </div>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:     '1 · Fleet grid — every vehicle + equipment, status badge, PM overdue in red',
    truck:    '2 · Vehicle detail — mileage, driver, PM date + full service history with cost',
    fuel:     '3 · Fuel logs — Freddy flags 61 gal fill as 3.4× above average, possible theft',
    schedule: '4 · PM Schedule — overdue items in red, upcoming sorted by due date',
    drivers:  '5 · Driver assignments — primary + secondary per vehicle, assigned-since date',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Fleet tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
