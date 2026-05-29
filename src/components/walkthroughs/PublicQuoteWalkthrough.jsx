// Public Quote Landing walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import { Globe, MapPin, Phone, Send, CheckCircle2, UserPlus, ArrowRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/public-quote.js'

const PHONE_TYPED = '(801) 555-0188'
const NAME_TYPED = 'Marcus Reeves'

export default function PublicQuoteWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every submission lands in your lead pipeline." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  if (scene === 'lead' || scene === 'route') return <PipelineLanding scene={scene} />

  const typedName = scene === 'fill' ? NAME_TYPED.slice(0, Math.min(NAME_TYPED.length, Math.floor(sceneElapsed / 55))) : NAME_TYPED
  const typedPhone = scene === 'fill' && sceneElapsed > 1700 ? PHONE_TYPED.slice(0, Math.min(PHONE_TYPED.length, Math.floor((sceneElapsed - 1700) / 70))) : (scene === 'submit' ? PHONE_TYPED : '')

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 28px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, background: T.accent, color: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>HHH Services, LLC</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>Request a free quote · 24 hr response</div>
        </div>

        {scene === 'visit' && (
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
            <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} style={{ fontSize: 32 }}>
              👋
            </motion.div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Welcome from your ad</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>job-scout.app/quote/hhh-services</div>
          </div>
        )}

        {(scene === 'fill' || scene === 'submit') && (
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FieldRow label="Your name">
              <FormInputMini value={typedName} placeholder="Full name" cursor={typedName.length < NAME_TYPED.length && scene === 'fill'} />
            </FieldRow>
            <FieldRow label="Phone">
              <FormInputMini value={typedPhone} placeholder="(555) 555-5555" cursor={scene === 'fill' && sceneElapsed > 1700 && typedPhone.length < PHONE_TYPED.length} />
            </FieldRow>
            <FieldRow label="Address (optional)">
              <FormInputMini value={scene === 'submit' ? '6395 W 10400 N Highland UT' : ''} placeholder="Property address" />
            </FieldRow>
            <FieldRow label="What do you need?">
              <FormInputMini value={scene === 'submit' ? 'LED retrofit for warehouse' : ''} placeholder="Tell us briefly" />
            </FieldRow>
            <motion.button
              animate={scene === 'submit' ? { scale: [0.95, 1] } : { scale: 1 }}
              style={{ marginTop: 6, padding: '12px 16px', background: T.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            >
              <Send size={13} /> Request my quote
            </motion.button>
          </div>
        )}

        {scene === 'submit' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }} style={{ position: 'absolute', inset: 16, background: T.successBg, border: `1.5px solid ${T.success}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
            <CheckCircle2 size={36} style={{ color: T.successDark }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: T.successDark }}>Thanks!</div>
            <div style={{ fontSize: 11, color: T.text, maxWidth: 220 }}>We'll text you within 24 hours. Urgent? Call <strong>(801) 999-8430</strong>.</div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}
function FormInputMini({ value, placeholder, cursor }) {
  return (
    <div style={{ padding: '9px 11px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 12, color: T.text, minHeight: 14 }}>
      {value || value === 0 ? (<>{value}{cursor && (<motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ display: 'inline-block', width: 1.5, height: 11, background: T.accent, marginLeft: 2, transform: 'translateY(2px)' }} />)}</>) : (<span style={{ color: T.textMuted, fontStyle: 'italic' }}>{placeholder}</span>)}
    </div>
  )
}

function PipelineLanding({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14, maxWidth: 200, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Public quote</div>
        <div style={{ fontSize: 11, color: T.text }}>job-scout.app/quote/hhh-services</div>
        <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted }}>Submission · just now</div>
      </motion.div>
      <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <ArrowRight size={28} style={{ color: T.accent }} />
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.4 }} style={{ background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 11, padding: 14, minWidth: 230, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <UserPlus size={11} style={{ color: T.purple }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: T.purple, textTransform: 'uppercase' }}>New lead · New column</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{NAME_TYPED}</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6 }}>LED retrofit · {PHONE_TYPED}</div>
        <div style={{ fontSize: 10, color: T.textSecondary, fontStyle: 'italic' }}>source: public_quote</div>
        {scene === 'route' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ marginTop: 8, padding: '5px 8px', background: T.accentBg, color: T.accent, borderRadius: 6, fontSize: 10, fontWeight: 600 }}>
            ✓ Owner assigned: Doug · Setter notified
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    visit:  '1. Prospect lands from your ad or website',
    fill:   '2. Short form — name, phone, address, what they need',
    submit: "3. Submit — friendly thank-you with your phone number",
    lead:   '4. A fresh lead lands in your pipeline · source=public_quote',
    route:  '5. Owner auto-assigned · setter notified within seconds',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to turn it on'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
