// Job Board (PM Setter) walkthrough — drag-to-schedule.

import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, Users, AlertTriangle, Calendar,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/job-board.js'

const CREWS = ['Cole', 'Marcus', 'Priya']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// Hours booked per crew/day. Empty = 0.
const initialGrid = {
  Cole: { Mon: 8, Tue: 0, Wed: 6, Thu: 0, Fri: 4 },
  Marcus: { Mon: 0, Tue: 4, Wed: 0, Thu: 8, Fri: 0 },
  Priya: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 },
}

const dropGrid = JSON.parse(JSON.stringify(initialGrid))
dropGrid.Cole.Tue = 14   // big drop

const overGrid = JSON.parse(JSON.stringify(dropGrid))
overGrid.Cole.Tue = 20   // overbook attempt

const shuffleGrid = JSON.parse(JSON.stringify(dropGrid))
shuffleGrid.Marcus.Wed = 8
shuffleGrid.Priya.Thu = 8

export default function JobBoardWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="One screen, the whole week, every crew." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const grid = scene === 'guardrail' ? overGrid
    : scene === 'shuffle' ? shuffleGrid
    : scene === 'overview' ? shuffleGrid
    : (scene === 'drop' ? dropGrid : initialGrid)

  const unassigned = scene === 'unassigned' ? 20 : 14

  return (
    <ZachShell title="Job Board · Week of May 24" subtitle="Drag sections onto crews and days." actionLabel="Optimize Week" actionIcon={ClipboardList} filterChips={[{ icon: Users, label: '3 crews on duty' }, { icon: Calendar, label: 'Week view' }]}>
      <div style={{ display: 'flex', gap: 10, flex: 1, overflow: 'hidden' }}>
        {/* Unassigned rail */}
        <div style={{ width: 110, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Unassigned</div>
          <motion.div animate={{ scale: scene === 'unassigned' ? [1, 1.04, 1] : 1 }} transition={{ repeat: scene === 'unassigned' ? Infinity : 0, duration: 1.5 }} style={{ padding: 8, background: T.warningBg, border: `1.5px solid ${T.warning}`, borderRadius: 7 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.warning, textAlign: 'center' }}>{unassigned}</div>
            <div style={{ fontSize: 9, color: T.textSecondary, textAlign: 'center', textTransform: 'uppercase', fontWeight: 600 }}>sections</div>
          </motion.div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ padding: 6, fontSize: 10, color: T.textMuted, fontWeight: 600 }}>Crew</div>
            {DAYS.map(d => <div key={d} style={{ padding: 6, fontSize: 10, color: T.textMuted, fontWeight: 700, textAlign: 'center' }}>{d}</div>)}
          </div>
          {CREWS.map(crew => (
            <div key={crew} style={{ display: 'grid', gridTemplateColumns: '70px repeat(5, 1fr)', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ padding: '8px 6px', fontSize: 11, color: T.text, fontWeight: 700 }}>{crew}</div>
              {DAYS.map(d => <Cell key={d} hours={grid[crew][d]} highlight={scene === 'drop' && crew === 'Cole' && d === 'Tue'} overbook={scene === 'guardrail' && crew === 'Cole' && d === 'Tue' && grid[crew][d] > 16} />)}
            </div>
          ))}
        </div>
      </div>
    </ZachShell>
  )
}

function Cell({ hours, highlight, overbook }) {
  const allotted = 16
  const pct = Math.min(100, (hours / allotted) * 100)
  const color = overbook ? T.danger : hours > allotted ? T.danger : hours >= 12 ? T.warning : hours > 0 ? T.successDark : T.textMuted
  const bg    = overbook ? 'rgba(239,68,68,0.15)' : hours > 0 ? T.bg : 'transparent'
  return (
    <motion.div animate={{ scale: highlight ? [1, 1.06, 1] : 1, backgroundColor: bg }} transition={{ duration: 0.6 }} style={{ margin: 4, padding: 6, border: `1.5px solid ${overbook ? T.danger : highlight ? T.accent : T.border}`, borderRadius: 6, minHeight: 40 }}>
        {hours > 0 ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color, textAlign: 'center' }}>{hours}h</div>
            <div style={{ height: 3, background: T.bg, borderRadius: 99, marginTop: 3 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
            </div>
            {overbook && <div style={{ fontSize: 8, color: T.danger, textAlign: 'center', marginTop: 2, fontWeight: 700 }}>OVERBOOKED</div>}
          </>
        ) : (
          <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'center', paddingTop: 8 }}>—</div>
        )}
      </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    unassigned: '1. Twenty unassigned sections sit in the queue',
    drop:       '2. Drag onto Cole/Tuesday — slot fills to 14h',
    guardrail:  '3. Try to overbook → red bar, confirmation required',
    shuffle:    '4. Shuffle work across crews and days',
    overview:   '5. One screen, the whole week, every crew',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Sections drive the board'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
