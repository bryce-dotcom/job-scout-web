// Job Board walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/PMJobSetter.jsx — week-view Gantt + per-employee rows.
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, ChevronLeft, ChevronRight, Search, Filter,
  Briefcase, PlayCircle, CheckCircle2, ClipboardList, PauseCircle, Plus,
  User, MapPin, Clock,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/job-board.js'

const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
}

// defaultStatusColors from PMJobSetter.jsx
const STATUS_COLORS = {
  'Chillin':     '#6382bf',
  'Scheduled':   '#3b82f6',
  'In Progress': '#f59e0b',
  'On Hold':     '#6b7280',
  'Complete':    '#22c55e',
}

// calendarColors from PMJobSetter.jsx line 22
const CAL_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DATES = ['Jun 9', 'Jun 10', 'Jun 11', 'Jun 12', 'Jun 13', 'Jun 14']

const EMPLOYEES = [
  { id: 1, name: 'Doug Anderson', color: CAL_COLORS[0] },
  { id: 2, name: 'Tracy Benson',  color: CAL_COLORS[1] },
  { id: 3, name: 'Crew 2',        color: CAL_COLORS[2] },
]

// Jobs placed on the board: { emp, startDay (0-based), spanDays, title, status }
const PLACED_JOBS = [
  { id: 1, emp: 0, startDay: 0, spanDays: 2, title: 'LED Retrofit — Northbridge', customer: 'Marcus Okafor',   status: 'In Progress', amount: 24500 },
  { id: 2, emp: 0, startDay: 3, spanDays: 1, title: 'Parking Lot LED',            customer: 'David Kim',      status: 'Scheduled',   amount: 12000 },
  { id: 3, emp: 1, startDay: 1, spanDays: 1, title: 'Fleet Wrap Package',         customer: 'Sarah Chen',     status: 'Scheduled',   amount: 18200 },
  { id: 4, emp: 1, startDay: 4, spanDays: 1, title: 'Solar Panel Array',          customer: 'Ryan Torres',    status: 'In Progress', amount: 48200 },
  { id: 5, emp: 2, startDay: 0, spanDays: 3, title: 'Warehouse LED',              customer: 'Brady Marsh',    status: 'In Progress', amount: 34500 },
]

export default function JobBoardWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your job board is live." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showDetail = scene === 'detail'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Job Board</span>
          {/* Week nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button style={{ padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer' }}><ChevronLeft size={11} /></button>
            <span style={{ fontSize: '10px', color: T.textMuted, whiteSpace: 'nowrap' }}>Jun 9 – Jun 14, 2026</span>
            <button style={{ padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer' }}><ChevronRight size={11} /></button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={10} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input readOnly placeholder="Search..." style={{ padding: '4px 6px 4px 18px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bg, color: T.text, outline: 'none', width: '100px' }} />
          </div>
          <select style={{ padding: '4px 6px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bg, color: T.textSecondary }}>
            <option>All PMs</option>
          </select>
          <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={10} />Schedule
          </button>
        </div>
      </div>

      {/* Gantt grid */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <GanttGrid scene={scene} />
        {showDetail && <JobDetailPanel />}
      </div>
    </div>
  )
}

function GanttGrid({ scene }) {
  const highlight = scene === 'drag' ? 2 : null // highlight Thu column
  const COL_W = '13.5%'
  const ROW_H = '70px'

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Day headers */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, backgroundColor: T.bgCard }}>
        <div style={{ width: '100px', flexShrink: 0, padding: '6px 8px', fontSize: '10px', fontWeight: '600', color: T.textMuted, borderRight: `1px solid ${T.border}` }}>Employee</div>
        {DAYS.map((day, i) => (
          <div key={day} style={{ flex: 1, padding: '6px 4px', textAlign: 'center', backgroundColor: highlight === i ? T.accentBg : 'transparent', borderRight: `1px solid ${T.border}` }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted }}>{day}</div>
            <div style={{ fontSize: '10px', color: i === 0 ? T.accent : T.text, fontWeight: i === 0 ? '600' : '400' }}>{DATES[i]}</div>
          </div>
        ))}
      </div>

      {/* Employee rows */}
      {EMPLOYEES.map((emp, eIdx) => (
        <div key={emp.id} style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, minHeight: ROW_H, position: 'relative' }}>
          {/* Name col */}
          <div style={{ width: '100px', flexShrink: 0, padding: '8px', display: 'flex', alignItems: 'center', gap: '5px', borderRight: `1px solid ${T.border}`, backgroundColor: T.bgCard }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: emp.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', color: emp.color, flexShrink: 0 }}>
              {emp.name.charAt(0)}
            </div>
            <span style={{ fontSize: '10px', fontWeight: '500', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</span>
          </div>
          {/* Day cells */}
          {DAYS.map((_, dIdx) => (
            <div key={dIdx} style={{ flex: 1, borderRight: `1px solid ${T.border}`, backgroundColor: highlight === dIdx ? T.accentBg + '60' : 'transparent', position: 'relative' }} />
          ))}
          {/* Job bars */}
          {PLACED_JOBS.filter(j => j.emp === eIdx).map(job => {
            const sc = STATUS_COLORS[job.status] || T.accent
            const left = `calc(100px + ${job.startDay} * (100% - 100px) / 6)`
            const width = `calc(${job.spanDays} * (100% - 100px) / 6 - 4px)`
            return (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (eIdx + job.startDay) * 0.06, duration: 0.25 }}
                style={{
                  position: 'absolute',
                  left, top: '8px', width,
                  height: 'calc(100% - 16px)',
                  backgroundColor: sc + '20',
                  border: `1.5px solid ${sc}`,
                  borderRadius: '5px',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  zIndex: 1,
                }}
              >
                <div style={{ fontSize: '9px', fontWeight: '700', color: sc, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.title}
                </div>
                <div style={{ fontSize: '8px', color: T.textSecondary, marginTop: '1px' }}>{job.customer}</div>
                {job.amount > 0 && (
                  <div style={{ fontSize: '9px', fontWeight: '700', color: T.accent, marginTop: '2px' }}>${job.amount.toLocaleString()}</div>
                )}
              </motion.div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function JobDetailPanel() {
  const job = PLACED_JOBS[0]
  return (
    <motion.div
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{ width: '200px', flexShrink: 0, backgroundColor: T.bgCard, borderLeft: `1px solid ${T.border}`, padding: '12px', overflowY: 'auto' }}
    >
      <div style={{ fontSize: '12px', fontWeight: '600', color: T.text, marginBottom: '8px' }}>LED Retrofit — Northbridge</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
        <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: STATUS_COLORS['In Progress'] + '20', color: STATUS_COLORS['In Progress'] }}>In Progress</span>
      </div>
      {[
        [User,   'Marcus Okafor'],
        [MapPin, '1440 S Temple, SLC'],
        [Clock,  'Jun 9 – Jun 10'],
      ].map(([Icon, label]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: T.textSecondary, marginBottom: '3px' }}>
          <Icon size={10} />{label}
        </div>
      ))}
      <div style={{ fontSize: '14px', fontWeight: '700', color: T.accent, marginTop: '6px' }}>$24,500</div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    board:    '1 · Job Board — week-view Gantt, per-employee rows, colored job bars',
    drag:     '2 · Drag a job bar to reschedule — target column highlights on hover',
    detail:   '3 · Click a job bar → detail panel slides in with status, customer, date, amount',
    filter:   '4 · Filter by PM, status, or business unit — non-admins see only their rows',
    schedule: '5 · + Schedule button opens the job scheduling modal — pick job + date + PM',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How the job board works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
