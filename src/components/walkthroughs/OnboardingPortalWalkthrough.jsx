// Onboarding Portal walkthrough — rebuilt to Prospect Scout standard.
// Source: src/lib/featureKnowledge/onboarding-portal.js
// Phone-first: W-4 → I-9 → DD → handbook. Magic-link auth. ESIGN.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Send, CheckCircle, FileText, CreditCard, BookOpen, Lock } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/onboarding-portal.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const STEPS = [
  { id: 1, icon: FileText,  label: 'W-4 Federal Withholding',  status: 'complete' },
  { id: 2, icon: FileText,  label: 'State Withholding (TC-40A)',status: 'complete' },
  { id: 3, icon: CreditCard,label: 'Direct Deposit',            status: 'active'   },
  { id: 4, icon: FileText,  label: 'I-9 Section 1',             status: 'pending'  },
  { id: 5, icon: BookOpen,  label: 'Handbook Acknowledgment',   status: 'pending'  },
]

export default function OnboardingPortalWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#e8e4d8', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="New hires onboarded without paperwork." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showSend = scene === 'send'
  const showPortal = scene === 'portal' || scene === 'step' || scene === 'sign'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', backgroundColor: T.bg, overflow: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: '360px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Admin: Send onboarding link */}
        {showSend && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <UserPlus size={16} style={{ color: T.accent }} />
              <span style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>Send Onboarding Link</span>
            </div>
            {[['Employee', 'Jennifer Walsh'], ['Email', 'jwalsh@acme.com'], ['Role', 'Field Tech']].map(([l, v]) => (
              <div key={l} style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '2px' }}>{l}</div>
                <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
              </div>
            ))}
            <button style={{ width: '100%', padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}>
              <Send size={13} />Send Magic Link
            </button>
          </motion.div>
        )}

        {/* New hire portal */}
        {showPortal && (
          <>
            {/* Progress header */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '2px' }}>Welcome, Jennifer! 👋</div>
              <div style={{ fontSize: '11px', color: T.textMuted }}>Complete your onboarding · Step 3 of 5</div>
              <div style={{ marginTop: '8px', height: '6px', backgroundColor: T.bg, borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: '60%', height: '100%', backgroundColor: T.accent, borderRadius: '3px' }} />
              </div>
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {STEPS.map((step, i) => {
                const Icon = step.icon
                const isActive = step.status === 'active'
                const isDone = step.status === 'complete'
                return (
                  <motion.div key={step.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.25 }}
                    style={{ backgroundColor: isActive ? T.accentBg : T.bgCard, border: `1px solid ${isActive ? T.accent : T.border}`, borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', opacity: step.status === 'pending' ? 0.6 : 1 }}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: isDone ? 'rgba(34,197,94,0.12)' : isActive ? T.accentBg : T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isDone ? <CheckCircle size={14} style={{ color: '#22c55e' }} /> : <Icon size={13} style={{ color: isActive ? T.accent : T.textMuted }} />}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: isActive ? '600' : '400', color: isActive ? T.text : isDone ? T.textSecondary : T.textMuted }}>{step.label}</span>
                    {isActive && <span style={{ marginLeft: 'auto', fontSize: '9px', color: T.accent, fontWeight: '600' }}>In progress →</span>}
                    {step.status === 'pending' && <Lock size={10} style={{ marginLeft: 'auto', color: T.textMuted }} />}
                  </motion.div>
                )
              })}
            </div>

            {/* Active step: Direct Deposit */}
            {scene === 'step' && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: T.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CreditCard size={13} style={{ color: T.accent }} />Direct Deposit
                </div>
                {[['Bank Name', 'Chase Bank'], ['Routing #', '021000021'], ['Account #', '••••••4892']].map(([l, v]) => (
                  <div key={l} style={{ marginBottom: '6px' }}>
                    <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '2px' }}>{l}</div>
                    <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '10px', color: T.text }}>{v}</div>
                  </div>
                ))}
                <button style={{ width: '100%', padding: '9px', border: 'none', borderRadius: '7px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Save Direct Deposit</button>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    send:   '1 · Admin sends magic link — name + email + role, one button, no app install needed',
    portal: '2 · New hire opens on phone — "Welcome, Jennifer!" + 5-step progress wizard',
    step:   '3 · Each step guides them through: W-4 → State → Direct Deposit → I-9 → Handbook',
    sign:   '4 · ESIGN-compliant signature captured per form — IP, timestamp, doc hash logged',
    done:   '5 · Admin gets notified when onboarding is complete — HR docs locked, ready for payroll',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How the Onboarding Portal works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
