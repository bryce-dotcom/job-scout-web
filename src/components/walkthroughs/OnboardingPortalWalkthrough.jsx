// Onboarding Portal walkthrough — phone-first new hire flow.

import { motion, AnimatePresence } from 'framer-motion'
import {
  UserPlus, FileText, Shield, Landmark, BookMarked, PlayCircle,
  CheckCircle2, Send, Lock, PenLine,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/onboarding-portal.js'

export default function OnboardingPortalWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="W-4 · I-9 · deposit · handbook — all on a phone, all signed." />}
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
      <div style={{ width: '100%', maxWidth: 320, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 38px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '12px 16px', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserPlus size={16} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>{scene === 'invite' ? 'SMS · Job Scout' : 'New hire · Marcus'}</div>
          <div style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.85 }}>{stepLabel(scene)}</div>
        </div>

        <div style={{ flex: 1, padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scene === 'invite' && (
            <>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 12, background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>From: HHH Services · 8:14 AM</div>
                <div style={{ fontSize: 12, color: T.text }}>
                  Hi Marcus — welcome to the team. Tap here to finish onboarding:
                </div>
                <div style={{ fontSize: 11, color: T.accent, fontFamily: 'monospace', marginTop: 4 }}>job-scout.app/onboard/k7Rt9...</div>
              </motion.div>
              <Chip icon={Send} color={T.successDark} bg={T.successBg}>Magic link · 14 days valid</Chip>
            </>
          )}

          {scene === 'w4' && (
            <>
              <FormHeader icon={FileText} title="W-4 · Federal withholding" />
              <FormField label="Filing status">Single</FormField>
              <FormField label="Dependents under 17">0</FormField>
              <FormField label="Extra withholding/check">$0</FormField>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                <Chip icon={CheckCircle2} color={T.successDark} bg={T.successBg}>4 / 4 questions complete</Chip>
              </motion.div>
            </>
          )}

          {scene === 'i9' && (
            <>
              <FormHeader icon={Shield} title="I-9 Section 1 · Eligibility" />
              <FormField label="Citizenship">U.S. citizen</FormField>
              <FormField label="Address">488 W 200 N · Highland UT</FormField>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ padding: 10, background: T.bg, border: `1px dashed ${T.border}`, borderRadius: 7, textAlign: 'center' }}>
                <PenLine size={14} style={{ color: T.accent, marginBottom: 4 }} />
                <motion.svg width="120" height="28" viewBox="0 0 120 28">
                  <motion.path d="M 6 22 Q 18 6 32 18 T 60 12 T 90 22 L 114 8" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.4 }} />
                </motion.svg>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>Signed · IP + UA logged</div>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} style={{ padding: 8, background: T.warningBg, border: `1px solid ${T.warning}`, borderRadius: 7, fontSize: 10, color: T.text }}>
                <strong>Admin to-do:</strong> Section 2 (in-person ID inspection) due by May 30
              </motion.div>
            </>
          )}

          {scene === 'deposit' && (
            <>
              <FormHeader icon={Landmark} title="Direct deposit" />
              <FormField label="Bank">Chase Bank</FormField>
              <FormField label="Routing">**** 0021</FormField>
              <FormField label="Account">******* 4287</FormField>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ padding: 8, background: T.purpleBg, border: `1px solid ${T.purple}`, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={12} style={{ color: T.purple }} />
                <div style={{ fontSize: 10, color: T.text }}>pgcrypto encrypted · last 4 visible only</div>
              </motion.div>
            </>
          )}

          {scene === 'handbook' && (
            <>
              <FormHeader icon={BookMarked} title="Handbook + Training" />
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 8, background: T.bg, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} style={{ color: T.successDark }} />
                <div style={{ fontSize: 11, color: T.text, flex: 1 }}>HHH Employee Handbook 2026</div>
                <Chip>Signed</Chip>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} style={{ padding: 8, background: T.bg, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PlayCircle size={12} style={{ color: T.successDark }} />
                <div style={{ fontSize: 11, color: T.text, flex: 1 }}>Safety video (8 min)</div>
                <Chip>Watched</Chip>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ padding: 8, background: T.bg, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PlayCircle size={12} style={{ color: T.successDark }} />
                <div style={{ fontSize: 11, color: T.text, flex: 1 }}>Field Scout walkthrough (5 min)</div>
                <Chip>Watched</Chip>
              </motion.div>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }} style={{ marginTop: 6, padding: 14, background: T.successBg, border: `1.5px solid ${T.successDark}`, borderRadius: 9, textAlign: 'center' }}>
                <CheckCircle2 size={28} style={{ color: T.successDark, margin: '0 auto 4px' }} />
                <div style={{ fontSize: 13, fontWeight: 800, color: T.successDark }}>Onboarding complete</div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>5 signed PDFs in the vault</div>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FormHeader({ icon: Icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <Icon size={14} style={{ color: T.accent }} />
      <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{title}</div>
    </div>
  )
}
function FormField({ label, children }) {
  return (
    <div style={{ padding: 8, background: T.bg, borderRadius: 7 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, color: T.text, fontWeight: 600, marginTop: 2 }}>{children}</div>
    </div>
  )
}

function stepLabel(scene) {
  return ({ invite: '0/5', w4: '1/5', i9: '2/5', deposit: '3/5', handbook: '5/5' })[scene] || ''
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    invite:   '1. Admin sends magic link · SMS lands on phone',
    w4:       '2. W-4 fills itself · filing status · withholding',
    i9:       '3. I-9 Section 1 · signed on glass · admin to-do for Section 2',
    deposit:  '4. Direct deposit · pgcrypto encrypted · last 4 visible',
    handbook: '5. Handbook signed · training watched · 5 PDFs in vault',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Set template once · runs forever'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
