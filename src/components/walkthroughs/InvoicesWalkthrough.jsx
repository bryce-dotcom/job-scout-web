// Invoices walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Send, CreditCard, Eye, MessageSquare, CheckCircle2,
  Wallet, Clock, ArrowRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/invoices.js'

export default function InvoicesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="One-click pay · auto-matched · auto-closed." />}
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
    <ZachShell title="Invoice INV-2014 · Northbridge" subtitle="JOB-2147 · Final · $4,280" actionLabel="Send Invoice" actionIcon={Send} actionHighlight={scene === 'send'}>
      {scene === 'create' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <Chip color={T.purple} bg={T.purpleBg}>Final</Chip>
            <Chip>Due May 30</Chip>
          </div>
          {[
            { d: 'Demo + tear-out',     amt: 800 },
            { d: '14 LED highbays installed', amt: 2240 },
            { d: 'Wallpack retrofit · 4 ea',  amt: 880 },
            { d: 'Materials + sales tax',     amt: 360 },
          ].map((row, i) => (
            <motion.div key={row.d} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: T.bg, borderRadius: 7 }}>
              <div style={{ fontSize: 11, color: T.text }}>{row.d}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>${row.amt.toLocaleString()}</div>
            </motion.div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: T.accentBg, borderRadius: 7, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>Total due</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>$4,280</div>
          </div>
        </div>
      )}

      {scene === 'send' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 14, maxWidth: 220 }}>
            <Send size={20} style={{ color: T.accent, marginBottom: 6 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Sent via SendGrid</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>sarah@northbridge.com</div>
            <Chip>10:14 AM</Chip>
          </motion.div>
          <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <ArrowRight size={24} style={{ color: T.purple }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} style={{ background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 9, padding: 14, maxWidth: 220 }}>
            <Eye size={20} style={{ color: T.purple, marginBottom: 6 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Opened by customer</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>tracking pixel reported back</div>
            <Chip color={T.purple} bg={T.purpleBg}>10:17 AM</Chip>
          </motion.div>
        </div>
      )}

      {scene === 'pay' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 11, padding: 18, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <Wallet size={42} style={{ color: T.successDark }} />
          </motion.div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.successDark }}>Paid · $4,280</div>
          <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 280 }}>Stripe charged Visa **4242 · landed in your account in two business days</div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: '6px 12px', background: T.bg, borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={12} style={{ color: T.successDark }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: T.text }}>Job JOB-2147 auto-closed</span>
          </motion.div>
        </div>
      )}

      {scene === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Payment plan · 3 installments</div>
          {[
            { label: 'Deposit',  pct: 30, amt: 8520, status: 'paid' },
            { label: 'Progress', pct: 40, amt: 11360, status: 'paid' },
            { label: 'Final',    pct: 30, amt: 8520, status: 'pending' },
          ].map((p, i) => (
            <motion.div key={p.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 80px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{p.label}</div>
              <div style={{ height: 6, background: T.bg, borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${p.pct}%`, background: p.status === 'paid' ? T.successDark : T.warning, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, textAlign: 'right' }}>${p.amt.toLocaleString()}</div>
              <Chip color={p.status === 'paid' ? T.successDark : T.warning} bg={p.status === 'paid' ? T.successBg : T.warningBg}>{p.status}</Chip>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'thread' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Conversation · INV-2014</div>
          {[
            { who: 'You', when: 'Sent · 10:14 AM', txt: "Here's the final invoice for the warehouse retrofit. Pay link below." },
            { who: 'Sarah', when: 'Reply · 11:02 AM', txt: 'Quick question — is the wallpack line itemized? Need it for our utility submission.' },
            { who: 'You', when: 'Reply · 11:08 AM', txt: 'Yes — line 3, $880 broken out separately.' },
            { who: 'Sarah', when: 'Reply · 11:11 AM', txt: 'Got it — paying now.' },
          ].map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.18 }} style={{ display: 'flex', gap: 8, padding: 8, background: m.who === 'You' ? T.bg : T.accentBg, borderRadius: 7 }}>
              <MessageSquare size={11} style={{ color: m.who === 'You' ? T.textMuted : T.accent, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 1 }}>{m.who} · {m.when}</div>
                <div style={{ fontSize: 11, color: T.text }}>{m.txt}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    create: '1. Build the invoice — lines from job carry over',
    send:   '2. Send via SendGrid · open tracking reports back',
    pay:    '3. Customer taps pay link · Stripe charges · job auto-closes',
    plan:   '4. Big jobs · deposit + progress + final',
    thread: '5. Every reply lives on the invoice itself',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Connect Stripe once'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
