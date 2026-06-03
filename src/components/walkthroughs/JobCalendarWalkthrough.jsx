// Job Calendar walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Filter, Bell, ChevronLeft, ChevronRight, ArrowRight, Users,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/job-calendar.js'

const CREWS = [
  { name: 'Cole',   color: '#22c55e' },
  { name: 'Marcus', color: '#3b82f6' },
  { name: 'Priya',  color: '#a855f7' },
  { name: 'Alayda', color: '#f59e0b' },
]

export default function JobCalendarWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro, elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist"><SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} /></CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Who's where this week, at a glance." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <ZachShell
      title="Job Calendar · June 2026"
      subtitle="42 jobs scheduled · color by crew"
      actionLabel="New Job"
      actionIcon={Calendar}
      filterChips={[{ icon: Users, label: scene === 'filter' ? 'Cole only' : '4 crews on' }]}
    >
      {scene === 'month' && <MonthGrid />}
      {scene === 'week' && <WeekGrid />}
      {scene === 'day' && <DayGrid />}
      {scene === 'drag' && <DragView />}
      {scene === 'filter' && <FilterView />}
    </ZachShell>
  )
}

function MonthGrid() {
  // 5 weeks × 7 days. Fill some cells with crew-colored dots.
  const days = Array.from({ length: 35 }, (_, i) => i)
  const events = {
    3: 2, 4: 3, 5: 1, 8: 2, 9: 4, 10: 3, 11: 2, 12: 5, 15: 3, 16: 4,
    17: 2, 18: 3, 22: 2, 23: 5, 24: 3, 25: 2, 29: 3, 30: 1, 31: 2,
  }
  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 8, flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, textAlign: 'center', padding: 4, textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map(i => {
          const dayNum = i - 2 + 1 // start June on Tuesday-ish
          const count = events[i] || 0
          return (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.012 }} style={{ aspectRatio: '1.1', padding: 4, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 9, color: dayNum > 0 && dayNum <= 30 ? T.text : T.textMuted, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>{dayNum > 0 && dayNum <= 30 ? dayNum : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Array.from({ length: Math.min(count, 5) }).map((_, j) => (
                  <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: CREWS[j % CREWS.length].color }} />
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function WeekGrid() {
  // 7 day columns × 14 hour rows (7am-9pm). Spotted events.
  const events = [
    { day: 1, hour: 8,  crewIdx: 0, dur: 3 }, // Cole Mon
    { day: 1, hour: 14, crewIdx: 0, dur: 3 },
    { day: 2, hour: 8,  crewIdx: 0, dur: 5 },
    { day: 2, hour: 14, crewIdx: 1, dur: 2 },
    { day: 3, hour: 9,  crewIdx: 1, dur: 4 },
    { day: 4, hour: 8,  crewIdx: 2, dur: 8 },
    { day: 4, hour: 10, crewIdx: 1, dur: 0, openSlot: true },
    { day: 5, hour: 9,  crewIdx: 0, dur: 4 },
    { day: 5, hour: 14, crewIdx: 3, dur: 2 },
  ]
  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 6, flex: 1, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
        <div />
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, textAlign: 'center', padding: 3 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: 1, position: 'relative' }}>
        {[7, 9, 11, 13, 15, 17].map(h => (
          <>
            <div key={`label-${h}`} style={{ fontSize: 8, color: T.textMuted, textAlign: 'right', padding: '2px 4px' }}>
              {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
            </div>
            {Array.from({ length: 7 }, (_, d) => (
              <div key={`cell-${h}-${d}`} style={{ minHeight: 20, background: T.bg, borderRadius: 2, position: 'relative' }} />
            ))}
          </>
        ))}
        {events.map((e, i) => (
          e.openSlot ? null : (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} style={{
              position: 'absolute',
              left: `${40 + ((100 - 40 / 6) / 7) * e.day}%`,
              top: `${((e.hour - 7) / 12) * 100}%`,
              width: `${(100 - 40 / 6) / 7 - 1}%`,
              height: `${(e.dur / 12) * 100}%`,
              background: CREWS[e.crewIdx].color,
              borderRadius: 3,
              padding: 2,
              fontSize: 7,
              color: '#fff',
              fontWeight: 700,
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}>
              {e.dur}h
            </motion.div>
          )
        ))}
      </div>
    </div>
  )
}

function DayGrid() {
  // Single day column. Cole packed.
  const events = [
    { hour: 8, dur: 3, customer: 'Northbridge', addr: 'Highland UT' },
    { hour: 11.5, dur: 0.5, label: 'Travel + lunch', soft: true },
    { hour: 12, dur: 3, customer: 'Solera Mfg', addr: 'Orem UT' },
    { hour: 15, dur: 0.5, label: 'Travel', soft: true },
    { hour: 15.5, dur: 2.5, customer: 'Granite Foods', addr: 'Provo UT' },
  ]
  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 8 }}>Tuesday June 9 · Cole's day</div>
      <div style={{ flex: 1, position: 'relative', background: T.bg, borderRadius: 7, padding: 4 }}>
        {[7, 9, 11, 13, 15, 17, 19].map((h, i) => (
          <div key={h} style={{ position: 'absolute', top: `${(i / 6) * 100}%`, left: 0, right: 0, borderTop: `1px dashed ${T.border}`, fontSize: 8, color: T.textMuted, padding: '0 4px' }}>
            <span style={{ background: T.bg, padding: '0 4px' }}>{h > 12 ? h - 12 : h}{h >= 12 ? 'pm' : 'am'}</span>
          </div>
        ))}
        {events.map((e, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{
            position: 'absolute',
            left: 30,
            right: 6,
            top: `${((e.hour - 7) / 12) * 100}%`,
            height: `${(e.dur / 12) * 100}%`,
            background: e.soft ? '#cbd5e1' : CREWS[0].color,
            borderRadius: 5,
            padding: 5,
            fontSize: 9,
            color: '#fff',
            fontWeight: 700,
            opacity: e.soft ? 0.7 : 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}>
            <div>{e.customer || e.label}</div>
            {e.addr && <div style={{ fontSize: 8, opacity: 0.9, fontWeight: 500 }}>{e.addr}</div>}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function DragView() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 14, minWidth: 170 }}>
        <Chip>Wed Jun 11 · was</Chip>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: T.text }}>Cypress install</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Cole · 10am · 4h</div>
      </motion.div>
      <motion.div animate={{ x: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <ArrowRight size={28} style={{ color: T.accent }} />
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 9, padding: 14, minWidth: 200 }}>
        <Chip color={T.successDark} bg={T.successBg}>Fri Jun 13 · now</Chip>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: T.text }}>Cypress install</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Cole · 10am · 4h</div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 6, padding: '4px 8px', background: T.successBg, borderRadius: 99, fontSize: 9, color: T.successDark, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Bell size={9} /> Customer SMS sent
        </motion.div>
      </motion.div>
    </div>
  )
}

function FilterView() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {CREWS.map((c, i) => (
          <div key={c.name} style={{ padding: '5px 10px', borderRadius: 99, background: i === 0 ? c.color : T.bg, color: i === 0 ? '#fff' : T.textMuted, fontSize: 11, fontWeight: 700, border: `1.5px solid ${i === 0 ? c.color : T.border}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Filter size={11} /> {c.name}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[
          { day: 'Mon Jun 8',  job: 'JOB-2147 · Northbridge', time: '8am · 8h' },
          { day: 'Tue Jun 9',  job: 'JOB-2152 · Solera',      time: '8am · 5h' },
          { day: 'Tue Jun 9',  job: 'JOB-2154 · Granite',     time: '2pm · 3h' },
          { day: 'Fri Jun 13', job: 'JOB-2159 · Cypress',     time: '10am · 4h' },
        ].map((row, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px', gap: 10, padding: 8, background: T.bg, borderRadius: 6, fontSize: 11, alignItems: 'center', borderLeft: `3px solid ${CREWS[0].color}` }}>
            <div style={{ color: T.textMuted }}>{row.day}</div>
            <div style={{ color: T.text, fontWeight: 700 }}>{row.job}</div>
            <div style={{ color: T.textMuted, textAlign: 'right' }}>{row.time}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    month:  '1. Month view · 42 jobs · color-coded by crew',
    week:   '2. Week view · time-of-day blocks · spot the open slots',
    day:    '3. Day view · hour-by-hour · travel time visible',
    drag:   '4. Drag to reschedule · customer SMS auto-sent',
    filter: "5. Filter by tech · just one crew at a time",
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Almost zero setup · fills automatically'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
