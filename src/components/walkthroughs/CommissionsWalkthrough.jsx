// Commissions walkthrough — rebuilt to Prospect Scout standard.
// Source: src/lib/featureKnowledge/commissions.js (feature within Payroll)
// DO NOT import ZachShell — shows the pending→earned→paid state machine.

import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, DollarSign, Clock, CheckCircle, X, TrendingUp } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/commissions.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Mock commission entries showing the state machine
const MOCK_COMMISSIONS = [
  { id: 1, type: 'Setter',   person: 'Linda Park',    event: 'Appt: Marcus Okafor · Jun 9',  amount: 25,   status: 'Earned', trigger: 'quote_created' },
  { id: 2, type: 'Sales',    person: 'Doug Anderson',  event: 'Deal: EST-041 · $24,500',       amount: 1960, status: 'Earned', trigger: 'deal_won' },
  { id: 3, type: 'Source',   person: 'Doug Anderson',  event: 'Lead source: Ryan Torres',      amount: 25,   status: 'Pending', trigger: 'first_invoice_paid' },
  { id: 4, type: 'Setter',   person: 'Linda Park',    event: 'Appt: Sarah Chen · Jun 12',    amount: 25,   status: 'Pending', trigger: 'quote_created' },
  { id: 5, type: 'Sales',    person: 'Tracy Benson',  event: 'Deal: EST-038 · $18,200',       amount: 1456, status: 'Paid',    trigger: 'deal_won' },
]

const STATUS_STYLES = {
  'Pending': { bg: 'rgba(234,179,8,0.12)', text: '#c28b38',  label: 'Pending' },
  'Earned':  { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e',  label: 'Earned' },
  'Paid':    { bg: 'rgba(74,124,89,0.12)',  text: '#4a7c59',  label: 'Paid' },
}

const TYPE_COLORS = { 'Setter': '#3b82f6', 'Sales': '#22c55e', 'Source': '#a855f7' }

export default function CommissionsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Commissions automated." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const highlight = scene === 'quote' ? 'Earned' : scene === 'won' ? 'Earned' : scene === 'payout' ? 'Paid' : null
  const entries = scene === 'set'
    ? MOCK_COMMISSIONS.filter(c => c.status === 'Pending')
    : MOCK_COMMISSIONS

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Trophy size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Commissions</span>
        <span style={{ fontSize: '10px', color: T.textMuted, marginLeft: '4px' }}>Pending → Earned → Paid</span>
      </div>

      {/* State machine summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' }}>
        {[
          { label: 'Pending', count: entries.filter(c => c.status === 'Pending').length, amount: entries.filter(c => c.status === 'Pending').reduce((s, c) => s + c.amount, 0), color: '#c28b38' },
          { label: 'Earned',  count: entries.filter(c => c.status === 'Earned').length,  amount: entries.filter(c => c.status === 'Earned').reduce((s, c) => s + c.amount, 0),  color: '#22c55e' },
          { label: 'Paid',    count: entries.filter(c => c.status === 'Paid').length,    amount: entries.filter(c => c.status === 'Paid').reduce((s, c) => s + c.amount, 0),    color: '#4a7c59' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '9px', textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: s.color }}>${s.amount.toLocaleString()}</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>{s.label} ({s.count})</div>
          </div>
        ))}
      </div>

      {/* Commission entries table */}
      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Type', 'Person', 'Event', 'Amount', 'Status'].map(col => (
                <th key={col} style={{ padding: '6px 9px', textAlign: col === 'Amount' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((comm, i) => {
              const ss = STATUS_STYLES[comm.status]
              const tc = TYPE_COLORS[comm.type] || '#6b7280'
              return (
                <motion.tr key={comm.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                  style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: highlight === comm.status ? `${ss.text}08` : 'transparent' }}
                >
                  <td style={{ padding: '6px 9px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600', backgroundColor: tc + '18', color: tc }}>{comm.type}</span>
                  </td>
                  <td style={{ padding: '6px 9px', fontSize: '10px', color: T.text }}>{comm.person}</td>
                  <td style={{ padding: '6px 9px', fontSize: '9px', color: T.textSecondary, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comm.event}</td>
                  <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '600', color: '#22c55e', textAlign: 'right' }}>${comm.amount.toLocaleString()}</td>
                  <td style={{ padding: '6px 9px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: ss.bg, color: ss.text }}>{ss.label}</span>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    set:    '1 · Setter books appointment → commission posts as Pending ($25)',
    quote:  '2 · Rep sends estimate → qualification rule fires → Pending flips to Earned',
    won:    '3 · Deal closes → sales rep commission Earned (% of gross profit)',
    rules:  '4 · Rules per role: Setter on quote-created, Rep on won, Source on first payment',
    payout: '5 · Next payroll run picks up all Earned → Paid · itemized on the stub',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Commissions work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
