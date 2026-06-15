// Frankie walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/Frankie.jsx — AI CFO agent.
// DO NOT import ZachShell — shows Frankie chat + AR/AP aging + anomaly alerts.

import { motion, AnimatePresence } from 'framer-motion'
import { Bot, AlertCircle, MessageSquare, Send, CheckCircle, TrendingDown } from 'lucide-react'
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

const AGING_DATA = [
  { name: 'Northbridge Logistics', current: 0, d30: 0, d60: 24500, d90: 0, total: 24500 },
  { name: 'Solera Group',          current: 8200, d30: 18200, d60: 0, d90: 0, total: 26400 },
  { name: 'Apex Solar',            current: 12400, d30: 0, d60: 0, d90: 8100, total: 20500 },
  { name: 'Valley Properties',     current: 19600, d30: 10200, d60: 0, d90: 0, total: 29800 },
]

const JOB_PROFIT = [
  { job: 'JOB-041', name: 'Northbridge LED Retrofit', revenue: 48200, cost: 31400, margin: 34.9, status: 'complete' },
  { job: 'JOB-038', name: 'Solera Office Install',    revenue: 22800, cost: 17100, margin: 25.0, status: 'complete' },
  { job: 'JOB-036', name: 'Apex Warehouse Phase 2',   revenue: 34600, cost: 21800, margin: 37.0, status: 'complete' },
  { job: 'JOB-034', name: 'Valley Multi-Bldg',        revenue: 61200, cost: 44900, margin: 26.6, status: 'in-progress' },
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

function ChatBubble({ from, text, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.25 }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: from === 'user' ? 'row-reverse' : 'row' }}>
      {from === 'frankie' && (
        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: FRANKIE_COLOR + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={12} style={{ color: FRANKIE_COLOR }} />
        </div>
      )}
      <div style={{ maxWidth: '80%', padding: '7px 10px', borderRadius: '10px', fontSize: '10px', lineHeight: 1.5, backgroundColor: from === 'user' ? T.accent : FRANKIE_COLOR + '14', color: from === 'user' ? '#fff' : T.text, border: from === 'user' ? 'none' : `1px solid ${FRANKIE_COLOR}30` }}>
        {text}
      </div>
    </motion.div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: FRANKIE_COLOR + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={14} style={{ color: FRANKIE_COLOR }} />
        </div>
        <div>
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Frankie</span>
          <span style={{ fontSize: '9px', color: T.textMuted, marginLeft: '6px' }}>AI CFO · online</span>
        </div>
      </div>

      {/* question: user question + typing indicator */}
      {scene === 'question' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          <ChatBubble from="user" text="Why is cash tight this month?" />
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: FRANKIE_COLOR + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={12} style={{ color: FRANKIE_COLOR }} />
            </div>
            <div style={{ padding: '8px 12px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              {[0, 0.15, 0.3].map(d => (
                <motion.div key={d} animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d }}
                  style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: FRANKIE_COLOR }} />
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* answer: full Q&A exchange */}
      {scene === 'answer' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          <ChatBubble from="user" text="Why is cash tight this month?" />
          <ChatBubble from="frankie" delay={0.2} text="3 large invoices are 30+ days overdue — $42,800 total. Northbridge (INV-041, $24,500, 38 days), Solera (INV-039, $18,200, 31 days). Payroll is due Friday. I'd send a reminder to Northbridge today." />
        </div>
      )}

      {/* aging: AR aging table */}
      {scene === 'aging' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
          <ChatBubble from="user" text="What's our AR aging right now?" />
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '7px 10px', backgroundColor: T.accentBg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={10} style={{ color: FRANKIE_COLOR }} />
              <span style={{ fontSize: '9px', fontWeight: '600', color: T.accent }}>Total outstanding: $146,500 · Collection rate 74%</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ backgroundColor: T.bg }}>
                  {['Customer', 'Current', '0-30d', '31-60d', '60+d', 'Total'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Customer' ? 'left' : 'right', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AGING_DATA.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '6px 8px', color: T.text, fontWeight: '500' }}>{r.name}</td>
                    {[r.current, r.d30, r.d60, r.d90].map((v, j) => (
                      <td key={j} style={{ padding: '6px 8px', textAlign: 'right', color: (j === 2 && v > 0) ? '#ef4444' : (j === 3 && v > 0) ? '#ef4444' : T.textSecondary }}>
                        {v > 0 ? `$${v.toLocaleString()}` : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700', color: T.accent }}>${r.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      )}

      {/* remind: Frankie sends payment reminders */}
      {scene === 'remind' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto' }}>
          <ChatBubble from="user" text="Send payment reminders to everyone 30+ days overdue." />
          <ChatBubble from="frankie" delay={0.2} text="Sending reminders to Northbridge and Solera now." />
          {[
            { name: 'Northbridge Logistics', inv: 'INV-041', amount: '$24,500', days: 38 },
            { name: 'Solera Group',           inv: 'INV-039', amount: '$18,200', days: 31 },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.15 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', marginLeft: '32px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{c.name}</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>{c.inv} · {c.amount} · {c.days}d overdue</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#22c55e', fontWeight: '600' }}>
                <CheckCircle size={11} />Sent
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* profit: per-job profitability */}
      {scene === 'profit' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
          <ChatBubble from="user" text="What's our margin breakdown by job?" />
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '7px 10px', backgroundColor: T.accentBg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={10} style={{ color: FRANKIE_COLOR }} />
              <span style={{ fontSize: '9px', fontWeight: '600', color: T.accent }}>4 recent completed/active jobs</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ backgroundColor: T.bg }}>
                  {['Job', 'Name', 'Revenue', 'Cost', 'Margin'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Job' || h === 'Name' ? 'left' : 'right', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {JOB_PROFIT.map((j, i) => (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.06 }}
                    style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '6px 8px', color: T.accent, fontWeight: '600' }}>{j.job}</td>
                    <td style={{ padding: '6px 8px', color: T.text, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#22c55e', fontWeight: '600' }}>${j.revenue.toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: T.textSecondary }}>${j.cost.toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '5px', fontWeight: '700', backgroundColor: j.margin >= 30 ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)', color: j.margin >= 30 ? '#22c55e' : '#eab308' }}>{j.margin}%</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      )}

      {/* KPI bar */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {[
          { label: 'Cash Position',   value: '$48,200',   color: '#22c55e' },
          { label: 'AR Outstanding',  value: '$146,500',  color: '#ef4444' },
          { label: 'MTD Revenue',     value: '$187,400',  color: T.accent  },
          { label: 'Avg Job Margin',  value: '30.9%',     color: FRANKIE_COLOR },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, padding: '5px 7px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px' }}>
            <div style={{ fontSize: '8px', color: T.textMuted, marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <div style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted }}>
          Ask Frankie anything about your finances…
        </div>
        <button style={{ padding: '7px 12px', border: 'none', borderRadius: '7px', backgroundColor: FRANKIE_COLOR, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Send size={11} />
        </button>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    question: '1 · Ask Frankie in plain English — "Why is cash tight this month?"',
    answer:   '2 · Specific answer — 3 invoices, 38 days past due, payroll due Friday, who to call first',
    aging:    '3 · AR aging table on demand — Current, 0-30, 31-60, 60+ across every customer',
    remind:   '4 · Frankie sends payment reminders — one message, Northbridge + Solera both get it',
    profit:   '5 · Per-job margin breakdown — revenue, cost, and margin % for every recent job',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Frankie works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
