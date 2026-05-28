// Animated walkthrough for "AI Yard Measure" (Zach The Yard Yeti).
//
// This is a Framer Motion-driven explainer that plays inside the Video
// Library modal — same place a real Loom embed would render. Five
// scenes, ~15 seconds total, loops with a Replay button.
//
// Storyboard:
//   1. Prospect types in their address on a phone-style form
//   2. Camera zooms onto an aerial view of their lot
//   3. AI traces the turf polygon; sqft counter ticks up
//   4. Instant quote card slides up with breakdown
//   5. Email-delivered toast + replay
//
// Designed to look real (theme colors, real font sizes, real-feeling
// micro-interactions) so a prospect watching it actually understands
// what the feature does in 15 seconds.

import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Sparkles, DollarSign, Mail, RotateCcw, Sprout, Check, Search,
} from 'lucide-react'
import { useNarration, resetNarrationCache, probeWalkthroughAudio } from './useNarration'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { WALKTHROUGH_SCRIPTS } from '../../lib/walkthroughScripts'

const WALKTHROUGH_ID = 'yard-measure'
const NARRATION = WALKTHROUGH_SCRIPTS[WALKTHROUGH_ID].lines

// Theme — keeps the walkthrough on-brand with the rest of the app.
const T = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e',
  grass: '#7ea65a',
  grassDeep: '#5a7e3f',
  dirt: '#c4a878',
  road: '#8b8a85',
  roof: '#7a4d3a',
  housePad: '#d8d2c1',
  tree: '#4a6b3a',
}

// ─── Marketing reel ─────────────────────────────────────────────────────
// BASE_SCENES is the MINIMUM visible time per scene. At runtime the
// runner probes each MP3 and extends the scene to the larger of (a)
// this base value and (b) audio length + AUDIO_TAIL_MS buffer.
// Works for any voice without needing to retune timings.
const BASE_SCENES = [
  { id: 'address',  dur: 3500 },
  { id: 'zoom',     dur: 3000 },
  { id: 'trace',    dur: 4500 },
  { id: 'quote',    dur: 3500 },
  { id: 'delivered',dur: 5000 },
]
const AUDIO_TAIL_MS = 600  // breathing room after audio ends

// ─── Setup phase ────────────────────────────────────────────────────────
const SETUP_STEPS = [
  {
    icon: 'Globe',
    title: 'Enable the public quote page',
    body: 'Settings → Public Quote: flip on Yard Measure and pick your URL slug (job-scout.app/quote/your-slug).',
  },
  {
    icon: 'DollarSign',
    title: 'Set your pricing tiers',
    body: 'Open Zach → Pricing. Define $/sq-ft for each tier and your seasonal window (typically April–October).',
  },
  {
    icon: 'MapPin',
    title: 'Define your service area',
    body: 'Add the ZIP codes you cover. Out-of-area leads get a polite "not yet" instead of a runaway quote.',
  },
  {
    icon: 'Share2',
    title: 'Share the link anywhere',
    body: 'Drop the URL in ads, on your website, in cold emails. Every quote drops a lead into your pipeline.',
  },
]
const BASE_SETUP_INTRO_MS = 1000
const BASE_SETUP_STEP_DUR = [2800, 3800, 2800, 5500]
const ALL_SCENE_KEYS = [
  ...BASE_SCENES.map(s => s.id),
  'setup-intro',
  ...BASE_SETUP_STEP_DUR.map((_, i) => `setup-${i}`),
]

// Narration imported from lib/walkthroughScripts.

export default function YardMeasureWalkthrough() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [voiceOn, setVoiceOn] = useState(true)
  const [audioDurations, setAudioDurations] = useState({})
  const timerRef = useRef(null)
  const startedAt = useRef(Date.now())

  // Probe MP3 durations on mount so scenes auto-extend to fit narration.
  useEffect(() => {
    let cancelled = false
    probeWalkthroughAudio(WALKTHROUGH_ID, ALL_SCENE_KEYS).then((map) => {
      if (!cancelled) setAudioDurations(map)
    })
    return () => { cancelled = true }
  }, [])

  const { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs } = useMemo(() => {
    const ext = (key, base) => {
      const audio = audioDurations[key]
      return audio ? Math.max(base, audio + AUDIO_TAIL_MS) : base
    }
    const scenes = BASE_SCENES.map(s => ({ ...s, dur: ext(s.id, s.dur) }))
    const setupIntroMs = ext('setup-intro', BASE_SETUP_INTRO_MS)
    const setupStepDur = BASE_SETUP_STEP_DUR.map((d, i) => ext(`setup-${i}`, d))
    const totalMarketingMs = scenes.reduce((s, x) => s + x.dur, 0)
    const totalSetupMs = setupIntroMs + setupStepDur.reduce((s, x) => s + x, 0)
    return { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs: totalMarketingMs + totalSetupMs }
  }, [audioDurations])

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now() - elapsed
    const tick = () => {
      const now = Date.now() - startedAt.current
      if (now >= totalMs) {
        setElapsed(totalMs)
        setRunning(false)
        return
      }
      setElapsed(now)
      timerRef.current = requestAnimationFrame(tick)
    }
    timerRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timerRef.current)
  }, [running, totalMs])

  const { phase, sceneKey, setupIdx, setupShowingIntro } =
    timelinePosition(elapsed, { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs })
  useNarration({ walkthroughId: WALKTHROUGH_ID, scene: sceneKey, script: NARRATION, enabled: voiceOn })

  const replay = () => {
    resetNarrationCache()
    setElapsed(0)
    setRunning(true)
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingBottom: '56.25%',  // 16:9
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          {/* Marketing reel */}
          {phase === 'marketing' && sceneKey === 'address'   && <SceneAddress   key="s1" />}
          {phase === 'marketing' && sceneKey === 'zoom'      && <SceneZoom      key="s2" />}
          {phase === 'marketing' && sceneKey === 'trace'     && <SceneTrace     key="s3" />}
          {phase === 'marketing' && sceneKey === 'quote'     && <SceneQuote     key="s4" />}
          {phase === 'marketing' && sceneKey === 'delivered' && <SceneDelivered key="s5" />}

          {/* Setup phase */}
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="setup-intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <SetupChecklist
              key="setup-checklist"
              title="Set it up in 4 steps"
              steps={SETUP_STEPS}
              currentIdx={setupIdx}
            />
          )}

          {phase === 'done' && <DonePanel key="done" onReplay={replay} />}
        </AnimatePresence>
      </div>

      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />

      <Caption phase={phase} sceneKey={sceneKey} setupIdx={setupIdx} setupShowingIntro={setupShowingIntro} />
      <ProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// Audio-aware timeline. Takes live effective durations so scenes
// auto-extend to fit narration that runs longer than the visual.
function timelinePosition(elapsed, { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs }) {
  if (elapsed >= totalMs) {
    return { phase: 'done', sceneKey: null, setupIdx: SETUP_STEPS.length - 1, setupShowingIntro: false }
  }
  if (elapsed < totalMarketingMs) {
    let acc = 0
    for (let i = 0; i < scenes.length; i++) {
      acc += scenes[i].dur
      if (elapsed < acc) return { phase: 'marketing', sceneKey: scenes[i].id, setupIdx: 0, setupShowingIntro: false }
    }
  }
  const setupElapsed = elapsed - totalMarketingMs
  if (setupElapsed < setupIntroMs) {
    return { phase: 'setup', sceneKey: 'setup-intro', setupIdx: 0, setupShowingIntro: true }
  }
  let acc = setupIntroMs
  for (let i = 0; i < setupStepDur.length; i++) {
    acc += setupStepDur[i]
    if (setupElapsed < acc) return { phase: 'setup', sceneKey: `setup-${i}`, setupIdx: i, setupShowingIntro: false }
  }
  return { phase: 'setup', sceneKey: `setup-${SETUP_STEPS.length - 1}`, setupIdx: SETUP_STEPS.length - 1, setupShowingIntro: false }
}

function SetupIntro() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.35 }}
      style={{ textAlign: 'center' }}
    >
      <div style={{
        fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.12em',
        fontWeight: 700, marginBottom: 6,
      }}>
        Part 2
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: T.text }}>Set it up</div>
      <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
        Four steps. About a minute.
      </div>
    </motion.div>
  )
}

function DonePanel({ onReplay }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
    >
      <motion.div
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        style={{
          width: 64, height: 64, borderRadius: '50%',
          backgroundColor: T.success,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(34,197,94,0.4)',
        }}
      >
        <CheckCircle2 size={36} color="#fff" strokeWidth={2.5} />
      </motion.div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>You're ready</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
          Share your quote URL and watch leads roll in.
        </div>
      </div>
      <button
        onClick={onReplay}
        style={{
          padding: '8px 16px',
          backgroundColor: T.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 4px 12px rgba(90,99,73,0.3)',
        }}
      >
        Replay <ArrowRight size={12} />
      </button>
    </motion.div>
  )
}

// ─── Scene 1: Address entry ─────────────────────────────────────────────
function SceneAddress() {
  const fullAddress = '1457 N 110 W, Orem UT 84057'
  const [typed, setTyped] = useState('')
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i++
      setTyped(fullAddress.slice(0, i))
      if (i >= fullAddress.length) clearInterval(id)
    }, 55)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
      style={{
        width: '78%',
        maxWidth: 460,
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        padding: '24px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Sprout size={18} style={{ color: T.success }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Zach The Yard Yeti</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: T.textMuted, padding: '2px 8px', borderRadius: 999, backgroundColor: T.accentBg }}>
          Public quote
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>
        Get an instant lawn-care quote
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 18 }}>
        We'll measure your yard from satellite — no visit needed.
      </div>
      <div style={{ position: 'relative' }}>
        <MapPin size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.accent }} />
        <div style={{
          padding: '12px 14px 12px 36px',
          backgroundColor: T.bg,
          border: `2px solid ${T.accent}`,
          borderRadius: 10,
          fontSize: 14,
          color: T.text,
          fontFamily: 'monospace',
          minHeight: 18,
        }}>
          {typed}
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            style={{ display: 'inline-block', width: 1.5, height: 14, backgroundColor: T.accent, marginLeft: 2, transform: 'translateY(2px)' }}
          />
        </div>
      </div>
      <motion.button
        initial={{ scale: 1 }}
        animate={{ scale: typed.length >= fullAddress.length - 4 ? [1, 1.04, 1] : 1 }}
        transition={{ repeat: Infinity, duration: 1.6 }}
        style={{
          marginTop: 14,
          width: '100%',
          padding: '12px 16px',
          backgroundColor: T.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Get my quote →
      </motion.button>
    </motion.div>
  )
}

// ─── Scene 2: Map zooms in ──────────────────────────────────────────────
function SceneZoom() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ scale: 0.3, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        style={{
          width: '78%',
          maxWidth: 540,
          aspectRatio: '4 / 3',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          border: `1px solid ${T.border}`,
        }}
      >
        <LotSatellite traced={false} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.4 }}
        style={{
          position: 'absolute',
          top: '12%',
          padding: '6px 14px',
          backgroundColor: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: T.text,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <MapPin size={12} style={{ color: T.accent }} /> Found your property
      </motion.div>
    </motion.div>
  )
}

// ─── Scene 3: AI traces polygon + sqft counter ──────────────────────────
function SceneTrace() {
  const [sqft, setSqft] = useState(0)
  const target = 2850
  useEffect(() => {
    const start = Date.now()
    const dur = 2400
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur)
      setSqft(Math.floor(target * easeOutCubic(t)))
      if (t >= 1) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{
        width: '78%',
        maxWidth: 540,
        aspectRatio: '4 / 3',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        border: `1px solid ${T.border}`,
        position: 'relative',
      }}>
        <LotSatellite traced={true} />

        {/* Sparkle particles to sell the "AI is working" beat */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0] }}
            transition={{ duration: 1.4, delay: 0.2 + i * 0.18, repeat: Infinity, repeatDelay: 2 }}
            style={{
              position: 'absolute',
              top: `${25 + (i * 9)}%`,
              left: `${35 + (i * 7)}%`,
              pointerEvents: 'none',
            }}
          >
            <Sparkles size={14} style={{ color: '#ffd84d', filter: 'drop-shadow(0 0 4px rgba(255,216,77,0.6))' }} />
          </motion.div>
        ))}
      </div>

      {/* Sqft callout */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        style={{
          position: 'absolute',
          bottom: '18%',
          padding: '10px 16px',
          backgroundColor: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Sparkles size={16} style={{ color: T.success }} />
        <div>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Turf measured</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            {sqft.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>sq ft</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Scene 4: Quote card ────────────────────────────────────────────────
function SceneQuote() {
  const [price, setPrice] = useState(0)
  const target = 42
  useEffect(() => {
    const start = Date.now()
    const dur = 1400
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur)
      setPrice(Math.round(target * easeOutCubic(t)))
      if (t >= 1) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{
        width: '70%',
        maxWidth: 420,
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        boxShadow: '0 14px 40px rgba(0,0,0,0.12)',
        padding: '20px 22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Sprout size={16} style={{ color: T.success }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Your instant quote
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
        <DollarSign size={28} style={{ color: T.text, position: 'relative', top: 3 }} />
        <div style={{ fontSize: 56, fontWeight: 700, color: T.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{price}</div>
        <div style={{ fontSize: 16, color: T.textMuted, marginLeft: 4 }}>per mow</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: T.textSecondary }}>
        <BreakdownRow label="Turf area"             value="2,850 sq ft" />
        <BreakdownRow label="Rate"                  value="$0.0147 / sq ft" />
        <BreakdownRow label="Frequency"             value="Weekly · Apr–Oct" />
        <div style={{ height: 1, backgroundColor: T.border, margin: '6px 0' }} />
        <BreakdownRow label="First mow included"    value={<Check size={14} style={{ color: T.success }} />} bold />
      </div>
    </motion.div>
  )
}

function BreakdownRow({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: bold ? 600 : 400 }}>
      <span style={{ color: T.textMuted }}>{label}</span>
      <span style={{ color: T.text }}>{value}</span>
    </div>
  )
}

// ─── Scene 5: Delivered ─────────────────────────────────────────────────
function SceneDelivered() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          backgroundColor: T.success,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(34,197,94,0.4)',
        }}
      >
        <Check size={40} color="#fff" strokeWidth={3} />
      </motion.div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>Quote sent!</div>
        <div style={{ fontSize: 13, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Mail size={13} /> sarah@example.com — &lt; 30 seconds total
        </div>
      </div>
    </motion.div>
  )
}

// ─── Aerial-view SVG (the "satellite") ──────────────────────────────────
// Hand-drawn aerial of a typical suburban lot: lawn polygon, house pad,
// driveway, trees. When `traced` is true, animates a green polygon
// outline around the grass to sell the "AI measured your turf" beat.
function LotSatellite({ traced }) {
  const grassPoints = '40,60 230,30 380,80 460,180 430,310 360,360 200,380 90,330 30,220'

  return (
    <svg viewBox="0 0 500 400" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Soil / dirt frame */}
      <rect width="500" height="400" fill={T.dirt} />

      {/* Subtle texture — diagonal lines */}
      <defs>
        <pattern id="dirt-grain" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="14" stroke="#b09866" strokeWidth="0.5" opacity="0.4" />
        </pattern>
        <pattern id="grass-grain" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.8" fill={T.grassDeep} opacity="0.35" />
        </pattern>
      </defs>
      <rect width="500" height="400" fill="url(#dirt-grain)" />

      {/* Sidewalk strip */}
      <rect x="0" y="380" width="500" height="20" fill="#bcb4a3" />

      {/* Lawn polygon */}
      <polygon points={grassPoints} fill={T.grass} />
      <polygon points={grassPoints} fill="url(#grass-grain)" />

      {/* House pad */}
      <rect x="180" y="140" width="130" height="90" fill={T.housePad} stroke="#a89c80" strokeWidth="1" />
      <polygon points="180,140 245,110 310,140" fill={T.roof} />
      {/* Door */}
      <rect x="235" y="200" width="20" height="30" fill="#5d3e2a" />

      {/* Driveway */}
      <polygon points="245,230 310,230 320,400 250,400" fill={T.road} />

      {/* Trees */}
      <circle cx="90"  cy="130" r="22" fill={T.tree} opacity="0.85" />
      <circle cx="100" cy="120" r="14" fill={T.grass} opacity="0.6" />

      <circle cx="400" cy="120" r="28" fill={T.tree} opacity="0.85" />
      <circle cx="410" cy="110" r="18" fill={T.grass} opacity="0.6" />

      <circle cx="370" cy="320" r="20" fill={T.tree} opacity="0.85" />

      {/* AI-traced turf polygon — animated dasharray */}
      {traced && (
        <motion.polygon
          points={grassPoints}
          fill="none"
          stroke="#22c55e"
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeDasharray="1400"
          initial={{ strokeDashoffset: 1400 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 2.4, ease: 'easeInOut' }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.5))' }}
        />
      )}
    </svg>
  )
}

// ─── Caption / progress bar ─────────────────────────────────────────────
const MARKETING_CAPTIONS = {
  address:   '1. Prospect enters their address on your public quote page',
  zoom:      '2. We find their lot from satellite imagery',
  trace:     '3. AI traces the turf and measures it — no visit needed',
  quote:     '4. Instant per-mow quote with full breakdown',
  delivered: '5. Quote emailed; lead lands in your pipeline',
}
const SETUP_CAPTIONS = [
  'Setup 1/4 — Enable the public quote page',
  'Setup 2/4 — Set your pricing tiers',
  'Setup 3/4 — Define your service area',
  'Setup 4/4 — Share the link',
]

function Caption({ phase, sceneKey, setupIdx, setupShowingIntro }) {
  let text = ''
  let key = phase + ':' + (sceneKey || setupIdx)
  if (phase === 'marketing') text = MARKETING_CAPTIONS[sceneKey] || ''
  else if (phase === 'setup' && setupShowingIntro) text = 'Now — how to set it up'
  else if (phase === 'setup') text = SETUP_CAPTIONS[setupIdx] || ''
  else if (phase === 'done')  text = "That's the loop. Replay anytime."

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute',
          left: 18,
          bottom: 30,
          right: 18,
          padding: '8px 14px',
          backgroundColor: 'rgba(44,53,48,0.92)',
          color: '#fff',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'center',
          backdropFilter: 'blur(4px)',
        }}
      >
        {text}
      </motion.div>
    </AnimatePresence>
  )
}

function ProgressBar({ elapsed, total, phaseBoundary }) {
  const pct = Math.min(100, (elapsed / total) * 100)
  const boundaryPct = phaseBoundary ? (phaseBoundary / total) * 100 : null
  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      height: 3,
      backgroundColor: 'rgba(255,255,255,0.25)',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        backgroundColor: T.success,
        transition: 'width 0.1s linear',
      }} />
      {boundaryPct != null && (
        <div style={{
          position: 'absolute',
          left: `${boundaryPct}%`,
          top: -2,
          width: 2,
          height: 7,
          backgroundColor: T.accent,
          transform: 'translateX(-50%)',
        }} title="Setup begins here" />
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }
