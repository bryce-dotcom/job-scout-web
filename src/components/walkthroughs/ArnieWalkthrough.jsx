// Arnie walkthrough — AI assistant for JobScout.
// Source: src/lib/featureKnowledge/arnie.js

import { motion, AnimatePresence } from 'framer-motion'
import { Bot, MessageSquare, Send, BookOpen, ChevronRight, ExternalLink, Clock, Plus } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/arnie.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const ARNIE_COLOR = '#a855f7'

const FEATURE_CHIPS = [
  'Lighting Audits', 'Utility Programs', 'Rebate Measures', 'Jobs',
  'Payroll', 'Quotes', 'Customers', 'Invoices', 'Expenses', 'Fleet',
  'Employees', 'Time Clock', 'Commissions', 'Leads', 'Pipeline',
  'Reports', 'Books', 'Inventory', 'Products & Services', 'Routes',
  'Job Calendar', 'Fixture Types', 'Sales Pipeline', 'Documents',
  'Customer Portal', 'Public Quote', 'Onboarding', 'Plaid Sync',
]

const MARGIN_JOBS = [
  { job: 'JOB-118', name: 'Northbridge Commercial', customer: 'Northbridge LLC', margin: 41.2 },
  { job: 'JOB-112', name: 'Solera Office Retrofit',  customer: 'Solera Group',    margin: 37.8 },
  { job: 'JOB-109', name: 'Apex Warehouse Phase 3',  customer: 'Apex Solar',      margin: 34.5 },
  { job: 'JOB-104', name: 'Valley Multi-Bldg LED',   customer: 'Valley Props',    margin: 29.1 },
]

const HISTORY = [
  { id: 1, title: 'Payroll questions',    date: 'Jun 9', preview: 'How do I add a manual adjustment to payroll?' },
  { id: 2, title: 'Northbridge audit',   date: 'Jun 8', preview: 'Open the Northbridge audit for me.' },
  { id: 3, title: 'Commission rates',    date: 'Jun 7', preview: 'What percentage does Doug get on closed deals?' },
  { id: 4, title: 'Rebate measure setup', date: 'Jun 6', preview: 'How do I add a rebate measure to a lighting audit?' },
  { id: 5, title: 'Fleet PM schedule',   date: 'Jun 5', preview: 'Which vehicles have overdue maintenance?' },
]

export default function ArnieWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro,
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Ask Arnie anything." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function ArnieAvatar({ size = 24 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: ARNIE_COLOR + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Bot size={size * 0.55} style={{ color: ARNIE_COLOR }} />
    </div>
  )
}

function ChatBubble({ from, text, delay = 0, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.25 }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', flexDirection: from === 'user' ? 'row-reverse' : 'row' }}>
      {from === 'arnie' && <ArnieAvatar size={24} />}
      <div style={{ maxWidth: '82%', padding: '7px 10px', borderRadius: '10px', fontSize: '10px', lineHeight: 1.5, backgroundColor: from === 'user' ? T.accent : ARNIE_COLOR + '12', color: from === 'user' ? '#fff' : T.text, border: from === 'user' ? 'none' : `1px solid ${ARNIE_COLOR}28` }}>
        {children || text}
      </div>
    </motion.div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArnieAvatar size={28} />
          <div>
            <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Arnie</span>
            <span style={{ fontSize: '9px', color: T.textMuted, marginLeft: '6px' }}>AI Assistant · online</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {scene === 'context' && (
            <div style={{ padding: '3px 8px', backgroundColor: ARNIE_COLOR + '15', border: `1px solid ${ARNIE_COLOR}30`, borderRadius: '10px', fontSize: '9px', fontWeight: '700', color: ARNIE_COLOR }}>
              47 features loaded
            </div>
          )}
          <button style={{ padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, color: T.textMuted, fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Plus size={9} />New Chat
          </button>
        </div>
      </div>

      {/* scene: chat */}
      {scene === 'chat' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          <ChatBubble from="user" text="How do I add a rebate measure to a lighting audit?" />
          <ChatBubble from="arnie" delay={0.25}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>To add a rebate measure to a lighting audit:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {[
                  '1. Open the audit and go to the Measures tab.',
                  '2. Tap + Add Measure and pick the fixture type.',
                  '3. Select the Utility Program — eligible rebate rates load automatically.',
                  '4. Enter quantity, wattage, and operating hours.',
                  '5. Save — the rebate value rolls into the audit total.',
                ].map((step, i) => (
                  <div key={i} style={{ fontSize: '9.5px', color: T.text }}>{step}</div>
                ))}
              </div>
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', border: `1px solid ${ARNIE_COLOR}40`, borderRadius: '6px', backgroundColor: ARNIE_COLOR + '10', color: ARNIE_COLOR, fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>
                Go to Rebate Measures <ChevronRight size={10} />
              </motion.button>
            </div>
          </ChatBubble>
        </div>
      )}

      {/* scene: context */}
      {scene === 'context' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={11} style={{ color: ARNIE_COLOR }} />
              <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>I know about:</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, alignContent: 'flex-start', overflow: 'hidden' }}>
              {FEATURE_CHIPS.map((chip, i) => (
                <motion.div key={chip} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025, duration: 0.2 }}
                  style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '8.5px', fontWeight: '500', backgroundColor: i < 5 ? ARNIE_COLOR + '15' : T.accentBg, color: i < 5 ? ARNIE_COLOR : T.textSecondary, border: `1px solid ${i < 5 ? ARNIE_COLOR + '30' : T.border}`, whiteSpace: 'nowrap' }}>
                  {chip}
                </motion.div>
              ))}
              <div style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '8.5px', color: T.textMuted, border: `1px dashed ${T.border}` }}>and more…</div>
            </div>
            <div style={{ fontSize: '8.5px', color: T.textMuted, borderTop: `1px solid ${T.border}`, paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Last updated: Jun 12, 2026 at 3:04 AM</span>
              <span style={{ color: ARNIE_COLOR, fontWeight: '600' }}>47 features</span>
            </div>
          </div>
        </div>
      )}

      {/* scene: insight */}
      {scene === 'insight' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          <ChatBubble from="user" text="Which jobs have the highest margin this month?" />
          <ChatBubble from="arnie" delay={0.2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>Here are your <strong>top margin jobs in June</strong>:</div>
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                style={{ border: `1px solid ${ARNIE_COLOR}25`, borderRadius: '7px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                  <thead>
                    <tr style={{ backgroundColor: ARNIE_COLOR + '10' }}>
                      {['Job', 'Name', 'Customer', 'Margin'].map(h => (
                        <th key={h} style={{ padding: '5px 7px', textAlign: h === 'Margin' ? 'right' : 'left', fontWeight: '600', color: ARNIE_COLOR, borderBottom: `1px solid ${ARNIE_COLOR}20` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MARGIN_JOBS.map((j, i) => (
                      <motion.tr key={j.job} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.07 }}
                        style={{ borderBottom: `1px solid ${ARNIE_COLOR}15` }}>
                        <td style={{ padding: '5px 7px', color: ARNIE_COLOR, fontWeight: '600' }}>{j.job}</td>
                        <td style={{ padding: '5px 7px', color: T.text, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</td>
                        <td style={{ padding: '5px 7px', color: T.textSecondary }}>{j.customer}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right' }}>
                          <span style={{ fontWeight: '700', color: j.margin >= 35 ? '#22c55e' : '#eab308' }}>{j.margin}%</span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>
                <strong style={{ color: T.text }}>JOB-118</strong> leads at <strong style={{ color: '#22c55e' }}>41.2%</strong> — LED retrofit with favorable material cost. Want me to pull the full cost breakdown?
              </div>
            </div>
          </ChatBubble>
        </div>
      )}

      {/* scene: action */}
      {scene === 'action' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          <ChatBubble from="user" text="Open the Northbridge audit." />
          <ChatBubble from="arnie" delay={0.2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>Found <strong>Lighting Audit #120 — Northbridge Commercial</strong>. Opening now.</div>
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                style={{ border: `1px solid ${ARNIE_COLOR}30`, borderRadius: '8px', overflow: 'hidden', backgroundColor: ARNIE_COLOR + '06' }}>
                <div style={{ padding: '7px 10px', backgroundColor: ARNIE_COLOR + '12', borderBottom: `1px solid ${ARNIE_COLOR}25`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Bot size={10} style={{ color: ARNIE_COLOR }} />
                    <span style={{ fontSize: '9px', fontWeight: '700', color: ARNIE_COLOR }}>Audit #120</span>
                  </div>
                  <div style={{ padding: '1px 6px', borderRadius: '6px', fontSize: '8px', fontWeight: '600', backgroundColor: 'rgba(234,179,8,0.15)', color: '#c28b38' }}>In Progress</div>
                </div>
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {[
                    ['Customer',    'Northbridge LLC'],
                    ['Site',        'Northbridge Commercial · 3200 Commerce Dr'],
                    ['Auditor',     'Marcus Webb'],
                    ['Measures',    '14 fixtures · $4,200 est. rebate'],
                    ['Utility',     'SRP — Commercial Lighting Program'],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                      <span style={{ color: T.textMuted }}>{l}</span>
                      <span style={{ color: T.text, fontWeight: '500' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '6px 10px', borderTop: `1px solid ${ARNIE_COLOR}20` }}>
                  <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', border: 'none', borderRadius: '5px', backgroundColor: ARNIE_COLOR, color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>
                    <ExternalLink size={9} />Open Audit #120
                  </button>
                </div>
              </motion.div>
            </div>
          </ChatBubble>
        </div>
      )}

      {/* scene: history */}
      {scene === 'history' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: '160px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Conversations</span>
              <button style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px', border: `1px solid ${ARNIE_COLOR}40`, borderRadius: '4px', backgroundColor: ARNIE_COLOR + '10', color: ARNIE_COLOR, fontSize: '8px', fontWeight: '600', cursor: 'pointer' }}>
                <Plus size={8} />New
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {HISTORY.map((h, i) => (
                <motion.div key={h.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.2 }}
                  style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', backgroundColor: i === 0 ? ARNIE_COLOR + '08' : 'transparent', borderLeft: i === 0 ? `2px solid ${ARNIE_COLOR}` : '2px solid transparent' }}>
                  <div style={{ fontSize: '9.5px', fontWeight: '600', color: i === 0 ? ARNIE_COLOR : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</div>
                  <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Clock size={7} />{h.date}
                  </div>
                  <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.preview}</div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Active chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
              <ChatBubble from="user" text="How do I add a manual adjustment to payroll?" delay={0.1} />
              <ChatBubble from="arnie" delay={0.35}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Go to <strong>Payroll → current pay period</strong>, then tap the employee row and choose <strong>Add Adjustment</strong>. Set the type (bonus, deduction, reimbursement) and amount. It posts to the next payroll run.</div>
                  <div style={{ fontSize: '8.5px', color: T.textMuted }}>Tip: reimbursements are non-taxable — make sure to pick the right type.</div>
                </div>
              </ChatBubble>
            </div>
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
              <div style={{ flex: 1, padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '9.5px', color: T.textMuted }}>Ask Arnie anything…</div>
              <button style={{ padding: '6px 10px', border: 'none', borderRadius: '6px', backgroundColor: ARNIE_COLOR, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Send size={10} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input bar — shown on chat/insight/action scenes */}
      {(scene === 'chat' || scene === 'insight' || scene === 'action') && (
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted }}>
            Ask Arnie anything…
          </div>
          <button style={{ padding: '7px 12px', border: 'none', borderRadius: '7px', backgroundColor: ARNIE_COLOR, color: '#fff', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Send size={11} />
          </button>
        </div>
      )}

      {/* Input bar for context scene */}
      {scene === 'context' && (
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted }}>Ask Arnie anything…</div>
          <button style={{ padding: '7px 12px', border: 'none', borderRadius: '7px', backgroundColor: ARNIE_COLOR, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Send size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    chat:    '1 · Ask anything — Arnie gives step-by-step guidance and a direct link to the right page',
    context: '2 · 47 features loaded — Arnie knows every screen, every field, every workflow in the app',
    insight: '3 · Data questions answered — ask which jobs have the highest margin and get a real table',
    action:  '4 · Open anything by name — "Open the Northbridge audit" finds it and shows a link card',
    history: '5 · Conversation history — pick up where you left off, search past Q&A sessions',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Arnie works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
