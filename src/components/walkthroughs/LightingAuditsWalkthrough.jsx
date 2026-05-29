// Lighting Audits walkthrough — Lenard's killer demo.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Lightbulb, Camera, Sparkles, FileSignature, DollarSign, MapPin,
  Building2, Zap, PenLine,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/lighting-audits.js'

const AREAS = [
  { id: 1, name: 'Loading dock',   fixtures: 18, type: 'Metal Halide 400W' },
  { id: 2, name: 'Warehouse floor', fixtures: 142, type: 'Metal Halide 400W' },
  { id: 3, name: 'Mezzanine',      fixtures: 36, type: 'T8 4-lamp' },
  { id: 4, name: 'Office',         fixtures: 24, type: '2x4 fluorescent' },
  { id: 5, name: 'Exterior',       fixtures: 12, type: 'HPS Wallpack' },
  { id: 6, name: 'Break room',     fixtures: 8,  type: 'CFL recessed' },
]

export default function LightingAuditsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Walk, photograph, sign — proposal in an afternoon." />}
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
    <ZachShell title="Audit · Northbridge Warehouse" subtitle="60,000 sqft · RMP Wattsmart 2026" actionLabel="Add Area" actionIcon={Camera}>
      {scene === 'walk' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 44 }}>
            🏭
          </motion.div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Northbridge · Highland UT</div>
          <Chip icon={Lightbulb} color={T.warning} bg={T.warningBg}>240 metal-halide highbays</Chip>
        </div>
      )}

      {scene === 'snap' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {AREAS.slice(0, 3).map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.18 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4/3', background: 'linear-gradient(180deg, #475569 0%, #1e293b 70%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {[0, 1, 2, 3].map(j => (
                  <motion.div key={j} initial={{ opacity: 0 }} animate={{ opacity: [0.6, 1, 0.6] }} transition={{ delay: j * 0.2, repeat: Infinity, duration: 1.5 }} style={{ position: 'absolute', top: `${20 + (j % 2) * 40}%`, left: `${15 + j * 25}%`, width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 12px #fbbf24' }} />
                ))}
              </div>
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{a.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>photo captured</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'measure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '100%', overflow: 'auto' }}>
          {AREAS.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 60px', gap: 8, padding: '8px 10px', background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{a.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted }}>{a.type}</div>
              </div>
              <Chip icon={Sparkles}>AI identified</Chip>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, textAlign: 'right' }}>{a.fixtures}</div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} style={{ marginTop: 4, padding: '8px 12px', background: T.accentBg, border: `1.5px solid ${T.accent}`, borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Total cataloged</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>240 fixtures</div>
          </motion.div>
        </div>
      )}

      {scene === 'rebate' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 16, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Chip icon={Zap} color={T.purple} bg={T.purpleBg}>RMP Wattsmart 2026</Chip>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {[
              { label: 'Metal halide → LED highbay', count: 142, perUnit: 80, total: 11360 },
              { label: 'T8 → LED tube',              count: 36,  perUnit: 25, total: 900 },
              { label: '2x4 fluorescent → LED',     count: 24,  perUnit: 45, total: 1080 },
              { label: 'HPS wallpack → LED',         count: 12,  perUnit: 120, total: 1440 },
            ].map((row, i) => (
              <motion.div key={row.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} style={{ padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{row.label}</div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{row.count} × ${row.perUnit}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.successDark, marginTop: 3 }}>${row.total.toLocaleString()}</div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ marginTop: 12, padding: 10, background: T.successBg, border: `1.5px solid ${T.successDark}`, borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.successDark }}>Total rebate</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.successDark }}>$14,780</div>
          </motion.div>
        </div>
      )}

      {scene === 'proposal' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 18, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>LED Retrofit Proposal · Northbridge</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Stat label="Project cost" value="$28,400" color={T.text} />
            <Stat label="Rebate" value="$14,780" color={T.successDark} />
            <Stat label="Annual savings" value="$8,200/yr" color={T.accent} />
            <Stat label="Payback" value="1.7 years" color={T.purple} />
          </div>
          <div style={{ flex: 1, padding: 12, background: T.bg, border: `1px dashed ${T.border}`, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <PenLine size={14} style={{ color: T.accent }} />
            <span style={{ fontSize: 11, color: T.text }}>Sign here to accept</span>
            <motion.svg width="80" height="22" viewBox="0 0 80 22">
              <motion.path d="M 4 18 Q 16 4 28 16 T 52 12 T 76 18" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.4 }} />
            </motion.svg>
          </div>
        </div>
      )}
    </ZachShell>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    walk:     '1. 60,000 sqft warehouse · old metal-halide everywhere',
    snap:     '2. Snap a photo of each area — Lenard reads fixtures',
    measure:  '3. AI counts bulbs, tags every fixture · 240 cataloged',
    rebate:   '4. RMP Wattsmart math · customer owed $14,780 back',
    proposal: '5. One-tap proposal · signed on the spot',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Lenard ships ready'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
