// Utility Programs walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileCheck, Zap, Calendar, FileSignature, Lock, CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/utility-programs.js'

const PROGRAMS = [
  { id: 1, name: 'RMP Wattsmart',  state: 'UT', year: 2026, measures: 80, active: true },
  { id: 2, name: 'SRP Custom',     state: 'AZ', year: 2026, measures: 42, active: true },
  { id: 3, name: 'APS Solutions',  state: 'AZ', year: 2026, measures: 36, active: true },
  { id: 4, name: 'PG&E EnergySmart', state: 'CA', year: 2026, measures: 64, active: true },
  { id: 5, name: 'RMP Wattsmart',  state: 'UT', year: 2025, measures: 76, active: false },
]

export default function UtilityProgramsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Pre-loaded for the big utilities. Maintenance is light." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  if (scene === 'list') {
    return (
      <ZachShell title="Utility Programs" subtitle="Every active rebate program · pre-loaded" actionLabel="Add Program" actionIcon={FileCheck}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PROGRAMS.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 80px 80px 70px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${p.active ? T.border : '#e5d5b8'}`, borderRadius: 9, opacity: p.active ? 1 : 0.6 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.purpleBg, color: T.purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={13} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.name}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>{p.state} · {p.measures} measures</div>
              </div>
              <Chip icon={Calendar}>{p.year}</Chip>
              <div style={{ fontSize: 10, color: T.textMuted }}>source year</div>
              <div style={{ padding: '3px 7px', background: p.active ? T.successBg : T.bg, color: p.active ? T.successDark : T.textMuted, borderRadius: 99, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
                {p.active ? 'Active' : 'Locked'}
              </div>
            </motion.div>
          ))}
        </div>
      </ZachShell>
    )
  }

  // Other scenes — single program detail
  const p = PROGRAMS[0]
  return (
    <ZachShell title={`Utility Program · ${p.name}`} subtitle={`${p.state} · source year ${p.year}`} actionLabel="Save" actionIcon={CheckCircle2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Source year" value={p.year} icon={Calendar} highlight={scene === 'detail' || scene === 'lock'} />
          <Stat label="Measures" value={p.measures} icon={FileCheck} highlight={scene === 'measures'} />
          <Stat label="Status" value="Active" icon={CheckCircle2} />
          <Stat label="Form bound" value="Yes" icon={FileSignature} highlight={scene === 'form'} />
        </div>

        {(scene === 'measures' || scene === 'detail') && (
          <div style={{ flex: 1, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 10, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px', fontSize: 9, color: T.textMuted, fontWeight: 700, paddingBottom: 6, borderBottom: `1px solid ${T.border}`, textTransform: 'uppercase' }}>
              <div>Measure</div><div>Base W</div><div>Prop W</div><div>$/unit</div><div>Cap</div>
            </div>
            {[
              { c: 'LF-LED-2X4', base: 64, prop: 32, dpu: 45, cap: 45 },
              { c: 'HB-LED-HIGHBAY', base: 400, prop: 150, dpu: 80, cap: 80 },
              { c: 'WP-LED-WALL', base: 250, prop: 80, dpu: 120, cap: 120 },
              { c: 'TUBE-LED-T8', base: 32, prop: 14, dpu: 8, cap: 8 },
            ].map((row, i) => (
              <motion.div key={row.c} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px', fontSize: 10, color: T.text, padding: '5px 0', borderBottom: `1px dashed ${T.border}` }}>
                <div style={{ fontFamily: 'monospace' }}>{row.c}</div>
                <div>{row.base}W</div>
                <div>{row.prop}W</div>
                <div>${row.dpu}</div>
                <div>${row.cap}</div>
              </motion.div>
            ))}
          </div>
        )}

        {scene === 'form' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ flex: 1, background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 9, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', gap: 6 }}>
            <FileSignature size={28} style={{ color: T.purple, margin: '0 auto' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>RMP-WATTSMART-2026.pdf</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>Field map configured · auto-fills on every audit</div>
          </motion.div>
        )}

        {scene === 'lock' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ flex: 1, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', gap: 6 }}>
            <Lock size={28} style={{ color: T.textMuted, margin: '0 auto' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Old audits stay on source year 2025</div>
            <div style={{ fontSize: 10, color: T.textMuted, maxWidth: 280, margin: '0 auto' }}>Load 2027 measures → old audits keep their 2025 / 2026 numbers. No drift.</div>
          </motion.div>
        )}
      </div>
    </ZachShell>
  )
}

function Stat({ label, value, icon: Icon, highlight }) {
  return (
    <motion.div animate={{ borderColor: highlight ? T.accent : T.border }} style={{ padding: 8, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
      {Icon && <Icon size={14} style={{ color: T.accent }} />}
      <div>
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{value}</div>
      </div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    list:     '1. Every program you might run · pre-loaded',
    detail:   '2. RMP Wattsmart · source year 2026',
    measures: '3. Per-measure baseline, proposed wattage, $/unit',
    form:     '4. Official utility PDF bound · auto-fill ready',
    lock:     '5. Old audits stay locked to their source year',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Pre-loaded · light maintenance'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
