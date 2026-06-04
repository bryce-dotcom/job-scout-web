// Lead Setter walkthrough — rebuilt to Prospect Scout standard.
//
// Renders a near-pixel reproduction of the actual LeadSetter page:
//   • Header: title + subtitle, commission strip (green pill), search,
//     "Reactivate Customer" + "Find Prospects" + refresh + settings.
//   • Left pane (450px): 4-column stats strip (New/Contacted/Callback/
//     Scheduled, color-coded with stage.color) plus a kanban with
//     real card structure (customer_name, attempts pill, phone,
//     service_type, callback chip, last-note italic, time-since chip).
//   • Right pane: week calendar — table layout, 60px hour col + 7
//     day cols, 7am–7pm slots. Day header has weekday + date.
//     Appointment chips in salesperson color.
//
// 5 scenes drive a state machine, modeled on the real workflow:
//   board → contact → callback → schedule → commission.
// Same five narration keys back into ElevenLabs MP3s.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone, Mail, MapPin, Search, RefreshCw, Settings, Plus, DollarSign,
  User, Clock, Calendar, ChevronLeft, ChevronRight, X, CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/lead-setter.js'

// ─── Theme — matches the actual app theme used in LeadSetter ──────────
// Pulled from defaultTheme in LeadSetter.jsx so the walkthrough renders
// in the same colors as the real page. Don't change these in isolation
// — if the app theme changes, this needs to follow.
const T = {
  bg:           '#f7f5ef',
  bgCard:       '#ffffff',
  border:       '#d6cdb8',
  text:         '#2c3530',
  textSecondary:'#4d5a52',
  textMuted:    '#7d8a7f',
  accent:       '#5a6349',
  accentBg:     'rgba(90,99,73,0.12)',
  // commission strip — matches the #dcfce7 / #166534 / #15803d / #86efac
  // values hardcoded in the real LeadSetter header
  commBg:       '#dcfce7',
  commText:     '#166534',
  commSub:      '#15803d',
  commDivider:  '#86efac',
  // Find Prospects button — verbatim from LeadSetter.jsx line 1020
  prospectsPurple: '#7c3aed',
  // Stage colors copied from setterStages in LeadSetter.jsx
  stageNew:        '#3b82f6',
  stageContacted:  '#8b5cf6',
  stageCallback:   '#eab308',
  stageScheduled:  '#10b981',
  // Calendar overlay chip colors from chipColors in LeadSetter.jsx
  rep1: '#3b82f6',
  rep2: '#8b5cf6',
  rep3: '#f59e0b',
  // Callback chips — overdue red, upcoming amber (verbatim from line 1290)
  callbackOverdue: '#ef4444',
  callbackUpcoming:'#f59e0b',
}

const STAGES = [
  { id: 'New',             label: 'New Leads', color: T.stageNew      },
  { id: 'Contacted',       label: 'Contacted', color: T.stageContacted },
  { id: 'Callback',        label: 'Callback',  color: T.stageCallback  },
  { id: 'Appointment Set', label: 'Scheduled', color: T.stageScheduled },
]

// ─── Mock leads — shape mirrors leads table columns the kanban reads ──
const SARAH = {
  id: 1,
  customer_name: 'Sarah Chen',
  phone: '(801) 555-0142',
  email: 'sarah@northbridge.com',
  address: '6395 W 10400 N, Highland UT',
  service_type: 'LED Retrofit',
  lead_source: 'Yelp',
  contact_attempts: 2,
  notes: '[Jun 3 11:14 AM] Decision maker found · Sarah · Facilities Director',
  last_contact_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  status: 'New',
}
const MARCUS = {
  id: 2,
  customer_name: 'Marcus Reeves',
  phone: '(801) 555-0118',
  service_type: 'Wallpack Retrofit',
  contact_attempts: 1,
  status: 'New',
  last_contact_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
}
const PRIYA = {
  id: 3,
  customer_name: 'Priya Anand',
  phone: '(801) 555-0203',
  service_type: 'Full audit',
  contact_attempts: 1,
  status: 'Contacted',
  last_contact_at: new Date(Date.now() - 8 * 3600_000).toISOString(),
  notes: '[Jun 3 10:02 AM] Left voicemail · told her we\'d email a deck',
}
const DAVID = {
  id: 4,
  customer_name: 'David Okafor',
  phone: '(801) 555-0455',
  service_type: 'LED + sensors',
  contact_attempts: 3,
  status: 'Callback',
  callback_date: '2026-06-06T14:00:00',
  callback_notes: 'Wants to loop in the COO',
  notes: '[Jun 3 9:14 AM] Spoke with him · wants Thu',
}

// ─── Main ─────────────────────────────────────────────────────────────
export default function LeadSetterWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%',
      paddingBottom: '56.25%',
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist
                title={`Set it up in ${card.setup.steps.length} steps`}
                steps={card.setup.steps}
                currentIdx={setupIdx}
              />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="That's the daily loop. Replay anytime." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage — props feed the state machine into the real-component
// reproductions of the page header, kanban, and calendar ──────────────
function Stage({ scene, sceneElapsed }) {
  const SARAH_TYPED_CALLBACK_TIME = 'Jun 06 · 2:00 PM'
  const callbackTyped = scene === 'callback'
    ? SARAH_TYPED_CALLBACK_TIME.slice(0, Math.floor(sceneElapsed / 80))
    : SARAH_TYPED_CALLBACK_TIME
  const callbackDoneTyping = callbackTyped.length >= SARAH_TYPED_CALLBACK_TIME.length
  const sarahLandedInCallback = scene === 'callback' && sceneElapsed > 4400
  const sarahLandedInScheduled = (scene === 'schedule' && sceneElapsed > 4400) || scene === 'commission'

  const sarahNow =
    sarahLandedInScheduled ? { ...SARAH, status: 'Appointment Set', appointment_time: '2026-06-09T14:00:00' }
    : sarahLandedInCallback ? { ...SARAH, status: 'Callback', callback_date: '2026-06-06T14:00:00' }
    : SARAH

  const newCol = sarahLandedInCallback || sarahLandedInScheduled ? [MARCUS] : [sarahNow, MARCUS]
  const contactedCol = [PRIYA]
  const callbackCol = sarahLandedInCallback ? [sarahNow, DAVID] : [DAVID]
  const scheduledCol = sarahLandedInScheduled ? [sarahNow] : []

  const stageCounts = {
    'New':              newCol.length,
    'Contacted':        contactedCol.length,
    'Callback':         callbackCol.length,
    'Appointment Set':  scheduledCol.length,
  }

  const showContactModal = scene === 'contact' || scene === 'callback'
  const contactModalOutcome = scene === 'callback' ? 'callback' : 'idle'
  const showAppointmentModal = scene === 'schedule'
  const highlightCommissionStrip = scene === 'commission'
  const highlightSarahCard = scene === 'board' || scene === 'contact'

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header highlightCommissionStrip={highlightCommissionStrip} />

      <div style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>
        <KanbanPane
          stageCounts={stageCounts}
          newCol={newCol}
          contactedCol={contactedCol}
          callbackCol={callbackCol}
          scheduledCol={scheduledCol}
          highlightSarahId={highlightSarahCard ? SARAH.id : null}
          flashIntoCallback={sarahLandedInCallback}
          flashIntoScheduled={sarahLandedInScheduled}
        />
        <CalendarPane showScheduledChip={sarahLandedInScheduled} />
      </div>

      <AnimatePresence>
        {showContactModal && (
          <ContactModal
            key="contact-modal"
            lead={SARAH}
            outcome={contactModalOutcome}
            callbackTyped={callbackTyped}
            callbackDoneTyping={callbackDoneTyping}
          />
        )}
        {showAppointmentModal && (
          <AppointmentModal
            key="appt-modal"
            lead={SARAH}
            sceneElapsed={sceneElapsed}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Header — verbatim layout of LeadSetter header ────────────────────
function Header({ highlightCommissionStrip }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>Lead Setter</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: T.textMuted }}>Drag leads to calendar to schedule appointments</p>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <CommissionStrip highlight={highlightCommissionStrip} />
        <HeaderButton><Search size={14} style={{ color: T.textMuted, marginRight: 4 }} /> Search leads</HeaderButton>
        <HeaderButton accent>
          <Plus size={13} /> Reactivate Customer
        </HeaderButton>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '8px 12px',
          background: T.prospectsPurple, color: '#fff',
          border: 'none', borderRadius: 7,
          fontSize: 12, fontWeight: 700,
        }}>
          <Search size={13} /> Find Prospects
        </div>
        <IconButton><RefreshCw size={14} /></IconButton>
        <IconButton><Settings size={14} /></IconButton>
      </div>
    </div>
  )
}

function CommissionStrip({ highlight }) {
  return (
    <motion.div
      animate={highlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={highlight ? { repeat: Infinity, duration: 1.4 } : { duration: 0 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '7px 12px',
        background: T.commBg, color: T.commText,
        borderRadius: 8, fontSize: 12,
        border: highlight ? `1.5px solid ${T.commText}` : '1.5px solid transparent',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <DollarSign size={13} />
        <span style={{ fontWeight: 700 }}>$25</span>
        <span style={{ color: T.commSub }}>/appt</span>
      </div>
      <div style={{ width: 1, height: 14, background: T.commDivider }} />
      <div>
        <span style={{ fontWeight: 700 }}>4</span>
        <span style={{ color: T.commSub }}> pending</span>
      </div>
      <div style={{ width: 1, height: 14, background: T.commDivider }} />
      <div>
        <span style={{ fontWeight: 700 }}>$175</span>
        <span style={{ color: T.commSub }}> earned</span>
      </div>
    </motion.div>
  )
}

function HeaderButton({ children, accent }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '8px 12px',
      background: accent ? T.accentBg : 'transparent',
      border: `1px solid ${accent ? T.accent : T.border}`,
      color: accent ? T.accent : T.textSecondary,
      borderRadius: 7,
      fontSize: 12, fontWeight: 500,
    }}>
      {children}
    </div>
  )
}
function IconButton({ children }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      padding: 8,
      background: 'transparent',
      border: `1px solid ${T.border}`,
      color: T.textSecondary,
      borderRadius: 7,
    }}>{children}</div>
  )
}

// ─── Kanban pane (left 450px) ─────────────────────────────────────────
function KanbanPane({ stageCounts, newCol, contactedCol, callbackCol, scheduledCol, highlightSarahId, flashIntoCallback, flashIntoScheduled }) {
  return (
    <div style={{ width: 450, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Stats row — 4 stage cards */}
      <div style={{ display: 'flex', gap: 6 }}>
        {STAGES.map(s => (
          <div key={s.id} style={{
            flex: 1, padding: 8,
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 8, textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{stageCounts[s.id]}</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Kanban columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, flex: 1, overflow: 'hidden' }}>
        <Column stage={STAGES[0]} leads={newCol} highlightLeadId={highlightSarahId} />
        <Column stage={STAGES[1]} leads={contactedCol} />
        <Column stage={STAGES[2]} leads={callbackCol} flashLeadId={flashIntoCallback ? SARAH.id : null} />
        <Column stage={STAGES[3]} leads={scheduledCol} flashLeadId={flashIntoScheduled ? SARAH.id : null} />
      </div>
    </div>
  )
}

function Column({ stage, leads, highlightLeadId, flashLeadId }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 8px',
        background: stage.color, color: '#fff',
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>{stage.label.split(' ')[0]}</span>
        <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 8, padding: '1px 6px' }}>{leads.length}</span>
      </div>
      <div style={{ flex: 1, padding: 4, display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(0,0,0,0.02)', overflow: 'hidden' }}>
        {leads.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: T.textMuted }}>No leads</div>
        ) : (
          leads.map(l => (
            <LeadCard
              key={l.id}
              lead={l}
              highlight={l.id === highlightLeadId}
              flash={l.id === flashLeadId}
            />
          ))
        )}
      </div>
    </div>
  )
}

function LeadCard({ lead, highlight, flash }) {
  const cb = lead.callback_date ? new Date(lead.callback_date) : null
  const isOverdue = cb && cb <= new Date()
  const hasCallback = !!cb
  const lastNote = lead.notes ? lead.notes.split('\n')[0] : null
  const lastNoteClean = lastNote ? lastNote.replace(/^\[.*?\]\s*/, '') : null
  const hoursSince = lead.last_contact_at
    ? Math.floor((Date.now() - new Date(lead.last_contact_at)) / 36e5)
    : null

  return (
    <motion.div
      initial={flash ? { opacity: 0, x: -12, scale: 0.95 } : false}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        padding: '6px 7px',
        background: isOverdue ? 'rgba(239,68,68,0.06)' : T.bgCard,
        border: highlight
          ? `1.5px solid ${T.accent}`
          : `1px solid ${isOverdue ? 'rgba(239,68,68,0.3)' : T.border}`,
        borderRadius: 6,
        boxShadow: highlight ? '0 0 0 3px rgba(90,99,73,0.15)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {lead.customer_name}
        </div>
        {lead.contact_attempts > 0 && (
          <span style={{ fontSize: 9, color: T.textMuted, background: T.bg, padding: '1px 4px', borderRadius: 3 }}>
            {lead.contact_attempts}x
          </span>
        )}
      </div>
      {lead.phone && (
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>{lead.phone}</div>
      )}
      {lead.service_type && (
        <div style={{ fontSize: 9, color: T.accent, marginTop: 1 }}>{lead.service_type}</div>
      )}
      {hasCallback && (
        <div style={{
          marginTop: 3, fontSize: 9, fontWeight: 600,
          color: isOverdue ? T.callbackOverdue : T.callbackUpcoming,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <Clock size={9} />
          {isOverdue ? 'Overdue: ' : 'Callback: '}
          {cb.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
      {lastNoteClean && (
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lastNoteClean}
        </div>
      )}
      {hoursSince !== null && !hasCallback && (
        <div style={{ fontSize: 9, marginTop: 2, color: hoursSince > 48 ? T.callbackOverdue : hoursSince > 24 ? T.callbackUpcoming : T.textMuted }}>
          {hoursSince < 1 ? 'Just contacted' : hoursSince < 24 ? `${hoursSince}h ago` : `${Math.floor(hoursSince / 24)}d ago`}
        </div>
      )}
    </motion.div>
  )
}

// ─── Calendar pane (right) ────────────────────────────────────────────
// Table layout, 60px hour col + 7 day cols, 7am-7pm slots. Mirrors the
// real calendar grid (LeadSetter.jsx line ~1517).
function CalendarPane({ showScheduledChip }) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const dates = [7, 8, 9, 10, 11, 12, 13] // Jun 7-13, 2026
  const today = 2 // Tue
  const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

  return (
    <div style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Calendar header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 10, background: T.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <NavBtn><ChevronLeft size={12} /></NavBtn>
          <NavBtn><span style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary }}>Today</span></NavBtn>
          <NavBtn><ChevronRight size={12} /></NavBtn>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>June 2026</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>Jun 7 - Jun 13</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5 }}>
          <div style={{ padding: '4px 9px', background: '#fef3c7', color: '#92400e', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid #f59e0b', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Clock size={11} /> Block Time
          </div>
          <div style={{ padding: '4px 9px', background: 'transparent', color: T.textSecondary, borderRadius: 5, fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <User size={11} /> Only mine?
          </div>
        </div>
      </div>

      {/* Salesperson overlay chips */}
      <div style={{
        padding: '5px 12px', background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Show:</span>
        {[
          { name: 'Cole',   color: T.rep1, on: true },
          { name: 'Marcus', color: T.rep2, on: true },
          { name: 'Priya',  color: T.rep3, on: false },
        ].map(sp => (
          <div key={sp.name} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', borderRadius: 10,
            border: `1.5px solid ${sp.color}`,
            background: sp.on ? sp.color : 'transparent',
            color: sp.on ? '#fff' : sp.color,
            fontSize: 10, fontWeight: 600,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sp.on ? '#fff' : sp.color }} />
            {sp.name}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: 50, padding: 4, borderBottom: `1px solid ${T.border}`, background: T.bg }}></th>
              {days.map((d, i) => (
                <th key={d} style={{
                  padding: '6px 4px',
                  borderBottom: `1px solid ${T.border}`,
                  borderLeft: `1px solid ${T.border}`,
                  background: i === today ? T.accentBg : T.bg,
                }}>
                  <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase' }}>{d}</div>
                  <div style={{ fontSize: 14, fontWeight: i === today ? 700 : 500, color: i === today ? T.accent : T.text }}>{dates[i]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map(h => (
              <tr key={h}>
                <td style={{ padding: '2px 6px', fontSize: 9, color: T.textMuted, textAlign: 'right', verticalAlign: 'top', borderBottom: `1px solid ${T.border}` }}>
                  {h > 12 ? `${h-12}:00 PM` : h === 12 ? '12:00 PM' : `${h}:00 AM`}
                </td>
                {dates.map((_, i) => {
                  const isToday = i === today
                  const baseline = i === 2 && h === 10 ? { rep: 'Marcus', repColor: T.rep2, customer: 'Solera' } : null
                  const cole = i === 4 && h === 9 ? { rep: 'Cole', repColor: T.rep1, customer: 'Granite' } : null
                  const sarah = i === 2 && h === 14 && showScheduledChip ? { rep: 'Cole', repColor: T.rep1, customer: 'Sarah Chen' } : null
                  const block = i === 3 && h === 11

                  return (
                    <td key={i} style={{
                      padding: 2,
                      borderBottom: `1px solid ${T.border}`,
                      borderLeft: `1px solid ${T.border}`,
                      height: 30,
                      verticalAlign: 'top',
                      background: isToday ? 'rgba(90,99,73,0.04)' : block ? 'rgba(125,138,127,0.05)' : 'transparent',
                    }}>
                      {baseline && <AppointmentChip {...baseline} />}
                      {cole && <AppointmentChip {...cole} />}
                      {sarah && <AppointmentChip {...sarah} fadeIn />}
                      {block && <BlockChip />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NavBtn({ children }) {
  return (
    <div style={{
      padding: '4px 7px',
      background: 'transparent',
      border: `1px solid ${T.border}`,
      borderRadius: 5,
      color: T.textSecondary,
      fontSize: 11,
      display: 'inline-flex', alignItems: 'center',
    }}>{children}</div>
  )
}

function AppointmentChip({ rep, repColor, customer, fadeIn }) {
  return (
    <motion.div
      initial={fadeIn ? { opacity: 0, scale: 0.85 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        padding: '3px 5px',
        background: repColor,
        color: '#fff',
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 600,
        lineHeight: 1.2,
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer}</div>
      <div style={{ fontSize: 8, opacity: 0.85, fontWeight: 500 }}>{rep}</div>
    </motion.div>
  )
}
function BlockChip() {
  return (
    <div style={{
      padding: '3px 5px',
      background: '#fef3c7', color: '#92400e',
      border: '1px solid #f59e0b',
      borderRadius: 4,
      fontSize: 9, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 3,
    }}>
      <Clock size={8} /> PTO
    </div>
  )
}

// ─── Contact Modal ────────────────────────────────────────────────────
// Mirrors the real Lead Detail modal (LeadSetter.jsx ~line 1915):
//   header (name + service_type · via source · N attempts) + close
//   green tel: button + accent email button
//   address pill
//   notes history block
//   "Log This Contact" with notes box + callback date/time + 4 outcomes
function ContactModal({ lead, outcome, callbackTyped, callbackDoneTyping }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 5 }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }}
        style={{
          background: T.bgCard, borderRadius: 14, width: '100%', maxWidth: 440,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.text }}>{lead.customer_name}</h2>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span>{lead.service_type}</span>
              <span>via {lead.lead_source}</span>
              <span>{lead.contact_attempts} attempts</span>
            </div>
          </div>
          <div style={{ color: T.textMuted, display: 'flex', gap: 4 }}>
            <ChevronRight size={16} />
            <X size={16} />
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <div style={{ flex: 1, padding: 10, background: T.commBg, color: T.commText, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
              <Phone size={15} /> {lead.phone}
            </div>
            <div style={{ padding: 10, background: T.accentBg, color: T.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={14} />
            </div>
          </div>

          {lead.address && (
            <div style={{ padding: '6px 8px', background: T.bg, borderRadius: 6, fontSize: 11, color: T.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
              <MapPin size={12} /> {lead.address}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes History</div>
            <div style={{ padding: 8, background: T.bg, borderRadius: 6, fontSize: 11, color: T.textSecondary, whiteSpace: 'pre-wrap' }}>
              {lead.notes || '—'}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Log This Contact</div>
            <div style={{
              padding: '8px 10px', background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 7,
              fontSize: 12, color: T.textMuted, fontStyle: 'italic',
              minHeight: 36, marginBottom: 8,
            }}>
              {outcome === 'callback' ? 'Wants to circle back Thursday at 2 — said she\'d loop in IT' : 'What happened? Left voicemail, spoke with decision maker, got info...'}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: T.textMuted, display: 'block', marginBottom: 2 }}>Callback Date</label>
                <div style={{
                  padding: '7px 9px',
                  border: outcome === 'callback' ? `1.5px solid ${T.callbackUpcoming}` : `1px solid ${T.border}`,
                  borderRadius: 6, fontSize: 12, color: T.text,
                  background: T.bgCard, minHeight: 14,
                }}>
                  {outcome === 'callback' ? (
                    <>
                      {callbackTyped}
                      {!callbackDoneTyping && (
                        <motion.span
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                          style={{ display: 'inline-block', width: 1.5, height: 11, background: T.callbackUpcoming, marginLeft: 2, transform: 'translateY(2px)' }}
                        />
                      )}
                    </>
                  ) : <span style={{ color: T.textMuted, fontStyle: 'italic' }}>mm/dd/yyyy</span>}
                </div>
              </div>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: 10, color: T.textMuted, display: 'block', marginBottom: 2 }}>Time</label>
                <div style={{ padding: '7px 9px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, color: T.textMuted, background: T.bgCard, minHeight: 14, fontStyle: 'italic' }}>
                  --:--
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <OutcomeBtn label={outcome === 'callback' && callbackDoneTyping ? 'Set Callback' : 'Contacted'} highlight={outcome === 'callback' && callbackDoneTyping} icon={CheckCircle2} color={T.commText} bg={T.commBg} />
              <OutcomeBtn label="No Answer" icon={Phone} color={T.textSecondary} bg={T.bg} />
              <OutcomeBtn label="Not Qualified" icon={X} color={T.callbackOverdue} bg="rgba(239,68,68,0.08)" />
              <OutcomeBtn label="Schedule" icon={Calendar} color={T.accent} bg={T.accentBg} />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function OutcomeBtn({ label, icon: Icon, color, bg, highlight }) {
  return (
    <motion.div
      animate={highlight ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={highlight ? { repeat: Infinity, duration: 1.4 } : { duration: 0 }}
      style={{
        padding: '8px 10px',
        background: bg,
        color,
        borderRadius: 6,
        fontSize: 12, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        border: highlight ? `1.5px solid ${color}` : '1.5px solid transparent',
      }}
    >
      <Icon size={12} /> {label}
    </motion.div>
  )
}

// ─── Appointment Modal ────────────────────────────────────────────────
// Mirrors Schedule Appointment modal (LeadSetter.jsx ~line 1632)
function AppointmentModal({ lead, sceneElapsed }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 5 }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }}
        style={{
          background: T.bgCard, borderRadius: 14, width: '100%', maxWidth: 440,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.text }}>Schedule Appointment</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>{lead.customer_name}</p>
          </div>
          <X size={16} style={{ color: T.textMuted }} />
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Date & Time *">
            <div style={{ padding: '8px 10px', border: `1.5px solid ${T.accent}`, borderRadius: 6, fontSize: 13, color: T.text, background: T.bgCard }}>
              Jun 9, 2026 · 2:00 PM
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label="Duration" style={{ flex: 1 }}>
              <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 13, color: T.text, background: T.bgCard }}>60 minutes</div>
            </Field>
            <Field label="Salesperson" style={{ flex: 1 }}>
              <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 13, color: T.text, background: T.bgCard, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.rep1 }} /> Cole
              </div>
            </Field>
          </div>
          <Field label="Location">
            <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 13, color: T.text, background: T.bgCard }}>
              {lead.address}
            </div>
          </Field>
          <Field label="Notes">
            <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, color: T.textMuted, fontStyle: 'italic', background: T.bgCard, minHeight: 32 }}>
              Walk the warehouse with Sarah to scope fixture count.
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, padding: 10, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, textAlign: 'center', fontSize: 13 }}>Cancel</div>
            <motion.div
              animate={sceneElapsed > 3000 ? { scale: [1, 1.05, 1] } : { scale: 1 }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{ flex: 1, padding: 10, background: T.accent, color: '#fff', borderRadius: 7, textAlign: 'center', fontSize: 13, fontWeight: 600 }}
            >
              Schedule
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: T.textSecondary, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Caption ──────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    board:      "1. Lead Setter — 4-column kanban left · week calendar right",
    contact:    "2. Click a lead — log call, email, address, notes",
    callback:   '3. Drag to Callback → contact modal captures the date',
    schedule:   '4. Drag to a calendar slot → appointment modal opens',
    commission: '5. Top strip ticks +1 pending · commission earned live',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Three settings to configure'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the daily loop. Replay anytime."
  return ''
}
