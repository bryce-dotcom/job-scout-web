// OG Arnie walkthrough — the loop that sells him: ask, get the real
// answer, ask for the change, approve the card. Then field mode and
// the morning brief. Source: src/pages/agents/arnie/ArnieChat.jsx —
// the card drawn here is the record card the real chat draws.

import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Sunrise, Wrench, Check } from 'lucide-react'
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
const ARNIE = '#c9812f'

// One conversation, revealed scene by scene.
const OFFICE = [
  { from: 'user',  text: "When's the Drinkle job — can we push it to Friday?" },
  { from: 'arnie', text: 'JOB-2214 · Drinkle Insurance · Thu 8:00 AM, Mike and Sarah on it. Nothing else is booked Friday morning.' },
  { from: 'user',  text: 'Move it to Friday.' },
  { from: 'arnie', text: "Here's the change — give it a look.", card: { label: 'job start date', entity: 'JOB-2214 — Parking Lot Wall Packs — Drinkle Insurance', before: '2026-09-17', after: '2026-09-18' } },
]
const FIELD = [
  { from: 'user',  text: 'Compressor trips on start. What do I check?' },
  { from: 'arnie', text: 'Amp draw first. Locked rotor over nameplate LRA is a hard start or a seized compressor. Check the run capacitor before you condemn it.' },
  { from: 'user',  text: 'Clock me out at 5:30 yesterday.' },
  { from: 'arnie', text: 'Closing your open shift from Tue at 5:30 PM, 9.5 hours. Give it a look.', card: { label: 'shift clock-out', entity: 'Jordan — clocked in Tue, Sep 16, 8:00 AM on JOB-2214', before: '(still open)', after: 'Tue, Sep 16, 5:30 PM · 9.5 h' } },
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
              <SetupChecklist title={`Get the most out of him in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Ask him anything. He'll draft the rest." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  if (scene === 'brief') return <BriefStage />
  const field = scene === 'field'
  const convo = field ? FIELD : OFFICE
  const count = scene === 'ask' ? 1 : scene === 'answer' ? 2 : 4
  const msgs = convo.slice(0, count)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Bot size={15} style={{ color: ARNIE }} />
        <span style={{ fontSize: '15px', fontWeight: '700' }}>Arnie</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>{field ? 'Field mode · clocked in' : 'Summit Field Co'}</span>
        {field && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: ARNIE }}><Wrench size={11} /> hands-free</span>}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
        {msgs.map((msg, i) => (
          <motion.div key={`${scene}-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15, duration: 0.3 }}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: msg.from === 'user' ? 'row-reverse' : 'row' }}>
            {msg.from === 'arnie' && (
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: ARNIE + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={13} style={{ color: ARNIE }} />
              </div>
            )}
            <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                padding: '8px 10px', borderRadius: '10px', fontSize: '10px', lineHeight: 1.5,
                backgroundColor: msg.from === 'user' ? T.accent : T.bgCard,
                color: msg.from === 'user' ? '#fff' : T.text,
                border: msg.from === 'user' ? 'none' : `1px solid ${T.border}`,
              }}>{msg.text}</div>
              {msg.card && <ProposalCard {...msg.card} />}
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted }}>
          {field ? 'Talk to Arnie…' : 'Ask Arnie anything…'}
        </div>
      </div>
    </div>
  )
}

// The record card from ArnieChat.jsx, at walkthrough scale: which record,
// what it was, what it becomes, and the two buttons.
function ProposalCard({ label, entity, before, after }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
      style={{ background: '#1f2a24', border: '1px solid rgba(201,129,47,0.7)', borderRadius: 10, padding: 9 }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#d9963f', marginBottom: 4 }}>Change to {label}</div>
      <div style={{ fontSize: 10, fontWeight: 650, color: '#f2efe6', marginBottom: 6 }}>{entity}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 6, background: 'rgba(220,80,80,0.14)', color: '#e88', border: '1px solid rgba(220,80,80,0.4)' }}>{before}</span>
        <span style={{ color: '#9aa39c', fontSize: 10 }}>→</span>
        <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 6, background: 'rgba(47,125,78,0.22)', color: '#7fdba0', border: '1px solid rgba(47,125,78,0.5)' }}>{after}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, background: ARNIE, color: '#fff', borderRadius: 6, padding: '6px 8px', fontWeight: 650, fontSize: 9.5, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Check size={10} /> Approve & apply</div>
        <div style={{ color: '#9aa39c', border: '1px solid #3a463f', borderRadius: 6, padding: '6px 10px', fontSize: 9.5 }}>Discard</div>
      </div>
    </motion.div>
  )
}

function BriefStage() {
  const rows = [
    ['Today', '3 jobs · 2 crews · JOB-2218 has an unstaffed section'],
    ['Money', '2 invoices tipped overdue — $9,325 · $3,200 came in yesterday'],
    ['Stuck', 'Halifax Flooring quote quiet 12 days — want me to chase it?'],
    ['Open shift', "Jordan never clocked out Tuesday — want me to close it?"],
  ]
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: '100%', maxWidth: 400, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, boxShadow: '0 6px 24px rgba(44,53,48,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Sunrise size={15} style={{ color: ARNIE }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Your morning brief</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: T.textMuted }}>6:00 AM · by text</span>
        </div>
        {rows.map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.25 }}
            style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', gap: 8, padding: '6px 0', borderTop: i ? `1px solid ${T.border}` : 'none', fontSize: 10.5 }}>
            <span style={{ fontWeight: 650, color: T.textSecondary }}>{k}</span>
            <span style={{ color: T.text, lineHeight: 1.45 }}>{v}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    ask:    '1 · Ask the way you would ask a person — no IDs, no digging',
    answer: '2 · The answer comes from your live data: the real job, the real crew, the real gap',
    draft:  '3 · Ask for the change and it arrives as a card — nothing moves until you approve',
    field:  '4 · Clocked in, Arnie goes hands-free: short answers, any-trade troubleshooting, close a missed clock-out',
    brief:  '5 · Every morning, your day in one message — pushed by email or text at your hour',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Arnie works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
