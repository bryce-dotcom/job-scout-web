// Quote Follow-ups walkthrough — automated email drip.

import { motion, AnimatePresence } from 'framer-motion'
import { Send, Mail, Sparkles, CheckCircle2, Clock } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/quote-followups.js'

export default function QuoteFollowupsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Three nudges, then it stops. No more chasing." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const NUDGES = [
    { day: 'Day 0',  subject: 'Your quote from HHH Services',           sender: true,  state: 'sent', date: 'Mon May 20' },
    { day: 'Day 3',  subject: 'Quick check — did this hit your inbox?',  sender: false, state: scene === 'sent' ? 'queued' : 'sent', date: 'Thu May 23' },
    { day: 'Day 7',  subject: 'A thought — also want the fert program?', sender: false, state: scene === 'sent' || scene === 'nudge1' ? 'queued' : 'sent', date: 'Mon May 27', arnie: true },
    { day: 'Day 14', subject: 'Last nudge — still interested?',          sender: false, state: scene === 'signed' ? 'cancelled' : scene === 'nudge3' ? 'sent' : 'queued', date: 'Mon Jun 3' },
  ]

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>Quote Follow-ups</h1>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>Auto-drip for quotes that haven't been signed yet</p>
      </div>

      {/* Quote header card */}
      <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Estimate #EST-247 · Sarah Chen</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>$5,033 · sent May 20</div>
        </div>
        <motion.div
          animate={scene === 'signed' ? { scale: [0.9, 1.05, 1] } : {}}
          transition={{ duration: 0.5 }}
          style={{ padding: '4px 10px', background: scene === 'signed' ? T.successBg : T.warningBg, color: scene === 'signed' ? T.successDark : '#a16207', borderRadius: 99, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          {scene === 'signed' ? <><CheckCircle2 size={12} /> Signed</> : <><Clock size={12} /> Unsigned</>}
        </motion.div>
      </div>

      {/* Drip timeline */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
        {NUDGES.map((n, i) => (
          <NudgeCard key={i} nudge={n} highlight={(scene === 'nudge1' && i === 1) || (scene === 'nudge2' && i === 2) || (scene === 'nudge3' && i === 3) || (scene === 'signed' && i === 3)} />
        ))}
      </div>
    </div>
  )
}

function NudgeCard({ nudge: n, highlight }) {
  const stateBg = n.state === 'sent' ? T.successBg : n.state === 'cancelled' ? 'rgba(125,138,127,0.1)' : T.bg
  const stateColor = n.state === 'sent' ? T.successDark : n.state === 'cancelled' ? T.textMuted : T.textSecondary
  return (
    <motion.div
      animate={highlight ? { borderColor: T.accent, scale: [1, 1.02, 1] } : { borderColor: T.border, scale: 1 }}
      transition={{ scale: { repeat: highlight ? Infinity : 0, duration: 1.4 } }}
      style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>{n.day}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{n.subject}</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{n.date}{n.arnie && (
          <span style={{ marginLeft: 8, color: T.purple, fontWeight: 600 }}>
            <Sparkles size={9} style={{ display: 'inline', verticalAlign: '-1px' }} /> Arnie add-on suggestion
          </span>
        )}</div>
      </div>
      <div style={{ padding: '3px 8px', background: stateBg, color: stateColor, borderRadius: 99, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
        {n.state}
      </div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    sent:   '1. Quote sent. Customer hasn\'t replied.',
    nudge1: '2. Day 3 — polite nudge auto-sent',
    nudge2: '3. Day 7 — Arnie suggests a relevant add-on',
    nudge3: '4. Day 14 — last nudge, then stops',
    signed: '5. Customer signs → all future nudges cancel automatically',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to turn it on'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
