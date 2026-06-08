// Fleet walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Fleet.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Truck, Plus, Search, AlertTriangle, Calendar, Wrench, Settings, X } from 'lucide-react'
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
  { id: 5, asset_id: 'EQP-002', name: 'Boom Lift — JLG 45T',      type: 'Equipment', status: 'Out of Service', mileage: 2100,  next_pm: null,           overdue: false, icon: Settings },
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

function Stage({ scene }) {
  const fleet = scene === 'empty' ? [] : scene === 'pm' ? MOCK_FLEET.filter(a => a.overdue) : MOCK_FLEET

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck size={16} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Fleet</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={{ padding: '5px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textSecondary, cursor: 'pointer' }}><Calendar size={12} /></button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={11} />Add Asset
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <input readOnly placeholder="Search fleet..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
        </div>
        {['All Types', 'All Statuses'].map(label => (
          <select key={label} style={{ padding: '5px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.textSecondary }}>
            <option>{label}</option>
          </select>
        ))}
      </div>

      {/* Fleet grid */}
      {fleet.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <Truck size={36} style={{ color: T.textMuted, marginBottom: '10px' }} />
          <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No fleet assets found</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {fleet.map((asset, i) => {
            const sc = STATUS_COLORS[asset.status] || STATUS_COLORS['Available']
            const Icon = asset.icon
            return (
              <motion.div key={asset.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.25 }}
                style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${asset.overdue ? '#c25a5a' : T.border}`, padding: '14px', cursor: 'pointer' }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} style={{ color: T.accent }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{asset.name}</div>
                      <div style={{ fontSize: '9px', color: T.textMuted }}>{asset.asset_id} · {asset.type}</div>
                    </div>
                  </div>
                  <span style={{ padding: '2px 7px', borderRadius: '9px', fontSize: '9px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text, flexShrink: 0 }}>{asset.status}</span>
                </div>
                {/* PM overdue warning */}
                {asset.overdue && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'rgba(194,90,90,0.1)', borderRadius: '5px', marginBottom: '8px' }}>
                    <AlertTriangle size={11} style={{ color: '#c25a5a' }} />
                    <span style={{ fontSize: '9px', fontWeight: '600', color: '#c25a5a' }}>PM OVERDUE</span>
                  </div>
                )}
                {/* Stats */}
                <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: T.textMuted }}>
                  <span>{asset.mileage.toLocaleString()} mi</span>
                  {asset.next_pm && <span>PM: {asset.next_pm}</span>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:    '1 · Fleet page — Add Asset, type filter, status filter',
    grid:     '2 · Asset cards — icon, name, ID, type, status badge (Available/In Use/Maintenance)',
    pm:       '3 · PM Overdue — red border + AlertTriangle badge when preventive maintenance is due',
    calendar: '4 · Fleet Calendar shows assignments and maintenance on a week view',
    detail:   '5 · Click any asset → detail page with history, maintenance log, assignments',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Fleet tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
