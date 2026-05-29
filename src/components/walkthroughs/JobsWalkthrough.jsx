// Jobs walkthrough — every won quote becomes a tracked job.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase, FileCheck, CheckCircle2, Camera, DollarSign, ArrowRight,
  Clock, Hammer, PenLine, CircleDollarSign,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/jobs.js'

const JOB = {
  id: 'JOB-2147',
  customer: 'Sarah Chen · Northbridge Industries',
  address: '6395 W 10400 N, Highland UT',
  lines: 14,
  total: 18420,
  materials: 6800,
  labor: 4200,
  expenses: 380,
}

export default function JobsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Lead → quote → job → invoice. One chain, no copy-paste." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <ZachShell title="Jobs" subtitle="Every won quote becomes a tracked job." actionLabel="New Job" actionIcon={Briefcase}>
      {scene === 'won' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, height: '100%' }}>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14, minWidth: 180 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>Estimate · WON</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4 }}>EST-2147</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{JOB.customer}</div>
            <div style={{ marginTop: 6 }}><Chip icon={FileCheck} color={T.successDark} bg={T.successBg}>Signed</Chip></div>
          </motion.div>
          <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <ArrowRight size={28} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14, minWidth: 220, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: 'uppercase' }}>Job · ACTIVE</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4 }}>{JOB.id}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{JOB.customer}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 5 }}>
              <Chip icon={Briefcase}>{JOB.lines} lines</Chip>
              <Chip icon={DollarSign}>${JOB.total.toLocaleString()}</Chip>
            </div>
          </motion.div>
        </div>
      )}

      {scene === 'detail' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14, height: '100%' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{JOB.id} · {JOB.customer}</div>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 10 }}>{JOB.address}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['Demo + tear-out', 'Install 4-ft LED tubes', 'Wallpack retrofit', '14 fixtures total'].map((line, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} style={{ padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, color: T.text }}>
                <div style={{ fontWeight: 600 }}>{line}</div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>carried from quote</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {scene === 'costing' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 16, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>Live cost rollup</div>
          {[
            { label: 'Materials',   amount: JOB.materials, icon: Briefcase, color: T.accent },
            { label: 'Labor',       amount: JOB.labor,     icon: Hammer,    color: T.purple },
            { label: 'Expenses',    amount: JOB.expenses,  icon: DollarSign, color: T.warning },
          ].map((row, i) => (
            <motion.div key={row.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 6, background: T.bg, borderRadius: 7 }}>
              <row.icon size={14} style={{ color: row.color }} />
              <div style={{ flex: 1, fontSize: 12, color: T.text, fontWeight: 600 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 700 }}>${row.amount.toLocaleString()}</div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ borderTop: `1.5px solid ${T.border}`, marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.successDark }}>Gross margin</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.successDark }}>$7,040 · 38%</div>
          </motion.div>
        </div>
      )}

      {scene === 'complete' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, height: '100%' }}>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 16, maxWidth: 260, textAlign: 'center' }}>
            <Camera size={26} style={{ color: T.accent, margin: '0 auto 8px' }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>Field Scout</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4 }}>Job complete</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>4 photos · signed on glass</div>
            <div style={{ marginTop: 8, padding: 8, background: T.successBg, color: T.successDark, fontSize: 10, fontWeight: 700, borderRadius: 5 }}>
              <PenLine size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Signature captured · audit logged
            </div>
          </motion.div>
        </div>
      )}

      {scene === 'close' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 11, padding: 20, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8 }}>
          <CircleDollarSign size={40} style={{ color: T.successDark }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: T.successDark }}>Invoice paid · Job closed</div>
          <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 260 }}>Trigger fired automatically when invoice paid_total met total_amount.</div>
          <Chip icon={CheckCircle2} color={T.successDark} bg={T.successBg}>Lifecycle complete</Chip>
        </div>
      )}
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    won:      '1. Quote signed → job auto-created',
    detail:   '2. Lines, photos, notes all carry over',
    costing:  '3. Live materials + labor + margin rollup',
    complete: '4. Tech taps Complete, signs on glass',
    close:    '5. Customer pays → job auto-closes',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Almost no setup'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
