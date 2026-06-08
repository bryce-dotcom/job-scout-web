// Public Quote Landing walkthrough — rebuilt to Prospect Scout standard.
// Source: src/lib/featureKnowledge/public-quote.js (route: /quote/:slug)
// Per-company public landing page for quote requests before leads exist.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, CheckCircle, ArrowRight, Globe, Sparkles } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/public-quote.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

export default function PublicQuoteWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Quotes requested online, leads auto-created." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showSuccess = scene === 'lead'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', backgroundColor: T.bg, overflow: 'hidden' }}>
      {/* Browser bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#2c2c2e', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '7px', zIndex: 5 }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: c }} />)}
        </div>
        <div style={{ flex: 1, backgroundColor: '#3a3a3c', borderRadius: '5px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Globe size={9} style={{ color: '#30d158' }} />
          <span style={{ fontSize: '9px', color: '#ebebf5', fontFamily: 'monospace' }}>job-scout.app/quote/acme-solar</span>
        </div>
      </div>

      {/* Page content */}
      <div style={{ width: '100%', maxWidth: '360px', paddingTop: '36px', fontFamily: 'system-ui, sans-serif' }}>
        {/* Company header */}
        <div style={{ backgroundColor: T.accent, padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>Acme Solar</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>LED Retrofits · Fleet Wraps · Solar</div>
        </div>

        <div style={{ padding: '14px 16px', backgroundColor: T.bgCard, display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {!showSuccess ? (
            <>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: T.text, marginBottom: '3px' }}>Request a Free Quote</div>
                <div style={{ fontSize: '10px', color: T.textMuted }}>We'll get back to you within one business day.</div>
              </div>

              {/* Form */}
              {[
                ['Your Name *',    'Marcus Okafor'],
                ['Business Name',  'Northbridge Logistics'],
                ['Email *',        'marcus@northbridge.co'],
                ['Phone',          '(801) 555-0142'],
              ].map(([label, value]) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{label}</label>
                  <div style={{ padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bg, fontSize: '10px', color: T.text }}>{value}</div>
                </div>
              ))}

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>Service Needed</label>
                <div style={{ padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bg, fontSize: '10px', color: T.text }}>LED Retrofit</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>Notes</label>
                <div style={{ padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bg, fontSize: '10px', color: T.textMuted, minHeight: '36px' }}>48 fixtures in warehouse bays, 20ft ceilings</div>
              </div>

              <button style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                Request Quote<ArrowRight size={13} />
              </button>
            </>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
              style={{ textAlign: 'center', padding: '20px 0' }}
            >
              <CheckCircle size={36} style={{ color: '#22c55e', marginBottom: '10px' }} />
              <div style={{ fontSize: '14px', fontWeight: '700', color: T.text, marginBottom: '4px' }}>Quote Request Submitted!</div>
              <div style={{ fontSize: '10px', color: T.textMuted, lineHeight: 1.6 }}>
                We'll reach out within one business day. A lead has been created in our system with your request.
              </div>
              <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: T.accentBg, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={12} style={{ color: T.accent }} />
                <span style={{ fontSize: '10px', color: T.textSecondary }}>Lead created · source=Public Quote · setter assigned</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    url:    '1 · job-scout.app/quote/acme-solar — your public quote request page, no login needed',
    form:   '2 · Simple form: name, business, email, phone, service needed, notes',
    submit: '3 · Submit creates a Lead instantly with source=Public Quote',
    lead:   '4 · Lead lands in your Leads page — setter picks it up and contacts them',
    slug:   '5 · Each company gets a unique /quote/:slug — put it in your email signature and website',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How the Public Quote page works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
