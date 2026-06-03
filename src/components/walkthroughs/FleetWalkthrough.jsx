// Fleet & Freddy walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Truck, Bot, Fuel, Wrench, UserCheck, AlertTriangle, Calendar,
  TrendingUp,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/fleet.js'

const TRUCKS = [
  { id: 7,  vin: '1FT...A82', model: '21 F-250',       odo: 74_320, fuel: 'shell •• 4123', driver: 'Cole',   nextSvc: 5680,  health: 'ok' },
  { id: 12, vin: '1FT...B91', model: '19 F-350 Dually', odo: 102_440, fuel: 'shell •• 7822', driver: 'Marcus', nextSvc: 2560,  health: 'warn' },
  { id: 14, vin: '1FT...C04', model: '22 Transit',      odo: 41_180, fuel: 'shell •• 9001', driver: 'Priya',  nextSvc: 8800,  health: 'ok' },
  { id: 16, vin: '1FT...D33', model: '20 F-150',        odo: 88_910, fuel: 'shell •• 1188', driver: 'Alayda', nextSvc: 1090,  health: 'svc' },
]

export default function FleetWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Freddy watches the fleet so you don't have to." />}
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
    <ZachShell title="Fleet · 4 vehicles" subtitle="Freddy watching · 30-day baseline established" actionLabel="Add Vehicle" actionIcon={Truck} filterChips={[{ icon: Bot, label: 'Freddy: 2 alerts' }]}>
      {scene === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TRUCKS.map((tr, i) => (
            <motion.div key={tr.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px 90px 70px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>#{tr.id}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{tr.model}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>{tr.vin} · {tr.fuel}</div>
              </div>
              <Chip icon={UserCheck}>{tr.driver}</Chip>
              <div style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{tr.odo.toLocaleString()} mi</div>
              <HealthChip health={tr.health} />
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'detail' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 9, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>#7</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>21 F-250 · 74,320 mi</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>Driver: Cole · Active</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Maintenance history</div>
          {[
            { d: '2026-04-12', e: 'Oil + filter',          mi: 71_840, cost: 78 },
            { d: '2026-02-04', e: 'Tire rotation',         mi: 68_220, cost: 45 },
            { d: '2025-12-10', e: 'Brake pads (rear)',    mi: 64_010, cost: 280 },
            { d: '2025-09-22', e: 'Coolant flush',         mi: 58_780, cost: 110 },
          ].map((r, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 60px', gap: 8, padding: '6px 0', fontSize: 11, borderBottom: `1px dashed ${T.border}` }}>
              <div style={{ color: T.textMuted }}>{r.d}</div>
              <div style={{ color: T.text }}>{r.e}</div>
              <div style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{r.mi.toLocaleString()} mi</div>
              <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${r.cost}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'fuel' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.warning}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={18} style={{ color: T.warning }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>Freddy alert · Truck 12</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Fuel spike · z-score 2.8 vs 90-day baseline</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Stat label="Today's fill" value="$184" color={T.danger} icon={Fuel} />
            <Stat label="90-day avg" value="$82" color={T.textMuted} icon={Fuel} />
          </div>
          <div style={{ height: 36, background: T.bg, borderRadius: 7, position: 'relative', padding: 4, display: 'flex', alignItems: 'end', gap: 3 }}>
            {[72, 84, 78, 86, 80, 88, 75, 90, 184].map((v, i) => (
              <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${(v / 200) * 100}%` }} transition={{ delay: i * 0.06 }} style={{ flex: 1, background: i === 8 ? T.danger : T.accent, borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, fontStyle: 'italic' }}>
            Last 9 fills · spike on the right. Maybe a leak. Maybe a thief. Investigate.
          </div>
        </div>
      )}

      {scene === 'service' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Upcoming service · next 30 days</div>
          {[
            { id: 16, model: '20 F-150',  service: 'Oil + filter',          due: 'in 1,090 mi · ~10 days',  color: T.danger, daysLeft: 10 },
            { id: 12, model: '19 F-350D', service: 'Annual inspection',     due: 'in 2,560 mi · ~24 days',  color: T.warning, daysLeft: 24 },
            { id: 7,  model: '21 F-250',  service: 'Tire rotation',         due: 'in 5,680 mi · ~52 days',  color: T.successDark, daysLeft: 52 },
            { id: 14, model: '22 Transit',service: 'Oil + filter',          due: 'in 8,800 mi · ~80 days',  color: T.textMuted, daysLeft: 80 },
          ].map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 130px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 7, background: r.color + '20', color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>#{r.id}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{r.model}</div>
              <div style={{ fontSize: 11, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Wrench size={11} style={{ color: r.color }} />
                {r.service}
              </div>
              <Chip color={r.color} bg={r.color + '15'}>{r.due}</Chip>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'driver' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Driver assignments</div>
          {TRUCKS.map((tr, i) => (
            <motion.div key={tr.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 100px 100px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.purpleBg, color: T.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                {tr.driver[0]}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{tr.driver}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>Primary driver</div>
              </div>
              <Chip icon={Truck}>#{tr.id}</Chip>
              <div style={{ fontSize: 10, color: T.textMuted }}>since Jan 2026</div>
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function HealthChip({ health }) {
  if (health === 'svc')  return <Chip color={T.danger}     bg="rgba(239,68,68,0.12)">Service due</Chip>
  if (health === 'warn') return <Chip color={T.warning}    bg={T.warningBg}>Watch</Chip>
  return <Chip color={T.successDark} bg={T.successBg}>OK</Chip>
}

function Stat({ label, value, color, icon: Icon }) {
  return (
    <div style={{ padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        {Icon && <Icon size={11} style={{ color }} />}
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    list:    '1. Every truck · odometer · driver · fuel card',
    detail:  '2. Full per-truck history · services · parts · accidents',
    fuel:    '3. Freddy spots fuel spike on Truck 12 · investigate',
    service: '4. Upcoming maintenance · Freddy nudges your inbox',
    driver:  '5. Driver assignments · easy insurance audit',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Unlock Freddy · add trucks · watch'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
