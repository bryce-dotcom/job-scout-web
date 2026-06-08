// Routes walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/RoutesPage.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Route, Plus, Search, Calendar, Pencil, Trash2, X, Truck, User, MapPin } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/routes.js'

const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
}

const MOCK_ROUTES = [
  { id: 1, route_id: 'RTE-2026-061', date: 'Jun 9, 2026', team: 'Doug Anderson', total_distance: '42 mi',  total_time: '3h 20m' },
  { id: 2, route_id: 'RTE-2026-060', date: 'Jun 8, 2026', team: 'Crew 2',        total_distance: '28 mi',  total_time: '2h 45m' },
  { id: 3, route_id: 'RTE-2026-059', date: 'Jun 7, 2026', team: 'Doug Anderson', total_distance: '61 mi',  total_time: '4h 10m' },
]

export default function RoutesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your routes are dispatched." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showModal = scene === 'new'
  const routes = scene === 'empty' ? [] : MOCK_ROUTES

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '14px 16px', gap: '10px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Route size={16} style={{ color: T.accent }} />
          <span style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>Routes</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: T.bgCard, color: T.text, border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
            <Calendar size={12} />Calendar View
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: T.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={12} />Add Route
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder="Search routes..." style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px 6px 24px', border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '11px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
      </div>

      {/* Grid or empty */}
      {routes.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <Route size={36} style={{ color: T.textMuted, marginBottom: '10px', opacity: 0.5 }} />
          <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No routes found. Create your first route.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', alignContent: 'start', overflowY: 'auto' }}>
          {routes.map((route, i) => (
            <motion.div
              key={route.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.3 }}
              style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, padding: '14px' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>{route.route_id}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button style={{ padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', color: T.textSecondary, cursor: 'pointer' }}><Pencil size={10} /></button>
                  <button style={{ padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={10} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: T.textSecondary }}>
                  <Calendar size={11} />{route.date}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: T.textSecondary }}>
                  <User size={11} />{route.team}
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: T.textMuted }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={10} />{route.total_distance}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Route size={10} />{route.total_time}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Route modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 10 }}
        >
          <motion.div initial={{ scale: 0.96, y: -10 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.3 }}
            style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '300px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Route</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[['Route ID', 'RTE-2026-062'], ['Date', 'Jun 10, 2026'], ['Team', 'Doug Anderson'], ['Total Distance', '38 mi'], ['Total Time', '3h 00m']].map(([label, value]) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{label}</label>
                  <div style={{ padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{value}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}>Add Route</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:    '1 · Routes page — Route icon empty state, Calendar View + Add Route buttons',
    plan:     '2 · Add Route modal — route ID, date, team, total distance, total time',
    route:    '3 · Route cards grid — ID, date, team, distance, time, Edit/Delete per card',
    optimize: '4 · Calendar View shows routes on a scheduling calendar by date',
    dispatch: '5 · Each route links to today\'s jobs so the crew knows exactly where to go',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to set up routes'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
