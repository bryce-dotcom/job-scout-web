// Jobs walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Jobs.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase, Plus, Search, Columns3, List, Upload, Download,
  Map, Calendar, Trophy, Coffee, Play, CheckCircle, User, ExternalLink,
  ArrowRight, Archive, X,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/jobs.js'

// ─── Theme ─────────────────────────────────────────────────────────────────
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

// Board columns from Jobs.jsx boardColumns (lines 475-496)
const BOARD_COLS = [
  { id: 'Chillin',     name: 'Chillin',     color: '#6382bf', icon: Coffee },
  { id: 'Scheduled',   name: 'Scheduled',   color: '#5a6349', icon: Calendar },
  { id: 'In Progress', name: 'In Progress', color: '#c28b38', icon: Play },
  { id: 'Completed',   name: 'Completed',   color: '#4a7c59', icon: CheckCircle },
]

// Mock jobs — matching real jobs table fields
const MOCK_JOBS = {
  'Chillin': [
    { id: 1, job_id: 'JOB-041', job_title: 'LED Retrofit — Northbridge', customer: 'Marcus Okafor',  job_total: 24500, start_date: null, assigned_team: 'Doug A.' },
    { id: 2, job_id: 'JOB-039', job_title: 'Fleet Wrap Package',         customer: 'Sarah Chen',    job_total: 18200, start_date: null, assigned_team: 'Tracy B.' },
  ],
  'Scheduled': [
    { id: 3, job_id: 'JOB-038', job_title: 'Parking Lot LED',            customer: 'David Kim',     job_total: 12000, start_date: 'Jun 10', assigned_team: 'Doug A.' },
  ],
  'In Progress': [
    { id: 4, job_id: 'JOB-035', job_title: 'Solar Panel Array',          customer: 'Ryan Torres',   job_total: 48200, start_date: 'Jun 3',  assigned_team: 'Crew 2' },
  ],
  'Completed': [],
}

const RECENT_WINS = [
  { id: 5, job_id: 'JOB-032', job_title: 'Office Retrofit',  customer: { name: 'Jennifer Walsh' }, job_total: 18200, completed_at: 'May 28', invoice_status: 'Not Invoiced', assigned_team: 'Tracy B.' },
  { id: 6, job_id: 'JOB-029', job_title: 'Warehouse LED',    customer: { name: 'Brady Marsh' },   job_total: 34500, completed_at: 'May 22', invoice_status: 'Invoiced',     assigned_team: 'Crew 2' },
]

const invoiceStatusColors = {
  'Not Invoiced': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Invoiced':     { bg: 'rgba(90,99,73,0.12)',    text: '#5a6349' },
  'Paid':         { bg: 'rgba(74,124,89,0.12)',   text: '#4a7c59' },
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function JobsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: T.bg, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
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
            <DonePanel key="done" onReplay={replay} subtitle="Your jobs board is live." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ─────────────────────────────────────────────────────────────────
function Stage({ scene }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      fontSize: '11px', fontFamily: 'system-ui, sans-serif',
      color: T.text, overflow: 'hidden',
    }}>
      <MiniPageHeader scene={scene} />
      <div style={{ flex: 1, overflow: 'hidden', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
        {(scene === 'wins' || scene === 'board') && <RecentWinsCarousel />}
        <StatsStrip />
        <SearchRow />
        {scene === 'empty'   && <EmptyBoard />}
        {(scene === 'board' || scene === 'wins') && <BoardView />}
        {scene === 'actions' && <BoardViewActions />}
        {scene === 'new'     && <BoardViewWithModal />}
      </div>
    </div>
  )
}

// ─── PageHeader — lines 1166-1243 ─────────────────────────────────────────
function MiniPageHeader({ scene }) {
  const btnBase = { display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '10px', fontWeight: '500', cursor: 'pointer', backgroundColor: 'transparent', color: T.textSecondary }
  return (
    <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Briefcase size={14} style={{ color: T.accent }} />
        <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Jobs</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        {/* Board/List toggle */}
        <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
          <button style={{ ...btnBase, border: 'none', borderRadius: 0, backgroundColor: T.accent, color: '#fff' }}><Columns3 size={11} />Board</button>
          <button style={{ ...btnBase, border: 'none', borderRadius: 0, borderLeft: `1px solid ${T.border}` }}><List size={11} />List</button>
        </div>
        <button style={{ ...btnBase, color: T.accent }}><Upload size={11} />Import</button>
        <button style={btnBase}><Download size={11} />Export</button>
        <button style={btnBase}><Map size={11} />Map</button>
        <button style={btnBase}><Calendar size={11} />Calendar</button>
        <button style={{ ...btnBase, backgroundColor: T.accent, color: '#fff', border: 'none' }}><Plus size={12} />Add Job</button>
      </div>
    </div>
  )
}

// ─── Recent Wins carousel — lines 103-238 ────────────────────────────────
function RecentWinsCarousel() {
  const totalRev = RECENT_WINS.reduce((s, j) => s + (j.job_total || 0), 0)
  return (
    <div style={{
      backgroundColor: 'rgba(74,124,89,0.06)',
      borderRadius: '12px', border: '1px solid rgba(74,124,89,0.15)',
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: 'rgba(74,124,89,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={13} style={{ color: '#4a7c59' }} />
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#4a7c59' }}>Recent Wins</div>
          <div style={{ fontSize: '10px', color: '#6b8f73' }}>
            {RECENT_WINS.length} jobs completed — <strong>${totalRev.toLocaleString()}</strong> revenue
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {RECENT_WINS.map(job => {
          const invStyle = invoiceStatusColors[job.invoice_status] || invoiceStatusColors['Not Invoiced']
          return (
            <div key={job.id} style={{ minWidth: '200px', backgroundColor: T.bgCard, borderRadius: '8px', border: '1px solid rgba(74,124,89,0.2)', padding: '10px 12px', flexShrink: 0, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '5px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{job.job_title}</div>
                  <div style={{ fontSize: '10px', color: T.textMuted }}>{job.customer.name}</div>
                </div>
                {job.job_total > 0 && <span style={{ fontSize: '11px', fontWeight: '700', color: '#4a7c59', flexShrink: 0, marginLeft: '6px' }}>${job.job_total.toLocaleString()}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: T.textMuted }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><CheckCircle size={9} style={{ color: '#4a7c59' }} />{job.completed_at}</span>
                <span style={{ padding: '1px 5px', borderRadius: '6px', fontSize: '9px', fontWeight: '500', backgroundColor: invStyle.bg, color: invStyle.text }}>{job.invoice_status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stats strip — lines 1254-1277 ───────────────────────────────────────
function StatsStrip() {
  const counts = { 'Chillin': 2, 'Scheduled': 1, 'In Progress': 1, 'Completed': 2 }
  return (
    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
      {BOARD_COLS.map(col => (
        <div key={col.id} style={{ backgroundColor: T.bgCard, borderRadius: '8px', border: `1px solid ${T.border}`, padding: '6px 12px', textAlign: 'center', minWidth: '60px', flex: '0 0 auto' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: col.color }}>{counts[col.id] || 0}</div>
          <div style={{ fontSize: '9px', color: T.textMuted, whiteSpace: 'nowrap' }}>{col.name}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Search row — lines 1279-1310 ────────────────────────────────────────
function SearchRow() {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={11} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
      <input readOnly placeholder="Search jobs..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px 5px 22px', border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
    </div>
  )
}

// ─── Empty board ──────────────────────────────────────────────────────────
function EmptyBoard() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      {BOARD_COLS.map(col => (
        <KanbanColumnEmpty key={col.id} col={col} />
      ))}
    </div>
  )
}

function KanbanColumnEmpty({ col }) {
  const Icon = col.icon
  return (
    <div style={{ flex: 1, minWidth: 0, backgroundColor: T.bg, borderRadius: '10px', border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '10px 10px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Icon size={12} style={{ color: col.color }} />
          <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{col.name}</span>
        </div>
        <span style={{ padding: '1px 6px', borderRadius: '9px', fontSize: '9px', fontWeight: '600', backgroundColor: col.color + '18', color: col.color }}>0</span>
      </div>
      <div style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '10px', color: T.textMuted, fontStyle: 'italic' }}>No {col.name.toLowerCase()} jobs</span>
      </div>
    </div>
  )
}

// ─── Board view with jobs — mirrors KanbanColumn lines 242-421 ────────────
function BoardView() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      {BOARD_COLS.map(col => (
        <KanbanColumnFilled key={col.id} col={col} jobs={MOCK_JOBS[col.id] || []} showActions={false} />
      ))}
    </div>
  )
}

function BoardViewActions() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      {BOARD_COLS.map(col => (
        <KanbanColumnFilled key={col.id} col={col} jobs={MOCK_JOBS[col.id] || []} showActions={true} />
      ))}
    </div>
  )
}

function KanbanColumnFilled({ col, jobs, showActions }) {
  const Icon = col.icon
  return (
    <div style={{ flex: 1, minWidth: 0, backgroundColor: T.bg, borderRadius: '10px', border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '10px 10px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Icon size={12} style={{ color: col.color }} />
          <span style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{col.name}</span>
        </div>
        <span style={{ padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: col.color + '18', color: col.color }}>{jobs.length}</span>
      </div>
      <div style={{ flex: 1, padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto' }}>
        {jobs.length === 0 && (
          <div style={{ padding: '10px', textAlign: 'center', fontSize: '9px', color: T.textMuted, fontStyle: 'italic' }}>
            No {col.name.toLowerCase()} jobs
          </div>
        )}
        {jobs.map((job, i) => (
          <JobCard key={job.id} job={job} colColor={col.color} status={col.id} showActions={showActions} delay={i * 0.06} />
        ))}
      </div>
    </div>
  )
}

// ─── Job card — mirrors lines 293-418 ────────────────────────────────────
function JobCard({ job, colColor, status, showActions, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      style={{ backgroundColor: T.bgCard, borderRadius: '8px', border: `1px solid ${T.border}`, padding: '8px 10px', cursor: 'pointer' }}
    >
      {/* job_id + job_total */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '9px', fontWeight: '600', color: colColor, display: 'flex', alignItems: 'center', gap: '2px' }}>
          {job.job_id}<ExternalLink size={8} style={{ color: T.textMuted }} />
        </span>
        {job.job_total > 0 && (
          <span style={{ fontSize: '10px', fontWeight: '600', color: T.accent }}>${job.job_total.toLocaleString()}</span>
        )}
      </div>
      {/* job_title */}
      <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {job.job_title}
      </div>
      {/* customer */}
      <div style={{ fontSize: '9px', color: T.textSecondary, marginBottom: '5px' }}>{job.customer}</div>
      {/* date + team */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: T.textMuted }}>
          {job.start_date && <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Calendar size={8} />{job.start_date}</span>}
          {job.assigned_team && <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><User size={8} />{job.assigned_team}</span>}
        </div>
        {/* Action buttons */}
        {showActions && status === 'Chillin' && (
          <button style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: '#5a6349', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
            <ArrowRight size={7} />Schedule
          </button>
        )}
        {showActions && status === 'Scheduled' && (
          <button style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: '#c28b38', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Play size={7} />Start
          </button>
        )}
        {showActions && status === 'In Progress' && (
          <button style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: '#4a7c59', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
            <CheckCircle size={7} />Done
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Board + Add Job modal ────────────────────────────────────────────────
function BoardViewWithModal() {
  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '8px', height: '100%', opacity: 0.25 }}>
        {BOARD_COLS.map(col => <KanbanColumnFilled key={col.id} col={col} jobs={MOCK_JOBS[col.id] || []} showActions={false} />)}
      </div>
      {/* Modal overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
          style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '320px', maxHeight: '88%', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, backgroundColor: T.bgCard }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Job</span>
            <X size={14} style={{ color: T.textMuted }} />
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {[
              ['Job Title', 'LED Retrofit — Northbridge'],
              ['Customer', 'Marcus Okafor'],
              ['Status', 'Chillin'],
              ['Assigned Team', 'Doug Anderson'],
              ['Start Date', 'Jun 10 · 8:00 AM'],
              ['Business Unit', 'Lighting'],
            ].map(([label, value]) => (
              <div key={label}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{label}</label>
                <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '10px', color: T.text }}>{value}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '7px', marginTop: '2px' }}>
              <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Add Job</button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:   '1 · Jobs board — 4 columns: Chillin, Scheduled, In Progress, Completed',
    wins:    '2 · Recent Wins carousel — completed jobs with revenue total + invoice status',
    board:   '3 · Board view — job_id, title, customer, amount, date, team per card',
    actions: '4 · Action buttons: → Schedule (Chillin) · ▶ Start (Scheduled) · ✓ Done (In Progress)',
    new:     '5 · Add Job modal — title, customer, status, team, start date, business unit',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How jobs work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
