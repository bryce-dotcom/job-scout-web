// Job Calendar walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/JobCalendar.jsx
// DO NOT import ZachShell — reproduces real month-calendar grid with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/job-calendar.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// statusColors from JobCalendar.jsx lines 31-37
const STATUS_COLORS = {
  'Scheduled':   '#5a6349',
  'In Progress': '#c28b38',
  'Completed':   '#4a7c59',
  'Cancelled':   '#8b5a5a',
  'On Hold':     '#7d8a7f',
}

// Mock jobs on specific days of June 2026
const JOB_EVENTS = {
  3:  [{ id: 1, title: 'Parking Lot LED',   status: 'Scheduled',   customer: 'David Kim'      }],
  9:  [{ id: 2, title: 'LED Retrofit — Northbridge', status: 'In Progress', customer: 'Marcus Okafor' }],
  10: [{ id: 3, title: 'LED Retrofit — Northbridge', status: 'In Progress', customer: 'Marcus Okafor' }],
  11: [{ id: 4, title: 'Solar Panel Array', status: 'In Progress', customer: 'Ryan Torres'    }],
  12: [{ id: 5, title: 'Fleet Wrap Package',status: 'Scheduled',   customer: 'Sarah Chen'     }, { id: 6, title: 'Warehouse LED', status: 'Scheduled', customer: 'Brady Marsh' }],
  15: [{ id: 7, title: 'Office Retrofit',   status: 'Scheduled',   customer: 'Jennifer Walsh' }],
  18: [{ id: 8, title: 'Solar Panel Array', status: 'Completed',   customer: 'Ryan Torres'    }],
  22: [{ id: 9, title: 'Parking Lot LED',   status: 'Completed',   customer: 'David Kim'      }],
}

// June 2026 layout: June 1 = Monday (index 1 in Sun-based week = 1)
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const JUNE_START_DOW = 1 // June 1, 2026 is Monday (Sun=0, Mon=1)
const JUNE_DAYS = 30

export default function JobCalendarWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every job on the calendar." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  // Build calendar grid: pad with nulls before June 1
  const cells = []
  for (let i = 0; i < JUNE_START_DOW; i++) cells.push(null)
  for (let d = 1; d <= JUNE_DAYS; d++) cells.push(d)
  // Pad to complete last week
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, overflow: 'hidden' }}>
      {/* Calendar header */}
      <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={14} style={{ color: T.accent }} />
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Jobs Calendar</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button style={{ padding: '4px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', cursor: 'pointer' }}><ChevronLeft size={11} /></button>
          <span style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>June 2026</span>
          <button style={{ padding: '4px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', cursor: 'pointer' }}><ChevronRight size={11} /></button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}` }}>
        {DAYS_OF_WEEK.map(d => (
          <div key={d} style={{ padding: '5px 0', textAlign: 'center', fontSize: '9px', fontWeight: '600', color: T.textMuted }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', overflow: 'hidden' }}>
        {cells.map((day, idx) => {
          const jobs = day ? (JOB_EVENTS[day] || []) : []
          const isToday = day === 9 // highlight Jun 9 as "today"
          return (
            <div key={idx} style={{
              borderRight: `1px solid ${T.border}`,
              borderBottom: `1px solid ${T.border}`,
              backgroundColor: isToday ? T.accentBg : 'transparent',
              padding: '3px 4px',
              overflow: 'hidden',
              minHeight: 0,
            }}>
              {day && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: isToday ? '700' : '400', color: isToday ? T.accent : T.textSecondary, marginBottom: '2px' }}>{day}</div>
                  {jobs.slice(0, 2).map(job => {
                    const color = STATUS_COLORS[job.status] || T.accent
                    return (
                      <div key={job.id} style={{ padding: '1px 4px', marginBottom: '1px', borderRadius: '3px', backgroundColor: color + '18', borderLeft: `2px solid ${color}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '8px', color }}>
                        {job.title}
                      </div>
                    )
                  })}
                  {jobs.length > 2 && <div style={{ fontSize: '8px', color: T.textMuted }}>+{jobs.length - 2} more</div>}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview: '1 · Jobs Calendar — month view, every scheduled job as a colored bar',
    week:     '2 · Jobs appear on the day they start — color = status (Scheduled/In Progress/Completed)',
    multi:    '3 · Multi-day jobs span multiple cells; "+N more" shows when a day has extras',
    filter:   '4 · Navigate months with arrows · today highlighted in accentBg',
    click:    '5 · Click any job chip → opens Job Detail page',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How the Jobs Calendar works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
