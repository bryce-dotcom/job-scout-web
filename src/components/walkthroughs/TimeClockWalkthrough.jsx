// Time Clock walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, MapPin, Briefcase, Pause, Play, CheckCircle2, Edit2,
  ShieldCheck, History,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/time-clock.js'

export default function TimeClockWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="GPS-stamped · job-linked · audit-trailed." />}
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
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', justifyContent: 'center' }}>
      {scene !== 'adjust' ? (
        <div style={{ width: '100%', maxWidth: 320, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 38px rgba(0,0,0,0.15)' }}>
          <div style={{ padding: '12px 16px', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Time Clock</div>
            <div style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.85 }}>Cole</div>
          </div>
          <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scene === 'in' && (
              <>
                <div style={{ textAlign: 'center', padding: 14 }}>
                  <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} style={{ width: 90, height: 90, margin: '0 auto', borderRadius: '50%', background: T.successBg, border: `4px solid ${T.successDark}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={36} style={{ color: T.successDark }} />
                  </motion.div>
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: T.successDark }}>Clocked in · 8:04 AM</div>
                </div>
                <div style={{ padding: 8, background: T.bg, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={11} style={{ color: T.accent }} />
                  <div style={{ fontSize: 10, color: T.text }}>40.4276°N · -111.7987°W · Highland UT</div>
                </div>
              </>
            )}
            {scene === 'work' && (
              <>
                <div style={{ padding: 14, background: T.accentBg, border: `1.5px solid ${T.accent}`, borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Briefcase size={12} style={{ color: T.accent }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: 'uppercase' }}>Working on</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>JOB-2147 · Northbridge</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Section: Rough In · 14h budgeted</div>
                </div>
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 8, background: T.bg, borderRadius: 7, fontSize: 10, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={11} style={{ color: T.successDark }} />
                  Labor cost rolling into JOB-2147 in real time
                </motion.div>
              </>
            )}
            {scene === 'lunch' && (
              <>
                <div style={{ textAlign: 'center', padding: 14 }}>
                  <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ width: 90, height: 90, margin: '0 auto', borderRadius: '50%', background: T.warningBg, border: `4px solid ${T.warning}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pause size={36} style={{ color: T.warning }} />
                  </motion.div>
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: T.warning }}>On lunch · 12:00 PM</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Auto-resumes when you punch back in</div>
                </div>
                <button style={{ padding: '10px 14px', background: T.successDark, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Play size={13} /> Resume work
                </button>
              </>
            )}
            {scene === 'out' && (
              <>
                <div style={{ textAlign: 'center', padding: 14 }}>
                  <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} style={{ width: 90, height: 90, margin: '0 auto', borderRadius: '50%', background: T.bg, border: `4px solid ${T.textMuted}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={36} style={{ color: T.successDark }} />
                  </motion.div>
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: T.text }}>Clocked out · 4:52 PM</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>8.3 hours on JOB-2147</div>
                </div>
                <div style={{ padding: 8, background: T.successBg, borderRadius: 7, fontSize: 10, color: T.successDark, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                  <ShieldCheck size={11} />
                  Verified · landed in time log
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 420, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Edit2 size={14} style={{ color: T.accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Admin · Time Log adjustment</div>
          </div>
          <div style={{ padding: 10, background: T.bg, borderRadius: 7 }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Cole · May 27</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted }}>was</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, textDecoration: 'line-through' }}>8:04 → never clocked out</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', color: T.accent }}>→</div>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted }}>now</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.successDark }}>8:04 → 4:52 PM</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 10, background: T.bg, borderRadius: 7 }}>
            <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>Reason</div>
            <div style={{ fontSize: 11, color: T.text }}>Forgot to clock out · confirmed with tech</div>
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ padding: 8, background: T.purpleBg, border: `1px solid ${T.purple}`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: T.text }}>
            <History size={11} style={{ color: T.purple }} />
            Audit log captured · admin · 5/28 9:14 AM
          </motion.div>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    in:     '1. Tap Clock In · GPS + address stamped',
    work:   '2. Pick the job · labor rolls into costing live',
    lunch:  '3. Lunch break · auto-resumes on punch-in',
    out:    '4. Clock out · GPS stamp · hours land in log',
    adjust: '5. Admin adjusts missed punches · audit captured',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'On by default · GPS optional'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
