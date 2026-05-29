// Customer Portal walkthrough — public no-login page for customers.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Globe, FileText, CreditCard, Download, CheckCircle2, Lock,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/customer-portal.js'

export default function CustomerPortalWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Customers sign + pay from their phone. No password." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  if (scene === 'send') return <SendLinkScene />
  return <PortalView scene={scene} />
}

function SendLinkScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, background: T.bg }}>
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 11, padding: 14, maxWidth: 280, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Customer record</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Sarah Chen</div>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Northbridge Industries</div>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          <Send size={11} /> Send portal link
        </button>
      </motion.div>
      <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <Send size={28} style={{ color: T.accent }} />
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.4 }} style={{ background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 11, padding: 12, maxWidth: 260, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <Globe size={11} style={{ color: T.purple }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: T.purple, textTransform: 'uppercase' }}>Magic link · 90 day</div>
        </div>
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: T.text, padding: '5px 8px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5 }}>job-scout.app/portal/k3xR9p...</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>No password required. Customer-only data.</div>
      </motion.div>
    </div>
  )
}

function PortalView({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 28px rgba(0,0,0,0.1)' }}>
        {/* Branded header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, background: T.accent, color: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>HHH Services, LLC</div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>Welcome back, Sarah</div>
        </div>

        {scene === 'open' && (
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: T.accentBg, border: `1px solid ${T.accent}`, borderRadius: 8 }}>
              <FileText size={14} style={{ color: T.accent }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Estimate #EST-247</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>$5,033 · awaiting your signature</div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <CreditCard size={14} style={{ color: T.textMuted }} />
              <div style={{ flex: 1, fontSize: 11, color: T.textSecondary }}>2 invoices · $1,840 outstanding</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <Download size={14} style={{ color: T.textMuted }} />
              <div style={{ flex: 1, fontSize: 11, color: T.textSecondary }}>Statements (12 months) · download PDF</div>
            </motion.div>
          </div>
        )}

        {scene === 'sign' && (
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Estimate #EST-247</div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 11, color: T.textSecondary, lineHeight: 1.5 }}>
              Site prep · LED retrofit · Installation labor<br/>
              <strong style={{ color: T.text }}>Total $5,033.00</strong>
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ background: T.successBg, border: `2px solid ${T.success}`, borderRadius: 8, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.successDark, textTransform: 'uppercase', marginBottom: 4 }}>Sign with your finger</div>
              <svg viewBox="0 0 200 50" style={{ width: '100%', height: 50 }}>
                <motion.path d="M 10 35 Q 40 10 60 30 T 110 28 T 160 32 Q 175 24 190 30" fill="none" stroke={T.successDark} strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 1.4 }} />
              </svg>
              <div style={{ fontSize: 9, color: T.successDark, marginTop: 2 }}>IP · UA · doc hash · timestamp captured</div>
            </motion.div>
          </div>
        )}

        {scene === 'pay' && (
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Invoice #INV-2014</div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 10, fontSize: 11, color: T.textSecondary, lineHeight: 1.5 }}>
              Q1 lighting maintenance<br/>
              <strong style={{ color: T.text }}>Due $1,200.00</strong>
            </div>
            <motion.button initial={{ scale: 1 }} animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} style={{ padding: '14px 18px', background: '#635bff', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
              <CreditCard size={16} /> Pay $1,200 — Stripe
            </motion.button>
            <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'center' }}>One click. Money in your bank tomorrow.</div>
          </div>
        )}

        {scene === 'statement' && (
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Annual statement · 2026</div>
            {[
              { date: 'May 27', desc: 'Q1 LED maintenance · INV-2014', amount: '$1,200' },
              { date: 'Apr 15', desc: 'Office expansion lighting · INV-1987', amount: '$3,400' },
              { date: 'Feb 03', desc: 'Spring fixture audit · INV-1812', amount: '$840' },
            ].map((row, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px', gap: 8, alignItems: 'center', padding: '6px 8px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 10 }}>
                <div style={{ color: T.textMuted }}>{row.date}</div>
                <div style={{ color: T.text }}>{row.desc}</div>
                <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>{row.amount}</div>
              </motion.div>
            ))}
            <button style={{ marginTop: 4, padding: '8px 12px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.accent, borderRadius: 7, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Download size={11} /> Download PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    send:      '1. Send the portal link by email or text',
    open:      "2. Customer taps. Branded portal opens — no login",
    sign:      '3. Sign with a finger · IP + UA + timestamp captured',
    pay:       "4. Pay invoices via Stripe in one tap",
    statement: '5. Download a statement of every job, anytime',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Almost no setup'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
