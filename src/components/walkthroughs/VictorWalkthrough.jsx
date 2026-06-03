// Victor (AI photo verification) walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, Upload, Sparkles, Award, AlertTriangle, FileText,
  Camera, CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/victor.js'

export default function VictorWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="The pre-payroll sanity check that catches half-done work." />}
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
    <ZachShell title="Victor · JOB-2147 verification" subtitle="32 photos · 8 bays · threshold 80" actionLabel="Run Verify" actionIcon={ShieldCheck} actionHighlight={scene === 'analyze'}>
      {scene === 'upload' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Photos uploaded · 32 / 32</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
            {Array.from({ length: 32 }, (_, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.025 }} style={{ aspectRatio: '1', background: i % 2 === 0 ? '#1f2937' : '#0f1726', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Camera size={10} style={{ color: 'rgba(255,255,255,0.5)' }} />
                {i < 16 && <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#fbbf24', fontWeight: 700 }}>before</div>}
                {i >= 16 && <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: '#22c55e', fontWeight: 700 }}>after</div>}
              </motion.div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
            16 before · 16 after · uploaded from Field Scout
          </div>
        </div>
      )}

      {scene === 'analyze' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }} style={{ width: 64, height: 64, borderRadius: '50%', border: `4px solid ${T.purple}`, borderTopColor: 'transparent' }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Victor is reading the photos…</div>
          <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 320, textAlign: 'center' }}>
            Pairing before/after · counting fixtures · grading workmanship · checking against the lighting-retrofit checklist
          </div>
        </div>
      )}

      {scene === 'grade' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} style={{ width: 140, height: 140, borderRadius: '50%', background: `conic-gradient(${T.successDark} 94%, ${T.bg} 94%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ width: 116, height: 116, borderRadius: '50%', background: T.bgCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: T.successDark }}>94</div>
              <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>out of 100</div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: T.successBg, color: T.successDark, borderRadius: 99, fontWeight: 800, fontSize: 14 }}>
            <Award size={16} /> Grade A
          </motion.div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%' }}>
            {[
              { label: 'Coverage',    value: '8/8 bays', color: T.successDark },
              { label: 'Workmanship', value: '92/100',   color: T.successDark },
              { label: 'Pairings',    value: '15/16',    color: T.warning },
            ].map((r, i) => (
              <motion.div key={r.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.15 }} style={{ padding: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: r.color }}>{r.value}</div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{r.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {scene === 'flag' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.warning}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={18} style={{ color: T.warning }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>2 issues flagged</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Tech can re-shoot before leaving the site</div>
            </div>
          </div>
          {[
            { area: 'Bay 6 · end of row',  issue: 'no after photo',         severity: 'high' },
            { area: 'Fixture 4-2',          issue: 'visible misalignment',   severity: 'med' },
          ].map((row, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: 10, padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, marginBottom: 6, fontSize: 11, alignItems: 'center' }}>
              <div style={{ color: T.text, fontWeight: 700 }}>{row.area}</div>
              <div style={{ color: T.textMuted }}>{row.issue}</div>
              <Chip color={row.severity === 'high' ? T.danger : T.warning} bg={row.severity === 'high' ? 'rgba(239,68,68,0.12)' : T.warningBg}>{row.severity}</Chip>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.accentBg, borderRadius: 6, fontSize: 11, color: T.accent, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Camera size={12} /> Tech notified · re-shoot before clock out
          </motion.div>
        </div>
      )}

      {scene === 'report' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <FileText size={22} style={{ color: T.successDark }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Victor Report · JOB-2147</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Northbridge LED Retrofit · attached to job + portal</div>
            </div>
            <Chip color={T.successDark} bg={T.successBg}>Grade A · 94</Chip>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Field label="Photos analyzed" value="32" />
            <Field label="Areas covered"   value="8 / 8" />
            <Field label="Pairing rate"    value="94%" color={T.successDark} />
            <Field label="Workmanship"     value="92 / 100" color={T.successDark} />
          </div>
          <div style={{ padding: 10, background: T.bg, borderRadius: 6, fontSize: 11, color: T.text, lineHeight: 1.5 }}>
            <strong>Summary:</strong> Job complete with high coverage. Bay 6 missing after-photo (fixed by tech). Fixture 4-2 minor misalignment (noted, not blocking). Insurance, rebate paperwork, and disputes are covered by this report.
          </div>
        </div>
      )}
    </ZachShell>
  )
}

function Field({ label, value, color }) {
  return (
    <div style={{ padding: 8, background: T.bg, borderRadius: 7, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || T.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    upload:  '1. Tech uploads 32 photos · 16 before, 16 after',
    analyze: '2. Victor reads · pairs before/after · grades workmanship',
    grade:   '3. Score 94 · Grade A · per-dimension breakdown',
    flag:    '4. Flags 2 issues · tech re-shoots before clocking out',
    report:  '5. Report attached to job + customer portal',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Unlock Victor · set threshold'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
