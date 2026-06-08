// Lenard Public Pages walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/ lenard-az-srp, lenard-ut-rmp public pages.
// Photo upload → instant LED rebate estimate. No login. DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Camera, Upload, Zap, DollarSign, CheckCircle, ArrowRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/lenard-public-pages.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

export default function LenardPublicPagesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Prospects convert before they call." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', backgroundColor: '#1a1a2e', overflow: 'hidden' }}>
      {/* Phone-width, dark branded landing page */}
      <div style={{ width: '100%', maxWidth: '360px', fontFamily: 'system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #4a1d96 0%, #1e3a8a 100%)', padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <Sparkles size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#fbbf24' }}>Lenard · Powered by Job Scout</span>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: '0 0 4px', lineHeight: 1.3 }}>
            Get your FREE LED rebate estimate
          </h1>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', margin: 0 }}>
            Rocky Mountain Power Wattsmart Program · Utah
          </p>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: T.bgCard }}>

          {/* Upload zone */}
          {(scene === 'upload' || scene === 'photo') && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{ border: `2px dashed ${scene === 'photo' ? T.accent : T.border}`, borderRadius: '12px', padding: '24px 16px', textAlign: 'center', backgroundColor: scene === 'photo' ? T.accentBg : T.bg, cursor: 'pointer' }}
            >
              {scene === 'photo' ? (
                <>
                  <Camera size={28} style={{ color: T.accent, marginBottom: '8px' }} />
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>Photo uploaded!</div>
                  <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '2px' }}>Lenard is analyzing your fixtures…</div>
                </>
              ) : (
                <>
                  <Upload size={28} style={{ color: T.textMuted, marginBottom: '8px' }} />
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>Take a photo of your current lights</div>
                  <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '2px' }}>Warehouse, office, parking lot — any commercial space</div>
                  <button style={{ marginTop: '12px', padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', margin: '12px auto 0' }}>
                    <Camera size={13} />Take Photo
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* AI estimate result */}
          {(scene === 'estimate' || scene === 'lead') && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
              <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Sparkles size={13} style={{ color: '#16a34a' }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#15803d' }}>Lenard found your fixtures!</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { label: 'Detected Fixtures', value: '48× T8 4-lamp strips' },
                    { label: 'RMP Rebate Est.', value: '$8,400' },
                    { label: 'Annual kWh Savings', value: '42,800 kWh' },
                    { label: 'LED Retrofit Cost', value: '~$24,500' },
                  ].map(item => (
                    <div key={item.label} style={{ backgroundColor: '#fff', borderRadius: '7px', padding: '8px' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '1px' }}>{item.label}</div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {scene === 'lead' && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, marginBottom: '8px' }}>Get your full report — free</div>
                  {[['Name', 'Marcus Okafor'], ['Email', 'marcus@northbridge.co'], ['Phone', '(801) 555-0142']].map(([l, v]) => (
                    <div key={l} style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '2px' }}>{l}</div>
                      <div style={{ padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '10px', color: T.text }}>{v}</div>
                    </div>
                  ))}
                  <button style={{ width: '100%', marginTop: '8px', padding: '12px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    Get My Free Report<ArrowRight size={13} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    upload:   '1 · Public Lenard page — /agent/lenard-ut-rmp · no login · dark branded landing',
    photo:    '2 · Prospect snaps a photo of their lights — Lenard analyzes the fixtures instantly',
    estimate: '3 · Instant estimate: 48× T8 strips detected · $8,400 RMP rebate · 42,800 kWh saved',
    lead:     '4 · Prospect enters name + email + phone to get their full report → lead created in Job Scout',
    pipeline: '5 · Lead lands in the Leads page with source=Lenard-SRP — setter follows up immediately',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Lenard public pages work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
