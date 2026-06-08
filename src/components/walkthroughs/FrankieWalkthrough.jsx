// Frankie walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/Frankie.jsx — AI CFO agent.
// DO NOT import ZachShell — shows Frankie chat + AR/AP aging + anomaly alerts.

import { motion, AnimatePresence } from 'framer-motion'
import { Bot, TrendingUp, TrendingDown, AlertCircle, DollarSign, MessageSquare } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/frankie.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const FRANKIE_COLOR = '#0ea5e9'

const CHAT_MESSAGES = [
  { from: 'user',   text: "Why is cash tight this month?" },
  { from: 'frankie',text: "3 large invoices are 30+ days overdue — $42,800 total from Northbridge (INV-041, $24,500), Solera (INV-039, $18,200), and Apex (INV-035). Payroll is due Friday. I'd prioritize sending a payment reminder to Northbridge today — they're 38 days past due." },
  { from: 'user',   text: "What's our AR aging summary?" },
  { from: 'frankie',text: "Current: $67,200 · 0-30 days: $28,400 · 31-60 days: $42,800 · 60+ days: $8,100. Total outstanding: $146,500. Collection rate this month: 74%." },
]

export default function FrankieWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your AI CFO is watching." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showAlerts = scene === 'anomaly'
  const msgs = scene === 'question' ? CHAT_MESSAGES.slice(0, 2) : CHAT_MESSAGES

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Bot size={15} style={{ color: FRANKIE_COLOR }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Frankie</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>AI CFO</span>
      </div>

      {/* Anomaly alerts (scene: anomaly) */}
      {showAlerts && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '9px', padding: '10px 12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <AlertCircle size={12} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#ef4444' }}>2 anomalies detected this week</span>
          </div>
          {[
            'Home Depot charge $2,847 — 3.4× above your usual hardware spend ($840 avg)',
            'Payroll expense is 28% of revenue this week vs 19% last month',
          ].map((alert, i) => (
            <div key={i} style={{ fontSize: '10px', color: '#7f1d1d', padding: '4px 6px', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '5px', marginBottom: '4px' }}>• {alert}</div>
          ))}
        </motion.div>
      )}

      {/* Chat conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
        {msgs.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12, duration: 0.3 }}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: msg.from === 'user' ? 'row-reverse' : 'row' }}
          >
            {msg.from === 'frankie' && (
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: FRANKIE_COLOR + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={13} style={{ color: FRANKIE_COLOR }} />
              </div>
            )}
            <div style={{
              maxWidth: '75%', padding: '8px 10px', borderRadius: '10px', fontSize: '10px', lineHeight: 1.5,
              backgroundColor: msg.from === 'user' ? T.accent : T.bgCard,
              color: msg.from === 'user' ? '#fff' : T.text,
              border: msg.from === 'user' ? 'none' : `1px solid ${T.border}`,
            }}>
              {msg.text}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted }}>
          Ask Frankie anything about your finances…
        </div>
        <button style={{ padding: '7px 12px', border: 'none', borderRadius: '7px', backgroundColor: FRANKIE_COLOR, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <MessageSquare size={11} />
        </button>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    cash:    '1 · Frankie — ask "Why is cash tight?" in plain English, get a specific answer',
    ar:      '2 · AR aging on demand — Current, 0-30, 31-60, 60+ breakdown in one message',
    anomaly: '3 · Frankie flags anomalies: expenses 3× above normal, payroll ratio drift',
    remind:  '4 · Frankie auto-sends collection reminders to overdue customers',
    profit:  '5 · "What\'s our margin on JOB-041?" → job profitability on the spot',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Frankie works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
