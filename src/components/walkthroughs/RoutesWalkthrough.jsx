// Routes walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/RoutesPage.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Route, Plus, Search, Calendar, Pencil, X, User, MapPin, Sparkles, Clock, ChevronRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/routes.js'

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

const UNASSIGNED_JOBS = [
  { id: 'J-411', name: 'Westfield Office Park',  addr: '1244 W 5th Ave',    miles: '4.2' },
  { id: 'J-412', name: 'Sunrise Apartments',     addr: '889 Sunrise Blvd',  miles: '2.1' },
  { id: 'J-413', name: 'Brentwood Storage',      addr: '440 Commerce Dr',   miles: '5.7' },
  { id: 'J-414', name: 'Valley Credit Union',    addr: '2200 Valley Pkwy',  miles: '3.4' },
  { id: 'J-415', name: 'NorthWest Fitness',      addr: '101 NW Plaza Dr',   miles: '6.8' },
  { id: 'J-416', name: 'Harbor Logistics Bldg',  addr: '7700 Harbor Blvd',  miles: '8.3' },
]

const ROUTE_STOPS = [
  { id: 'J-411', name: 'Westfield Office Park', eta: '8:00 AM', drive: '12 min' },
  { id: 'J-412', name: 'Sunrise Apartments',    eta: '9:15 AM', drive: '22 min' },
  { id: 'J-413', name: 'Brentwood Storage',     eta: '10:40 AM', drive: '18 min' },
  { id: 'J-414', name: 'Valley Credit Union',   eta: '12:00 PM', drive: '15 min' },
]

const CAL_ROUTES = [
  { day: 'Mon', crew: 'Doug', label: 'West Loop', color: '#3b82f6', stops: 4 },
  { day: 'Mon', crew: 'Marcus', label: 'Eastside', color: '#8b5cf6', stops: 3 },
  { day: 'Tue', crew: 'Doug', label: 'Tue West', color: '#3b82f6', stops: 4 },
  { day: 'Tue', crew: 'Marcus', label: 'NW Run', color: '#8b5cf6', stops: 5 },
  { day: 'Wed', crew: 'Ryan', label: 'South Sweep', color: '#f97316', stops: 3 },
  { day: 'Thu', crew: 'Doug', label: 'Valley',  color: '#3b82f6', stops: 6 },
  { day: 'Thu', crew: 'Marcus', label: 'Harbor', color: '#8b5cf6', stops: 2 },
]

export default function RoutesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your routes are dispatched." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const isCalendar = scene === 'calendar'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Route size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Routes</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', backgroundColor: isCalendar ? T.accent : T.bgCard, color: isCalendar ? '#fff' : T.textSecondary, border: `1px solid ${isCalendar ? T.accent : T.border}`, borderRadius: '5px', fontSize: '10px', cursor: 'pointer' }}>
            <Calendar size={10} />Calendar
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', backgroundColor: T.accent, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={10} />New Route
          </button>
        </div>
      </div>

      {/* unassigned: unassigned jobs panel */}
      {scene === 'unassigned' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', backgroundColor: T.accentBg, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: T.accent }}>Unassigned Jobs</span>
              <span style={{ fontSize: '10px', fontWeight: '600', color: T.textMuted }}>{UNASSIGNED_JOBS.length} jobs</span>
            </div>
            {UNASSIGNED_JOBS.map((j, i) => (
              <motion.div key={j.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'grab' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{j.name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{j.addr}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: T.textMuted }}>
                  <MapPin size={9} />{j.miles} mi
                </div>
              </motion.div>
            ))}
          </div>
          <div style={{ width: '168px', backgroundColor: T.bgCard, border: `2px dashed ${T.border}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', padding: '10px', gap: '6px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: T.accent }}>New Route</span>
              <span style={{ fontSize: '8px', color: T.textMuted }}>0 stops</span>
            </div>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', border: `1px dashed ${T.border}`, borderRadius: '7px', backgroundColor: T.bg }}>
                <div style={{ width: '17px', height: '17px', borderRadius: '50%', border: `1.5px dashed ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '8px', color: T.textMuted }}>{n}</span>
                </div>
                <span style={{ fontSize: '8.5px', color: T.textMuted }}>Drop job here</span>
              </div>
            ))}
            <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 8px', border: 'none', borderRadius: '6px', backgroundColor: T.accentBg, cursor: 'pointer' }}>
              <Sparkles size={9} style={{ color: T.accent }} />
              <span style={{ fontSize: '8.5px', color: T.accent, fontWeight: '600' }}>AI suggest order</span>
            </div>
          </div>
        </div>
      )}

      {/* plan / optimize: route being built */}
      {(scene === 'plan' || scene === 'optimize') && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          {/* Stop list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
            {/* Route stats banner */}
            <motion.div key={scene} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ padding: '8px 12px', backgroundColor: scene === 'optimize' ? 'rgba(34,197,94,0.08)' : T.accentBg, border: `1px solid ${scene === 'optimize' ? 'rgba(34,197,94,0.3)' : T.accent}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Distance</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: scene === 'optimize' ? '#22c55e' : T.text }}>
                    {scene === 'optimize' ? '31 mi' : '38 mi'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Est. time</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: scene === 'optimize' ? '#22c55e' : T.text }}>
                    {scene === 'optimize' ? '3h 20m' : '4h 00m'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Stops</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>4</div>
                </div>
              </div>
              {scene === 'plan' && (
                <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
                  <Sparkles size={10} />Optimize
                </button>
              )}
              {scene === 'optimize' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#22c55e', fontWeight: '600' }}>
                  <Sparkles size={10} />Saved 7 mi
                </div>
              )}
            </motion.div>

            {/* Stops */}
            <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'auto' }}>
              {ROUTE_STOPS.map((stop, i) => (
                <div key={stop.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${T.border}`, gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{stop.name}</div>
                    <div style={{ fontSize: '9px', color: T.textMuted, display: 'flex', gap: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={8} />{stop.eta}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Route size={8} />{stop.drive} from prev</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Map placeholder */}
          <div style={{ width: '200px', flexShrink: 0, backgroundColor: '#e8f0e4', border: `1px solid ${T.border}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <MapPin size={20} style={{ color: T.accent }} />
            <div style={{ fontSize: '9px', color: T.textSecondary, textAlign: 'center', padding: '0 16px' }}>Route map with turn-by-turn</div>
          </div>
        </div>
      )}

      {/* assign: crew + day picker */}
      {scene === 'assign' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>Assign Route — Tue West</div>
            {[['Crew lead', 'Doug Anderson'], ['Date', 'Jun 10, 2026 (Tuesday)'], ['Start time', '7:30 AM'], ['Stops', '4 jobs']].map(([l, v]) => (
              <div key={l}>
                <label style={{ display: 'block', fontSize: '9px', fontWeight: '500', color: T.textMuted, marginBottom: '3px' }}>{l}</label>
                <div style={{ padding: '6px 9px', border: `1px solid ${l === 'Crew lead' ? T.accent : T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '11px', color: T.text, fontWeight: l === 'Crew lead' ? '600' : '400' }}>{v}</div>
              </div>
            ))}
            <div style={{ padding: '8px 10px', backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '7px', fontSize: '9px', color: '#16a34a', fontWeight: '500' }}>
              Crew will see this route on Field Scout with turn-by-turn for every stop
            </div>
            <button style={{ padding: '8px', border: 'none', borderRadius: '7px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
              Dispatch Route
            </button>
          </div>
          <div style={{ width: '180px', flexShrink: 0, backgroundColor: '#e8f0e4', border: `1px solid ${T.border}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <User size={18} style={{ color: T.accent }} />
            <div style={{ fontSize: '9px', color: T.textSecondary, textAlign: 'center', padding: '0 14px' }}>Doug's Field Scout shows 4 stops in order</div>
          </div>
        </div>
      )}

      {/* calendar: weekly calendar grid */}
      {scene === 'calendar' && (
        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ padding: '7px', fontSize: '9px', color: T.textMuted, borderRight: `1px solid ${T.border}` }} />
            {['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'].map(d => (
              <div key={d} style={{ padding: '7px', textAlign: 'center', fontSize: '10px', fontWeight: '600', color: d === 'Tue 10' ? T.accent : T.textSecondary, borderRight: `1px solid ${T.border}` }}>{d}</div>
            ))}
          </div>
          {['Doug', 'Marcus', 'Ryan'].map(crew => (
            <div key={crew} style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ padding: '8px 6px', fontSize: '9px', color: T.textMuted, borderRight: `1px solid ${T.border}`, display: 'flex', alignItems: 'center' }}>{crew}</div>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => {
                const route = CAL_ROUTES.find(r => r.day === day && r.crew === crew)
                return (
                  <div key={day} style={{ padding: '4px', borderRight: `1px solid ${T.border}`, minHeight: '44px' }}>
                    {route && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}
                        style={{ padding: '5px 7px', borderRadius: '5px', backgroundColor: route.color + '18', border: `1px solid ${route.color}40`, cursor: 'pointer' }}>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: route.color }}>{route.label}</div>
                        <div style={{ fontSize: '8px', color: T.textMuted }}>{route.stops} stops</div>
                      </motion.div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    unassigned: '1 · Unassigned jobs panel — drag any job into a route to start building',
    plan:       '2 · Route in progress — 4 stops, 38 mi, 4 hrs · per-stop ETA as you add',
    optimize:   '3 · Hit Optimize — reorders stops to cut drive · 31 mi, saves 7 miles',
    assign:     '4 · Assign crew + day — dispatch sends the route to Field Scout with turn-by-turn',
    calendar:   '5 · Calendar view — every route, every crew, color-coded · no double-booking',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to set up routes'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
