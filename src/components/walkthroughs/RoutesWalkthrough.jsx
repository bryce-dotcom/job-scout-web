// Routes walkthrough — multi-stop dispatch.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Route, MapPin, Sparkles, Users, Calendar, ArrowRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/routes.js'

// 4 west-side stops. Coords roughly on a Highland/Lehi grid.
const STOPS_RAW = [
  { id: 1, name: 'Northbridge', x: 30, y: 40 },
  { id: 2, name: 'Solera Mfg',  x: 75, y: 70 },
  { id: 3, name: 'Granite',     x: 55, y: 25 },
  { id: 4, name: 'Cypress',     x: 20, y: 75 },
]
const STOPS_OPTIMIZED = [STOPS_RAW[2], STOPS_RAW[0], STOPS_RAW[3], STOPS_RAW[1]] // 3 → 1 → 4 → 2

export default function RoutesWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro, elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist"><SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} /></CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Multi-stop routing without OptimoRoute." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const stops = scene === 'optimize' || scene === 'assign' || scene === 'calendar' ? STOPS_OPTIMIZED : STOPS_RAW
  const showRoute = scene === 'group' || scene === 'optimize' || scene === 'assign' || scene === 'calendar'

  return (
    <ZachShell title="Routes · Tuesday" subtitle="Group jobs into optimized day-routes." actionLabel="Optimize" actionIcon={Sparkles}>
      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
        {/* Job list (left) */}
        <div style={{ width: 130, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>{scene === 'jobs' ? 'Unassigned' : 'In route'}</div>
          {stops.map((s, i) => (
            <motion.div key={s.id} initial={false} animate={{ opacity: 1 }} style={{ padding: 6, marginBottom: 4, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {showRoute && <div style={{ width: 14, height: 14, borderRadius: '50%', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{i + 1}</div>}
                <div style={{ fontSize: 10, color: T.text, fontWeight: 600 }}>{s.name}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Map (right) */}
        <div style={{ flex: 1, position: 'relative', background: '#e8e4d4', border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: 'hidden' }}>
          {/* Background "streets" */}
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d6cdb8" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Route polyline */}
          {showRoute && (
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
              <motion.polyline
                points={stops.map(s => `${s.x},${s.y}`).join(' ')}
                fill="none"
                stroke={T.accent}
                strokeWidth="0.7"
                strokeDasharray="2 1.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2 }}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {/* Pins */}
          {stops.map((s, i) => (
            <motion.div key={s.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.12 }} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%, -100%)' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: showRoute ? T.accent : T.purple, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, border: '2px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                {showRoute ? i + 1 : <MapPin size={11} />}
              </div>
            </motion.div>
          ))}

          {/* Route stats */}
          {showRoute && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ position: 'absolute', bottom: 10, left: 10, right: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7, padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Chip icon={Route} color={T.accent} bg={T.accentBg}>
                {scene === 'optimize' || scene === 'assign' || scene === 'calendar' ? '31 mi · 3h 20m' : '38 mi · 4h 10m'}
              </Chip>
              {(scene === 'assign' || scene === 'calendar') && <Chip icon={Users} color={T.purple} bg={T.purpleBg}>Crew · Cole + Marcus</Chip>}
              {scene === 'calendar' && <Chip icon={Calendar} color={T.successDark} bg={T.successBg}>Tue 5/26</Chip>}
            </motion.div>
          )}
        </div>
      </div>
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    jobs:     '1. Twelve unassigned jobs across the valley',
    group:    '2. Drag four west-side jobs into a route — 38 mi sweep',
    optimize: '3. Optimize reorders the stops — 31 mi · saves 7 miles',
    assign:   '4. Assign the crew and the day',
    calendar: '5. Calendar view shows every route, every crew',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Routes ride on top of Jobs'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
