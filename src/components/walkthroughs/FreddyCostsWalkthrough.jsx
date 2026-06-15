// FreddyCostsWalkthrough — Fleet Maintenance & Costs scenes.
// Scenes: overview (cost KPIs + bar chart), maintenance (records table), fuel (Freddy alert + log), alerts (service due panel).

import { motion, AnimatePresence } from 'framer-motion'
import { Wrench, Fuel, AlertTriangle, Calendar, Plus, CheckCircle, Bot, DollarSign, Truck } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/freddy-costs.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const COST_VEHICLES = [
  { id: 'VEH-003', name: 'GMC Sierra',      fuel: 2180, maint: 3710, total: 5890, highlight: true },
  { id: 'VEH-001', name: 'Ford F-250',       fuel: 3240, maint:  980, total: 4220, highlight: false },
  { id: 'VEH-002', name: 'Chevy Express',    fuel: 2890, maint:  560, total: 3450, highlight: false },
  { id: 'EQP-001', name: '16\' Trailer',     fuel:    0, maint:  840, total:  840, highlight: false },
  { id: 'EQP-002', name: 'Boom Lift JLG',    fuel:    0, maint:  620, total:  620, highlight: false },
]
const MAX_COST = 5890

const MAINTENANCE_RECORDS = [
  { date: 'Jun 4, 2026',  asset: 'VEH-001', assetName: 'F-250',       type: 'Oil Change',            cost: 89,   miles: 42800, shop: 'Jiffy Lube #214',    notes: '5W-30 full synthetic' },
  { date: 'May 28, 2026', asset: 'VEH-002', assetName: 'Chevy',        type: 'Tire Rotation',         cost: 45,   miles: 67400, shop: 'Discount Tire',      notes: '' },
  { date: 'May 12, 2026', asset: 'VEH-003', assetName: 'GMC Sierra',   type: 'Brake Inspection',      cost: 320,  miles: 90100, shop: 'AutoCare Plus',      notes: 'Front pads replaced' },
  { date: 'Apr 30, 2026', asset: 'VEH-003', assetName: 'GMC Sierra',   type: 'Alternator Replacement',cost: 680,  miles: 89500, shop: 'AutoCare Plus',      notes: 'OEM part' },
  { date: 'Apr 15, 2026', asset: 'VEH-001', assetName: 'F-250',        type: 'Oil Change',            cost: 89,   miles: 41200, shop: 'Jiffy Lube #214',    notes: '' },
  { date: 'Mar 22, 2026', asset: 'EQP-001', assetName: '16\' Trailer', type: 'Safety Inspection',     cost: 140,  miles: 12100, shop: 'State DOT Station',  notes: 'Annual — passed' },
]

const FUEL_LOGS = [
  { date: 'Jun 8', driver: 'Marcus', vehicle: 'VEH-001', gallons: 22.4, pricePgal: 3.19, total: 71.42,  miles: 312, spike: false },
  { date: 'Jun 7', driver: 'Doug',   vehicle: 'VEH-002', gallons: 18.1, pricePgal: 3.22, total: 58.28,  miles: 248, spike: false },
  { date: 'Jun 5', driver: 'Marcus', vehicle: 'VEH-001', gallons: 61.8, pricePgal: 3.20, total: 197.76, miles: 287, spike: true  },
  { date: 'Jun 3', driver: 'Ryan',   vehicle: 'VEH-001', gallons: 19.2, pricePgal: 3.18, total: 61.06,  miles: 264, spike: false },
  { date: 'Jun 1', driver: 'Doug',   vehicle: 'VEH-002', gallons: 17.6, pricePgal: 3.15, total: 55.44,  miles: 231, spike: false },
]

const SERVICE_ALERTS = [
  { asset: 'VEH-003', name: '2018 GMC Sierra',      task: 'Full PM Service',   status: 'overdue', due: 'May 1, 2026',  miles: '91,300 mi / due 89k', color: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
  { asset: 'VEH-001', name: '2022 Ford F-250',       task: 'Oil Change',        status: 'soon',    due: 'Jun 15, 2026', miles: '42,800 mi / due 45k', color: '#eab308', bg: 'rgba(234,179,8,0.06)'  },
  { asset: 'VEH-002', name: '2020 Chevy Express',    task: 'Tire Rotation',     status: 'ok',      due: 'Aug 1, 2026',  miles: '68,100 mi / due 75k', color: '#22c55e', bg: 'rgba(34,197,94,0.06)'  },
]

export default function FreddyCostsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Costs controlled." />}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Wrench size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Fleet Costs</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>YTD 2026</span>
        </div>
        {(scene === 'maintenance') && (
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={10} />Add record
          </button>
        )}
      </div>

      {scene === 'overview' && <OverviewScene />}
      {scene === 'maintenance' && <MaintenanceScene />}
      {scene === 'fuel' && <FuelScene />}
      {scene === 'alerts' && <AlertsScene />}
    </div>
  )
}

function OverviewScene() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px', flexShrink: 0 }}>
        {[
          { label: 'Total Fleet Cost YTD', value: '$18,420', icon: DollarSign, color: T.accent },
          { label: 'Fuel Cost MTD',         value: '$2,340',  icon: Fuel,       color: '#3b82f6' },
          { label: 'Maintenance MTD',       value: '$1,180',  icon: Wrench,     color: '#eab308' },
        ].map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <kpi.icon size={11} style={{ color: kpi.color }} />
              <span style={{ fontSize: '9px', color: T.textMuted }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: T.text, lineHeight: 1 }}>{kpi.value}</div>
          </motion.div>
        ))}
      </div>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, marginBottom: '2px' }}>Cost per Vehicle — Fuel vs Maintenance</div>
        {COST_VEHICLES.map((v, i) => {
          const fuelPct = (v.fuel / MAX_COST) * 100
          const maintPct = (v.maint / MAX_COST) * 100
          return (
            <motion.div key={v.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
              style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '82px', flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: '9px', fontWeight: v.highlight ? '700' : '500', color: v.highlight ? '#ef4444' : T.text }}>{v.id}</div>
                <div style={{ fontSize: '8px', color: v.highlight ? '#ef4444' : T.textMuted }}>{v.name}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', height: '14px', borderRadius: '3px', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.04)', border: v.highlight ? '1px solid rgba(239,68,68,0.35)' : '1px solid transparent' }}>
                {v.fuel > 0 && (
                  <motion.div initial={{ width: 0 }} animate={{ width: `${fuelPct}%` }} transition={{ duration: 0.5, delay: 0.1 + i * 0.06 }}
                    style={{ backgroundColor: '#3b82f6', height: '100%' }} />
                )}
                <motion.div initial={{ width: 0 }} animate={{ width: `${maintPct}%` }} transition={{ duration: 0.5, delay: 0.15 + i * 0.06 }}
                  style={{ backgroundColor: v.highlight ? '#ef4444' : '#eab308', height: '100%' }} />
              </div>
              <div style={{ width: '42px', flexShrink: 0, fontSize: '9px', fontWeight: '600', color: v.highlight ? '#ef4444' : T.text, textAlign: 'right' }}>
                ${v.total.toLocaleString()}
              </div>
            </motion.div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px', paddingLeft: '89px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '9px', height: '9px', borderRadius: '2px', backgroundColor: '#3b82f6' }} /><span style={{ fontSize: '8px', color: T.textMuted }}>Fuel</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '9px', height: '9px', borderRadius: '2px', backgroundColor: '#eab308' }} /><span style={{ fontSize: '8px', color: T.textMuted }}>Maintenance</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '9px', height: '9px', borderRadius: '2px', backgroundColor: '#ef4444' }} /><span style={{ fontSize: '8px', color: T.textMuted }}>Highest cost</span></div>
        </div>
      </div>
    </>
  )
}

function MaintenanceScene() {
  return (
    <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ backgroundColor: T.accentBg }}>
            {['Asset', 'Service Type', 'Date', 'Cost', 'Mileage', 'Shop / Vendor', ''].map(h => (
              <th key={h} style={{ padding: '6px 9px', textAlign: h === 'Cost' || h === 'Mileage' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MAINTENANCE_RECORDS.map((r, i) => (
            <motion.tr key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              style={{ borderBottom: `1px solid ${T.border}` }}>
              <td style={{ padding: '6px 9px' }}>
                <div style={{ fontSize: '9px', fontWeight: '600', color: T.text }}>{r.asset}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{r.assetName}</div>
              </td>
              <td style={{ padding: '6px 9px', fontWeight: '500', color: T.text }}>{r.type}</td>
              <td style={{ padding: '6px 9px', color: T.textMuted, whiteSpace: 'nowrap' }}>{r.date}</td>
              <td style={{ padding: '6px 9px', textAlign: 'right', fontWeight: '600', color: '#22c55e' }}>${r.cost}</td>
              <td style={{ padding: '6px 9px', textAlign: 'right', color: T.textMuted }}>{r.miles.toLocaleString()}</td>
              <td style={{ padding: '6px 9px', color: T.textSecondary, fontSize: '9px' }}>{r.shop}</td>
              <td style={{ padding: '6px 9px' }}>
                <button style={{ padding: '2px 7px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', color: T.textMuted, fontSize: '9px', cursor: 'pointer' }}>Edit</button>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FuelScene() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        style={{ flexShrink: 0, padding: '9px 12px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={13} style={{ color: '#ef4444' }} />
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#ef4444', marginBottom: '2px' }}>Freddy alert — Fuel anomaly detected</div>
          <div style={{ fontSize: '10px', color: T.text, lineHeight: 1.4 }}>
            Jun 5 fill was <strong>3.4× above VEH-001 baseline</strong> (18.5 gal avg). Marcus Webb · 61.8 gal at $3.20/gal = $197.76. Possible off-vehicle fill or theft.
          </div>
        </div>
      </motion.div>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Date', 'Driver', 'Vehicle', 'Gallons', '$/gal', 'Total', 'Miles'].map(h => (
                <th key={h} style={{ padding: '6px 9px', textAlign: ['Gallons', '$/gal', 'Total', 'Miles'].includes(h) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FUEL_LOGS.map((f, i) => (
              <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: f.spike ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                <td style={{ padding: '6px 9px', color: T.textMuted }}>{f.date}</td>
                <td style={{ padding: '6px 9px', color: T.text }}>{f.driver}</td>
                <td style={{ padding: '6px 9px' }}>
                  <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '500', backgroundColor: T.accentBg, color: T.accent }}>{f.vehicle}</span>
                </td>
                <td style={{ padding: '6px 9px', textAlign: 'right', fontWeight: f.spike ? '700' : '400', color: f.spike ? '#ef4444' : T.text }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    {f.gallons}
                    {f.spike && <AlertTriangle size={9} style={{ color: '#ef4444' }} />}
                  </span>
                </td>
                <td style={{ padding: '6px 9px', textAlign: 'right', color: T.textMuted }}>${f.pricePgal}</td>
                <td style={{ padding: '6px 9px', textAlign: 'right', fontWeight: f.spike ? '700' : '400', color: f.spike ? '#ef4444' : T.text }}>${f.total.toFixed(2)}</td>
                <td style={{ padding: '6px 9px', textAlign: 'right', color: T.textMuted }}>{f.miles}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AlertsScene() {
  return (
    <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={12} style={{ color: T.accent }} />
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Service Due Alerts</span>
        </div>
        <span style={{ fontSize: '9px', fontWeight: '600', color: '#ef4444', padding: '2px 7px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)' }}>1 overdue</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0px' }}>
        {SERVICE_ALERTS.map((a, i) => (
          <motion.div key={a.asset} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: `1px solid ${T.border}`, backgroundColor: a.bg }}>
            <div style={{ width: '5px', height: '44px', borderRadius: '3px', backgroundColor: a.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>{a.asset}</span>
                <span style={{ fontSize: '9px', color: T.textSecondary }}>— {a.name}</span>
              </div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, marginBottom: '2px' }}>{a.task}</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>{a.miles}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {a.status === 'overdue' && (
                <div style={{ marginBottom: '5px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#ef4444' }}>OVERDUE</div>
                  <div style={{ fontSize: '9px', color: '#ef4444' }}>was {a.due}</div>
                </div>
              )}
              {a.status !== 'overdue' && (
                <div style={{ fontSize: '9px', color: a.color, fontWeight: '600', marginBottom: '5px' }}>Due {a.due}</div>
              )}
              <button style={{ padding: '4px 10px', border: `1px solid ${a.color}`, borderRadius: '5px', backgroundColor: 'transparent', color: a.color, fontSize: '9px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={9} />Schedule
              </button>
            </div>
          </motion.div>
        ))}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: T.textMuted }}>
            <CheckCircle size={11} style={{ color: '#22c55e' }} />
            2 more vehicles within service window — no action needed
          </div>
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview:    '1 · Cost dashboard — YTD KPI tiles + fuel vs maintenance bar chart per vehicle',
    maintenance: '2 · Maintenance records — shop, mileage, cost per service event with edit',
    fuel:        '3 · Fuel log — Freddy flags Jun 5 fill at 3.4× baseline; row highlighted red',
    alerts:      '4 · Service due alerts — overdue in red, upcoming in amber/green, one-click schedule',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Fleet Costs tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
