// Public Lenard Agent Pages walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Upload, Zap, DollarSign, UserPlus, ArrowRight,
  CheckCircle2, Camera,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/lenard-public-pages.js'

export default function LenardPublicPagesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every photo upload is a lead with rebate math attached." />}
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
      {scene !== 'lead' && (
        <div style={{ width: '100%', maxWidth: 380, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 28px rgba(0,0,0,0.1)' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, background: T.purple, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>Lenard · RMP Wattsmart</div>
            </div>
            <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>Free instant LED rebate estimate</div>
          </div>

          {scene === 'landing' && (
            <div style={{ padding: 18, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 36 }}>💡</motion.div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>See your LED rebate in 30 seconds</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>Snap a photo of your existing fixtures. We do the math.</div>
              <button style={{ marginTop: 6, padding: '12px 16px', background: T.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Upload size={14} /> Upload photo
              </button>
            </div>
          )}

          {scene === 'upload' && (
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ aspectRatio: '4/3', borderRadius: 9, background: 'linear-gradient(180deg, #475569 0%, #1e293b 70%, #0f172a 100%)', position: 'relative', overflow: 'hidden', border: `2px solid ${T.accent}` }}>
                {[0, 1, 2, 3, 4, 5].map(j => (
                  <motion.div key={j} initial={{ opacity: 0 }} animate={{ opacity: [0.6, 1, 0.6] }} transition={{ delay: j * 0.15, repeat: Infinity, duration: 1.5 }} style={{ position: 'absolute', top: `${15 + (j % 2) * 35}%`, left: `${10 + j * 14}%`, width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 10px #fbbf24' }} />
                ))}
                <div style={{ position: 'absolute', bottom: 8, left: 8, padding: '3px 7px', background: 'rgba(255,255,255,0.9)', borderRadius: 99, fontSize: 9, fontWeight: 700, color: T.text }}>uploaded</div>
              </motion.div>
              <Chip icon={CheckCircle2} color={T.successDark} bg={T.successBg}>Ready to analyze</Chip>
            </div>
          )}

          {scene === 'analyze' && (
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }} style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${T.purple}`, borderTopColor: 'transparent' }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Lenard is reading the photo…</div>
              <div style={{ fontSize: 10, color: T.textMuted, maxWidth: 260, textAlign: 'center' }}>Identifying fixtures · matching RMP measure codes · calculating rebate</div>
            </div>
          )}

          {scene === 'quote' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Stat label="Fixtures found" value="18" color={T.text} />
                <Stat label="Type" value="Metal halide 400W" color={T.text} />
                <Stat label="Estimated rebate" value="$1,440" color={T.successDark} />
                <Stat label="Annual savings" value="$840/yr" color={T.accent} />
              </div>
              <button style={{ padding: '12px 16px', background: T.accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                Get my free quote <ArrowRight size={14} />
              </button>
            </motion.div>
          )}
        </div>
      )}

      {scene === 'lead' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 11, padding: 14, maxWidth: 200 }}>
            <Sparkles size={20} style={{ color: T.purple, marginBottom: 6 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, textTransform: 'uppercase', marginBottom: 2 }}>Public Lenard</div>
            <div style={{ fontSize: 11, color: T.text }}>job-scout.app/agent/lenard-ut-rmp</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>photo + form submitted</div>
          </motion.div>
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <ArrowRight size={28} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14, minWidth: 230 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <UserPlus size={11} style={{ color: T.accent }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: 'uppercase' }}>New lead · pipeline</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Marcus Reeves</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6 }}>LED retrofit · 18 fixtures · est $1,440</div>
            <Chip icon={DollarSign} color={T.successDark} bg={T.successBg}>Rebate ready</Chip>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    landing: '1. Prospect lands from your ad · custom URL · branded',
    upload:  '2. Snaps a photo of their fixtures · no login needed',
    analyze: '3. Lenard runs the same rebate engine as a full audit',
    quote:   '4. Estimated rebate, savings, payback · in seconds',
    lead:    '5. A fresh lead lands in your pipeline · pre-qualified',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Set it up once · ad-ready'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
