// Lead Setter walkthrough — kanban + calendar in two panes.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Headphones, Phone, Mail, Calendar, DollarSign, ArrowRight, Clock,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/lead-setter.js'

const COLUMNS = [
  { id: 'New',       color: T.info },
  { id: 'Contacted', color: T.contacted || T.purple },
  { id: 'Callback',  color: T.warning },
  { id: 'Qualified', color: T.success },
]

const LEADS = [
  { id: 1, name: 'Marcus Reeves',  col: 'New',       attempts: 0, callbackDay: null },
  { id: 2, name: 'Priya Anand',    col: 'New',       attempts: 0, callbackDay: null },
  { id: 3, name: 'David Okafor',   col: 'Contacted', attempts: 1, callbackDay: null },
  { id: 4, name: 'Hannah Liu',     col: 'Callback',  attempts: 2, callbackDay: 'Wed' },
  { id: 5, name: 'Carlos Rivera',  col: 'Qualified', attempts: 3, callbackDay: null },
]

export default function LeadSetterWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Setters know what they're worth in real time." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Earnings strip at top */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>Lead Setter</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>Drag leads to calendar to schedule appointments</p>
        </div>
        <motion.div
          animate={scene === 'earnings' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ repeat: scene === 'earnings' ? Infinity : 0, duration: 1.6 }}
          style={{ display: 'flex', gap: 6 }}
        >
          <EarnPill label="/appt" value="$25" />
          <EarnPill label="pending" value={scene === 'schedule' || scene === 'earnings' ? '4' : '3'} color={T.warning} />
          <EarnPill label="earned" value={scene === 'earnings' ? '$50' : '$0'} color={T.successDark} />
        </motion.div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10, overflow: 'hidden' }}>
        {/* Kanban */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, overflow: 'hidden' }}>
          {COLUMNS.map(col => {
            const colLeads = LEADS.filter(l => l.col === col.id)
            return (
              <div key={col.id} style={{ background: T.bg, border: `1px dashed ${T.border}`, borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: col.color }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase' }}>{col.id}</span>
                </div>
                {colLeads.map((l, i) => (
                  <SetterLeadCard key={l.id} lead={l} highlight={(scene === 'attempt' && l.id === 3) || (scene === 'callback' && l.id === 4) || (scene === 'schedule' && l.id === 1)} />
                ))}
              </div>
            )
          })}
        </div>

        {/* Calendar */}
        <div style={{ background: T.bgCard, border: `1.5px solid ${scene === 'schedule' ? T.accent : T.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Calendar size={12} style={{ color: T.accent }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Doug's calendar · this week</div>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'repeat(4, 1fr)', gap: 4 }}>
            {['Mon', 'Tue', 'Wed', 'Thu'].map((day, i) => (
              <div key={day} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 6, alignItems: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>{day}</div>
                <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5, padding: '4px 6px', fontSize: 10, color: T.text, position: 'relative' }}>
                  {day === 'Mon' && (scene === 'schedule' || scene === 'earnings') ? (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ padding: '3px 6px', background: T.accent, color: '#fff', borderRadius: 4, fontWeight: 600 }}>
                      Marcus Reeves · 10am
                    </motion.div>
                  ) : day === 'Tue' ? (
                    <span style={{ color: T.textMuted }}>Sarah Chen · 2pm</span>
                  ) : day === 'Wed' && (scene === 'callback') ? (
                    <span style={{ color: T.warning, fontWeight: 600 }}>📞 Callback: Hannah Liu · 9am</span>
                  ) : (
                    <span style={{ color: T.textMuted, fontStyle: 'italic' }}>open</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scene-specific callouts */}
      {scene === 'attempt' && <FloatingCallout text="David Okafor — Contact attempt logged (Phone · voicemail)" icon={Phone} />}
      {scene === 'callback' && <FloatingCallout text="Hannah moved to Callback — auto-resurfaces Wed AM" icon={Clock} color={T.warning} />}
      {scene === 'schedule' && <FloatingCallout text="Marcus dragged onto Doug's Monday 10am slot" icon={Calendar} />}
      {scene === 'earnings' && <FloatingCallout text="2 booked → $50 pending (paid when they become quotes)" icon={DollarSign} color={T.successDark} />}
    </div>
  )
}

function SetterLeadCard({ lead, highlight }) {
  return (
    <motion.div
      animate={highlight ? { borderColor: T.accent, scale: [1, 1.04, 1] } : { borderColor: T.border, scale: 1 }}
      transition={{ scale: { repeat: highlight ? Infinity : 0, duration: 1.4 } }}
      style={{ padding: '5px 6px', background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 5, boxShadow: highlight ? '0 4px 12px rgba(90,99,73,0.2)' : '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lead.name}
      </div>
      {lead.attempts > 0 && (
        <div style={{ fontSize: 8, color: T.textMuted }}>{lead.attempts} attempts</div>
      )}
      {lead.callbackDay && (
        <div style={{ fontSize: 8, color: T.warning, fontWeight: 600 }}>📞 {lead.callbackDay}</div>
      )}
    </motion.div>
  )
}

function EarnPill({ label, value, color }) {
  return (
    <div style={{ padding: '4px 8px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11 }}>
      <span style={{ fontWeight: 700, color: color || T.text }}>{value}</span>
      <span style={{ color: T.textMuted }}> {label}</span>
    </div>
  )
}

function FloatingCallout({ text, icon: Icon, color = T.accent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      style={{
        position: 'absolute',
        bottom: 50, left: 18, right: 18,
        padding: '8px 12px',
        background: T.bgCard,
        border: `1.5px solid ${color}`,
        borderRadius: 9,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
        zIndex: 4,
      }}
    >
      <Icon size={14} style={{ color }} />
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{text}</div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    board:    '1. Four columns — New, Contacted, Callback, Qualified',
    attempt:  '2. Log contact attempts — phone, email, text',
    callback: '3. Callback auto-resurfaces on the scheduled day',
    schedule: "4. Drag onto rep's calendar to book the appointment",
    earnings: '5. Live earnings counter — setters know their worth',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to set up the workflow'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
