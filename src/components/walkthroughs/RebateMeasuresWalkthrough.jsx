// Rebate Measures walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Coins, Search, Calculator, AlertCircle, Calendar, Sparkles,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/rebate-measures.js'

const MEASURES = [
  { code: 'LF-LED-2X4',     desc: '2x4 fluorescent → LED',  base: 64,  prop: 32,  dpu: 45,  cap: 45,   capProj: null },
  { code: 'HB-LED-HIGHBAY', desc: 'Metal halide → LED highbay', base: 400, prop: 150, dpu: 80, cap: 80, capProj: 25000 },
  { code: 'WP-LED-WALL',    desc: 'HPS → LED wallpack',     base: 250, prop: 80,  dpu: 120, cap: 120,  capProj: null },
  { code: 'TUBE-LED-T8',    desc: 'T8 → LED tube',          base: 32,  prop: 14,  dpu: 8,   cap: 8,    capProj: null },
  { code: 'DOWN-LED-CFL',   desc: 'CFL downlight → LED',    base: 26,  prop: 10,  dpu: 15,  cap: 15,   capProj: null },
]

export default function RebateMeasuresWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Edit a row, the rebate math updates everywhere." />}
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
    <ZachShell title="Rebate Measures · RMP Wattsmart 2026" subtitle="80 prescriptive measures · cap math built in" actionLabel="Add Measure" actionIcon={Coins} filterChips={[{ icon: Sparkles, label: 'Source year 2026' }]}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 60px 60px 70px', fontSize: 9, color: T.textMuted, fontWeight: 700, padding: '6px 10px', borderBottom: `1.5px solid ${T.border}`, textTransform: 'uppercase' }}>
          <div>Code</div><div>Description</div><div>Base W</div><div>Prop W</div><div>$/unit</div><div>Cap</div>
        </div>
        {MEASURES.map((m, i) => (
          <motion.div key={m.code} initial={scene === 'table' ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0, backgroundColor: scene === 'row' && i === 1 ? T.accentBg : 'transparent', borderColor: (scene === 'cap' || scene === 'audit') && i === 1 ? T.accent : T.border }} transition={{ delay: i * 0.08 }} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 60px 60px 70px', fontSize: 10, color: T.text, padding: '8px 10px', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, color: T.accent }}>{m.code}</div>
            <div style={{ fontSize: 11 }}>{m.desc}</div>
            <div>{m.base}W</div>
            <div>{m.prop}W</div>
            <div style={{ fontWeight: 700 }}>${m.dpu}</div>
            <div>
              <div style={{ fontSize: 9 }}>${m.cap}/u</div>
              {m.capProj && <div style={{ fontSize: 8, color: T.textMuted }}>${(m.capProj/1000).toFixed(0)}k proj</div>}
            </div>
          </motion.div>
        ))}
      </div>

      {scene === 'audit' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10, padding: 10, background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 4 }}>Audit JOB-2147 · 142 highbays</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>Match → <span style={{ color: T.accent, fontFamily: 'monospace' }}>HB-LED-HIGHBAY</span> · 142 × $80 = $11,360</div>
        </motion.div>
      )}

      {scene === 'cap' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10, padding: 10, background: T.warningBg, border: `1.5px solid ${T.warning}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} style={{ color: T.warning }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Cap applied: $25,000 project max</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>Project rebate calculated at $26,400 → clipped to $25,000.</div>
          </div>
        </motion.div>
      )}

      {scene === 'update' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10, padding: 10, background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} style={{ color: T.purple }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>2027 measures loaded</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>Old audits stay locked to their source year. No retroactive number drift.</div>
          </div>
        </motion.div>
      )}
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    table:  '1. 80 measures for RMP Wattsmart alone',
    row:    '2. Per row: baseline, proposed, $/unit, cap',
    audit:  '3. Audit matches the measure, math is automatic',
    cap:    '4. Per-project caps applied automatically',
    update: '5. New year measures? Old audits stay locked',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Ships pre-loaded · light maintenance'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
