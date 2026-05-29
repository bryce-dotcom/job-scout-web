// Job Sections walkthrough.

import { motion } from 'framer-motion'
import { AnimatePresence } from 'framer-motion'
import {
  Layers, UserCheck, Clock, CheckCircle2, Percent, Hammer, AlertTriangle,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/job-sections.js'

const SECTIONS = [
  { name: 'Demo Day',      pct: 20, tech: 'Cole',    budget: 16, actual: 14, status: 'verified', day: 'Mon' },
  { name: 'Rough In',      pct: 40, tech: 'Marcus',  budget: 32, actual: 28, status: 'active',   day: 'Tue-Wed' },
  { name: 'Trim Out',      pct: 30, tech: 'Priya',   budget: 24, actual: 0,  status: 'pending',  day: 'Thu' },
  { name: 'Punch List',    pct: 10, tech: 'Cole',    budget: 8,  actual: 0,  status: 'pending',  day: 'Fri' },
]

export default function JobSectionsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Multi-phase jobs, tracked phase by phase." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const visible = scene === 'big' ? []
    : scene === 'split' ? SECTIONS.map(s => ({ ...s, tech: '', day: '', budget: 0, actual: 0, status: 'pending' }))
    : scene === 'assign' ? SECTIONS.map(s => ({ ...s, actual: 0, status: 'pending' }))
    : scene === 'progress' ? SECTIONS.map((s, i) => ({ ...s, actual: i < 2 ? s.actual : 0, status: i === 0 ? 'verified' : i === 1 ? 'active' : 'pending' }))
    : scene === 'verify' ? SECTIONS
    : []

  return (
    <ZachShell title="Job JOB-2147 · Sections" subtitle="Multi-phase job — split into trackable chunks." actionLabel="Add Section" actionIcon={Layers}>
      {scene === 'big' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, background: T.bgCard, border: `1.5px dashed ${T.border}`, borderRadius: 11, padding: 30 }}>
          <Hammer size={32} style={{ color: T.warning }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>2-week retrofit · 14 fixtures</div>
          <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 320, textAlign: 'center' }}>Tracking this as one row hides the truth — demo days are ahead of trim, punch list slips.</div>
        </div>
      )}

      {scene !== 'big' && visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visible.map((s, i) => (
            <SectionRow key={s.name} section={s} flashIn={scene === 'split' || (scene === 'progress' && i === 1)} highlight={scene === 'verify' && i === 1} />
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function SectionRow({ section: s, flashIn, highlight }) {
  const statusColor = s.status === 'verified' ? T.successDark : s.status === 'active' ? T.accent : T.textMuted
  const statusBg    = s.status === 'verified' ? T.successBg   : s.status === 'active' ? T.accentBg : 'transparent'
  const onPace = s.actual > 0 && s.actual <= s.budget
  return (
    <motion.div initial={flashIn ? { opacity: 0, x: -8 } : false} animate={{ opacity: 1, x: 0, borderColor: highlight ? T.successDark : T.border }} transition={{ duration: 0.4 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 110px 70px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: statusBg, color: statusColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{s.pct}%</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{s.name}</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{s.tech || 'unassigned'} · {s.day || 'no day'}</div>
      </div>
      <div style={{ fontSize: 10, color: T.textMuted }}>Budget {s.budget || '—'}h</div>
      <div style={{ fontSize: 10, color: onPace ? T.successDark : T.textMuted, fontWeight: 600 }}>
        Actual {s.actual || 0}h {onPace && '✓'}
      </div>
      <div style={{ padding: '3px 7px', background: statusBg, color: statusColor, borderRadius: 99, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
        {s.status}
      </div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    big:      '1. A 2-week job — too big to track as one row',
    split:    '2. Split into sections — Demo, Rough, Trim, Punch',
    assign:   '3. Assign lead tech, day, budgeted hours',
    progress: '4. Actuals tick up as techs clock in',
    verify:   '5. PM verifies completion → next phase opens',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'When to use sections'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
