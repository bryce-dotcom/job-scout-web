// Freddy Live Tracking walkthrough — map view, truck detail, location history, geofence alerts.
// Source: src/lib/featureKnowledge/freddy-tracking.js

import { motion, AnimatePresence } from 'framer-motion'
import { Truck, MapPin, Navigation, Clock, Battery, AlertTriangle, Shield, ZoomIn, ZoomOut, ChevronRight, Wifi, CheckCircle } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/freddy-tracking.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_TRUCKS = [
  { id: 'VEH-001', driver: 'Marcus Webb',   speed: 34, status: 'moving', lastPing: '8 sec ago',  lat: 33.49, lng: -112.07, address: '4201 N 16th St, Phoenix AZ',   battery: 82 },
  { id: 'VEH-002', driver: 'Doug Anderson', speed: 0,  status: 'idle',   lastPing: '22 sec ago', lat: 33.45, lng: -112.01, address: '1850 W Baseline Rd, Tempe AZ', battery: 61 },
  { id: 'VEH-003', driver: 'Ryan Diaz',     speed: 0,  status: 'offline', lastPing: '4 min ago',  lat: 33.53, lng: -112.12, address: 'Last known: I-17 N, Phoenix AZ', battery: 44 },
]

const STATUS_DOT = {
  moving:  '#22c55e',
  idle:    '#eab308',
  offline: '#9ca3af',
}

const HISTORY_STOPS = [
  { time: '7:58 AM',  label: 'Depot — departed',        x: '18%', y: '72%' },
  { time: '8:14 AM',  label: 'Job site — arrived',       x: '34%', y: '44%' },
  { time: '12:02 PM', label: 'Lunch stop',               x: '52%', y: '58%' },
  { time: '2:33 PM',  label: 'Supply house',             x: '68%', y: '36%' },
  { time: '3:51 PM',  label: 'En route — current',       x: '78%', y: '52%' },
]

const GEOFENCE_RULES = [
  { id: 1, label: 'Alert if any truck enters/leaves Phoenix metro', active: false, scope: 'All vehicles' },
  { id: 2, label: 'Alert if VEH-001 leaves job site before 4 PM',  active: false, scope: 'VEH-001' },
  { id: 3, label: 'Alert if any truck moves after 7 PM',           active: false, scope: 'All vehicles' },
]

const ACTIVE_ALERTS = [
  { id: 1, truck: 'VEH-003', message: 'VEH-003 left Phoenix metro', time: 'Jun 11  3:42 PM', severity: 'warn' },
]

const TRAIL_POINTS = [
  { x: '18%', y: '72%' },
  { x: '22%', y: '62%' },
  { x: '28%', y: '52%' },
  { x: '34%', y: '44%' },
  { x: '40%', y: '48%' },
  { x: '46%', y: '54%' },
  { x: '52%', y: '58%' },
  { x: '58%', y: '50%' },
  { x: '64%', y: '41%' },
  { x: '68%', y: '36%' },
  { x: '72%', y: '40%' },
  { x: '78%', y: '52%' },
]

export default function FreddyTrackingWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every truck, live." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function MapBackground() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice">
      <rect width="600" height="340" fill="#e8ecdf" />
      {[40, 80, 120, 160, 200, 240, 280, 320].map(y => (
        <line key={`h${y}`} x1="0" y1={y} x2="600" y2={y} stroke="#d4d9ca" strokeWidth="0.5" />
      ))}
      {[60, 120, 180, 240, 300, 360, 420, 480, 540].map(x => (
        <line key={`v${x}`} x1={x} y1="0" x2={x} y2="340" stroke="#d4d9ca" strokeWidth="0.5" />
      ))}
      <line x1="0" y1="120" x2="600" y2="120" stroke="#c8cfc0" strokeWidth="2" />
      <line x1="0" y1="220" x2="600" y2="220" stroke="#c8cfc0" strokeWidth="2" />
      <line x1="150" y1="0" x2="150" y2="340" stroke="#c8cfc0" strokeWidth="2" />
      <line x1="380" y1="0" x2="380" y2="340" stroke="#c8cfc0" strokeWidth="2" />
      <rect x="160" y="60" width="80" height="40" rx="2" fill="#d0d5c8" opacity="0.6" />
      <rect x="280" y="130" width="60" height="50" rx="2" fill="#d0d5c8" opacity="0.6" />
      <rect x="390" y="80" width="100" height="30" rx="2" fill="#d0d5c8" opacity="0.6" />
      <rect x="60" y="180" width="70" height="25" rx="2" fill="#d0d5c8" opacity="0.6" />
      <rect x="440" y="200" width="90" height="60" rx="2" fill="#d0d5c8" opacity="0.6" />
      <text x="160" y="108" fontSize="7" fill="#8a9080" fontFamily="system-ui">I-17</text>
      <text x="382" y="112" fontSize="7" fill="#8a9080" fontFamily="system-ui">SR-51</text>
      <text x="5" y="218" fontSize="7" fill="#8a9080" fontFamily="system-ui">Baseline Rd</text>
    </svg>
  )
}

function TruckMarker({ truck, highlighted, style }) {
  const dot = STATUS_DOT[truck.status]
  return (
    <div style={{ position: 'absolute', transform: 'translate(-50%,-50%)', zIndex: highlighted ? 10 : 5, ...style }}>
      <div style={{ position: 'relative' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: highlighted ? T.accent : '#fff', border: `2px solid ${dot}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: highlighted ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.2)' }}>
          <Truck size={13} style={{ color: highlighted ? '#fff' : T.text }} />
        </div>
        <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dot, border: '1px solid #fff' }} />
      </div>
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <Navigation size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Live Tracking</span>
        <span style={{ fontSize: '10px', color: T.textMuted, marginLeft: 'auto' }}>Freddy · Fleet Intelligence</span>
      </div>

      {scene === 'map' && <SceneMap />}
      {scene === 'detail' && <SceneDetail />}
      {scene === 'history' && <SceneHistory />}
      {scene === 'geofence' && <SceneGeofence />}
    </div>
  )
}

function SceneMap() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
        <MapBackground />
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 20, display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', backgroundColor: 'rgba(90,99,73,0.92)', borderRadius: '20px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 1.4s infinite' }} />
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#fff' }}>3 trucks active</span>
        </div>
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <button style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#fff', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}><ZoomIn size={12} style={{ color: T.text }} /></button>
          <button style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#fff', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}><ZoomOut size={12} style={{ color: T.text }} /></button>
        </div>
        <TruckMarker truck={MOCK_TRUCKS[0]} style={{ left: '45%', top: '38%' }} />
        <TruckMarker truck={MOCK_TRUCKS[1]} style={{ left: '62%', top: '62%' }} />
        <TruckMarker truck={MOCK_TRUCKS[2]} style={{ left: '24%', top: '28%' }} />
        <div style={{ position: 'absolute', left: '45%', top: '38%', zIndex: 15, transform: 'translate(14px, -50%)', backgroundColor: 'rgba(255,255,255,0.96)', border: `1px solid ${T.border}`, borderRadius: '7px', padding: '5px 8px', fontSize: '9px', minWidth: '110px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
          <div style={{ fontWeight: '700', color: T.text }}>Marcus Webb</div>
          <div style={{ color: T.textMuted }}>VEH-001 · 34 mph</div>
          <div style={{ color: T.textMuted }}>8 sec ago</div>
        </div>
      </div>
      <div style={{ width: '130px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px', fontSize: '9px' }}>
          <div style={{ fontWeight: '700', color: T.text, marginBottom: '6px', fontSize: '10px' }}>Legend</div>
          {[{ dot: '#22c55e', label: 'Moving' }, { dot: '#eab308', label: 'Idle' }, { dot: '#9ca3af', label: 'Offline' }].map(({ dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: dot, flexShrink: 0 }} />
              <span style={{ color: T.textSecondary }}>{label}</span>
            </div>
          ))}
        </div>
        {MOCK_TRUCKS.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '7px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: STATUS_DOT[t.status], flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{t.id}</span>
            </div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>{t.driver}</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>{t.speed > 0 ? `${t.speed} mph` : t.status === 'idle' ? 'Parked' : 'Offline'}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function SceneDetail() {
  const truck = MOCK_TRUCKS[0]
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
        <MapBackground />
        <TruckMarker truck={truck} highlighted style={{ left: '45%', top: '45%' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.08)' }} />
      </div>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}
        style={{ width: '180px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.accentBg }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>VEH-001 · 2022 Ford F-250</div>
          <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '2px' }}>Marcus Webb</div>
        </div>
        <div style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '0' }}>
          {[
            { label: 'Speed',        value: '0 mph — Parked',               color: '#eab308' },
            { label: 'Address',      value: '4201 N 16th St, Phoenix AZ',    color: T.text },
            { label: 'Last ping',    value: '12 sec ago',                    color: '#22c55e' },
            { label: 'Battery',      value: '82%',                           color: T.text },
            { label: 'GPS accuracy', value: '±4 m',                          color: T.text },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '8px', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
              <span style={{ fontSize: '10px', fontWeight: '500', color, marginTop: '1px' }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Battery size={11} style={{ color: '#22c55e' }} />
          <div style={{ flex: 1, height: '5px', borderRadius: '3px', backgroundColor: T.border, overflow: 'hidden' }}>
            <div style={{ width: '82%', height: '100%', backgroundColor: '#22c55e', borderRadius: '3px' }} />
          </div>
          <span style={{ fontSize: '9px', color: T.textMuted }}>82%</span>
        </div>
        <div style={{ padding: '4px 12px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Wifi size={10} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '9px', color: '#22c55e', fontWeight: '600' }}>GPS lock · High accuracy</span>
        </div>
      </motion.div>
    </div>
  )
}

function SceneHistory() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
        <MapBackground />
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 6 }} viewBox="0 0 600 280" preserveAspectRatio="none">
          <polyline
            points={TRAIL_POINTS.map(p => `${parseFloat(p.x) * 6},${parseFloat(p.y) * 2.8}`).join(' ')}
            fill="none"
            stroke={T.accent}
            strokeWidth="2"
            strokeDasharray="5,4"
            opacity="0.8"
          />
        </svg>
        {HISTORY_STOPS.map((stop, i) => (
          <div key={i} style={{ position: 'absolute', left: stop.x, top: stop.y, zIndex: 10, transform: 'translate(-50%,-50%)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: i === HISTORY_STOPS.length - 1 ? T.accent : '#fff', border: `2px solid ${T.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            {(i === 1 || i === 2 || i === 3) && (
              <div style={{ position: 'absolute', top: '-26px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(255,255,255,0.95)', border: `1px solid ${T.border}`, borderRadius: '5px', padding: '2px 6px', whiteSpace: 'nowrap', fontSize: '8px', color: T.text, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontWeight: '600' }}>{stop.label}</div>
                <div style={{ color: T.textMuted }}>{stop.time}</div>
              </div>
            )}
          </div>
        ))}
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 20, padding: '4px 10px', backgroundColor: 'rgba(255,255,255,0.94)', border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '9px', fontWeight: '600', color: T.text }}>VEH-001 · Jun 11 route</div>
      </div>
      <div style={{ flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>Timeline</span>
          <span style={{ fontSize: '9px', color: T.textMuted }}>5 stops · 62.4 mi total</span>
        </div>
        <div style={{ position: 'relative', height: '18px' }}>
          <div style={{ position: 'absolute', top: '8px', left: 0, right: 0, height: '3px', backgroundColor: T.border, borderRadius: '2px' }} />
          <div style={{ position: 'absolute', top: '8px', left: 0, width: '78%', height: '3px', backgroundColor: T.accent, borderRadius: '2px' }} />
          {HISTORY_STOPS.map((stop, i) => (
            <div key={i} style={{ position: 'absolute', left: `${[18, 34, 52, 68, 78][i]}%`, top: '4px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: i === HISTORY_STOPS.length - 1 ? T.accent : '#fff', border: `2px solid ${T.accent}`, transform: 'translateX(-50%)', zIndex: 2 }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '8px', color: T.textMuted }}>7:58 AM</span>
          <span style={{ fontSize: '8px', color: T.textMuted }}>3:51 PM</span>
        </div>
      </div>
    </div>
  )
}

function SceneGeofence() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#ef4444', marginBottom: '2px' }}>Active alert</div>
            <div style={{ fontSize: '10px', color: T.text }}>VEH-003 left Phoenix metro</div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '1px' }}>Jun 11  3:42 PM · Ryan Diaz</div>
          </div>
          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '8px', fontWeight: '700', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444', flexShrink: 0 }}>NEW</span>
        </motion.div>
        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={12} style={{ color: T.accent }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Geofence Rules</span>
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: T.textMuted }}>3 rules</span>
          </div>
          {GEOFENCE_RULES.map((rule, i) => (
            <motion.div key={rule.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 12px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ marginTop: '2px', flexShrink: 0 }}>
                <div style={{ width: '30px', height: '16px', borderRadius: '8px', backgroundColor: T.accent, position: 'relative', cursor: 'pointer' }}>
                  <div style={{ position: 'absolute', top: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#fff' }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', color: T.text, lineHeight: '1.4' }}>{rule.label}</div>
                <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px' }}>{rule.scope}</div>
              </div>
            </motion.div>
          ))}
          <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'center' }}>
            <button style={{ padding: '5px 14px', border: `1px dashed ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textMuted, fontSize: '9px', cursor: 'pointer' }}>+ Add geofence rule</button>
          </div>
        </div>
      </div>
      <div style={{ width: '148px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: T.text }}>Alert log</div>
        <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, backgroundColor: 'rgba(239,68,68,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
            <AlertTriangle size={9} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: '#ef4444' }}>VEH-003</span>
          </div>
          <div style={{ fontSize: '9px', color: T.text }}>Left Phoenix metro</div>
          <div style={{ fontSize: '8px', color: T.textMuted }}>Jun 11  3:42 PM</div>
        </div>
        <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
            <CheckCircle size={9} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: '#22c55e' }}>VEH-001</span>
          </div>
          <div style={{ fontSize: '9px', color: T.text }}>Arrived job site</div>
          <div style={{ fontSize: '8px', color: T.textMuted }}>Jun 11  8:14 AM</div>
        </div>
        <div style={{ padding: '6px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
            <AlertTriangle size={9} style={{ color: '#eab308' }} />
            <span style={{ fontSize: '9px', fontWeight: '600', color: '#eab308' }}>VEH-002</span>
          </div>
          <div style={{ fontSize: '9px', color: T.text }}>Idle &gt;45 min</div>
          <div style={{ fontSize: '8px', color: T.textMuted }}>Jun 10  2:08 PM</div>
        </div>
        <div style={{ padding: '6px 10px', borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '8px', color: T.textMuted, textAlign: 'center' }}>3 alerts this week</div>
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    map:      '1 · Live map — 3 trucks plotted with speed, driver, status dot · green = moving, yellow = idle',
    detail:   '2 · Truck detail — VEH-001 parked, Marcus Webb, 4201 N 16th St · battery + GPS accuracy shown',
    history:  '3 · Route replay — dotted trail shows today\'s path · job site, lunch stop, supply house timestamped',
    geofence: '4 · Geofence alerts — VEH-003 left Phoenix metro at 3:42 PM · toggle rules per vehicle or fleet',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Live Tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
