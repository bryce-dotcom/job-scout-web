// Animated walkthrough for "Prospect Scout" (Apollo-replacement feature).
//
// Same chrome as YardMeasureWalkthrough: 16:9 surface, Framer Motion
// scene-by-scene animation, scene caption, progress bar, voice toggle,
// replay. Five scenes telling the prospect→pipeline story.
//
// Storyboard:
//   1. Empty lead board — the setter's morning starts cold.
//   2. Prospect Scout panel opens; filters set (industry, region).
//   3. 275M contacts queried; result rows stream in with names + companies.
//   4. Reveal email + phone on the top hits; credit ticker shows smart
//      caching avoiding double-charge.
//   5. Bulk import to pipeline; lead-setter commission badge appears.

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, MapPin, Building2, Phone, Mail, Eye, Coins,
  CheckCircle2, Telescope, ArrowRight, Sparkles,
} from 'lucide-react'
import { useNarration, resetNarrationCache } from './useNarration'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import { WALKTHROUGH_SCRIPTS } from '../../lib/walkthroughScripts'

const WALKTHROUGH_ID = 'prospect-scout'
const NARRATION = WALKTHROUGH_SCRIPTS[WALKTHROUGH_ID].lines

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
  warning: '#eab308',
  info: '#3b82f6',
}

// Scene durations are tuned to fit each narration line with a little
// trailing room. Speech rate is ~1.05, roughly 14 chars/sec. Anything
// shorter than this and the previous utterance gets cut off when the
// next scene fires speechSynthesis.cancel().
// ─── Marketing reel ─────────────────────────────────────────────────────
// Scenes are tuned to fit each narration line with ~500ms breathing room
// (rate=1.05, ~14 chars/sec). Anything shorter cuts off prior speech
// when speechSynthesis.cancel() fires at the next boundary.
const SCENES = [
  { id: 'empty',   dur: 5500 },  // 69 chars  → ~4.9s spoken
  { id: 'filter',  dur: 7400 },  // 94 chars  → ~6.7s spoken
  { id: 'results', dur: 5500 },  // 68 chars  → ~4.9s spoken
  { id: 'reveal',  dur: 6500 },  // 77 chars  → ~5.5s spoken
  { id: 'import',  dur: 6800 },  // 81 chars  → ~5.8s spoken
]

// ─── Setup phase ────────────────────────────────────────────────────────
// Prospect Scout has effectively zero configuration — the AI does the
// searching live via Claude's web_search tool with no per-tenant API
// key needed. So "setup" here is really "how to use it well" — four
// usage tips that turn a casual user into a power user.
const SETUP_STEPS = [
  {
    icon: 'Compass',
    title: 'Open Lead Setter → Find Prospects',
    body: 'No keys, no integrations, no monthly fees on top — it ships on. The Find Prospects button is in the Lead Setter toolbar.',
  },
  {
    icon: 'MessageSquare',
    title: 'Be specific in plain English',
    body: 'Industry + geography + size beats one of those. Example: "auto repair shops in Northern Utah with 5+ bays" lands better than "auto repair shops".',
  },
  {
    icon: 'CheckCircle2',
    title: 'Multi-select then enrich',
    body: 'Each enrichment burns one credit. Tap only the candidates worth a call before you reveal email + phone.',
  },
  {
    icon: 'UserPlus',
    title: 'Pick the assignee on import',
    body: 'Choose which setter owns the new leads — they show up in that rep\'s board with full source citation.',
  },
]
const SETUP_INTRO_MS = 1400
const SETUP_STEP_DUR = [5200, 6800, 5400, 5800]
const TOTAL_MARKETING_MS = SCENES.reduce((s, x) => s + x.dur, 0)
const TOTAL_SETUP_MS = SETUP_INTRO_MS + SETUP_STEP_DUR.reduce((s, x) => s + x, 0)
const TOTAL_MS = TOTAL_MARKETING_MS + TOTAL_SETUP_MS

// Narration is imported from lib/walkthroughScripts so the audio
// generator script can read it from a single source of truth.

// Mock data — names/companies match a generic B2B feel for the demo.
const PROSPECTS = [
  { name: 'Sarah Chen',     title: 'Facilities Director', co: 'Northbridge Industries', city: 'Phoenix, AZ' },
  { name: 'Marcus Reeves',  title: 'VP Operations',       co: 'Cypress Logistics',      city: 'Mesa, AZ' },
  { name: 'Priya Anand',    title: 'Plant Manager',       co: 'Solera Manufacturing',   city: 'Tempe, AZ' },
  { name: 'David Okafor',   title: 'Energy Manager',      co: 'Granite Foods',          city: 'Chandler, AZ' },
  { name: 'Hannah Liu',     title: 'Property Manager',    co: 'Ridgeline REIT',         city: 'Scottsdale, AZ' },
]

export default function ProspectScoutWalkthrough() {
  // Cursor across the combined marketing + setup timeline. We compute
  // phase + index from `elapsed` so the progress bar stays in sync.
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [voiceOn, setVoiceOn] = useState(true)
  const timerRef = useRef(null)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now() - elapsed
    const tick = () => {
      const now = Date.now() - startedAt.current
      if (now >= TOTAL_MS) {
        setElapsed(TOTAL_MS)
        setRunning(false)
        return
      }
      setElapsed(now)
      timerRef.current = requestAnimationFrame(tick)
    }
    timerRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timerRef.current)
  }, [running])

  // Phase + scene/step computed from elapsed.
  const { phase, sceneKey, setupIdx, setupShowingIntro } = timelinePosition(elapsed)
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
      paddingBottom: '56.25%', // 16:9
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          {/* Marketing reel */}
          {phase === 'marketing' && sceneKey === 'empty'   && <SceneEmpty   key="s1" />}
          {phase === 'marketing' && sceneKey === 'filter'  && <SceneFilter  key="s2" />}
          {phase === 'marketing' && sceneKey === 'results' && <SceneResults key="s3" />}
          {phase === 'marketing' && sceneKey === 'reveal'  && <SceneReveal  key="s4" />}
          {phase === 'marketing' && sceneKey === 'import'  && <SceneImport  key="s5" />}

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
      <ProgressBar elapsed={elapsed} total={TOTAL_MS} phaseBoundary={TOTAL_MARKETING_MS} />
    </div>
  )
}

// Compute where we are in the combined marketing + setup timeline.
function timelinePosition(elapsed) {
  if (elapsed >= TOTAL_MS) {
    return { phase: 'done', sceneKey: null, setupIdx: SETUP_STEPS.length - 1, setupShowingIntro: false }
  }
  if (elapsed < TOTAL_MARKETING_MS) {
    let acc = 0
    for (let i = 0; i < SCENES.length; i++) {
      acc += SCENES[i].dur
      if (elapsed < acc) return { phase: 'marketing', sceneKey: SCENES[i].id, setupIdx: 0, setupShowingIntro: false }
    }
  }
  // Setup phase
  const setupElapsed = elapsed - TOTAL_MARKETING_MS
  if (setupElapsed < SETUP_INTRO_MS) {
    return { phase: 'setup', sceneKey: 'setup-intro', setupIdx: 0, setupShowingIntro: true }
  }
  let acc = SETUP_INTRO_MS
  for (let i = 0; i < SETUP_STEP_DUR.length; i++) {
    acc += SETUP_STEP_DUR[i]
    if (setupElapsed < acc) return { phase: 'setup', sceneKey: `setup-${i}`, setupIdx: i, setupShowingIntro: false }
  }
  return { phase: 'setup', sceneKey: `setup-${SETUP_STEPS.length - 1}`, setupIdx: SETUP_STEPS.length - 1, setupShowingIntro: false }
}

// Brief "Here's how to set it up" card shown between the marketing reel
// and the checklist.
function SetupIntro() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.35 }}
      style={{
        textAlign: 'center',
      }}
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

// Final "watched everything" panel — replaces the Replay button that
// used to live inside the last marketing scene.
function DonePanel({ onReplay }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
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
          Open Lead Setter and start prospecting.
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

// ─── Scene 1: Empty lead board ──────────────────────────────────────────
function SceneEmpty() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{ width: '82%', maxWidth: 620 }}
    >
      <KanbanShell empty />
    </motion.div>
  )
}

// ─── Scene 2: Filter panel ──────────────────────────────────────────────
function SceneFilter() {
  const filters = [
    { label: 'Industry',    value: 'Manufacturing',    delay: 0.3 },
    { label: 'Region',      value: 'Phoenix metro',    delay: 0.7 },
    { label: 'Headcount',   value: '50–500',           delay: 1.1 },
    { label: 'Title',       value: 'Facilities / Ops', delay: 1.5 },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.4 }}
      style={{
        width: '80%',
        maxWidth: 540,
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Telescope size={18} style={{ color: T.accent }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Prospect Scout</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>275M verified B2B contacts</div>
        </div>
      </div>
      {/* Filters */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filters.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: f.delay, duration: 0.3 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              backgroundColor: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
            }}
          >
            <Filter size={13} style={{ color: T.textMuted, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: T.textMuted, width: 80, flexShrink: 0 }}>{f.label}</span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: T.accent,
              padding: '3px 10px',
              backgroundColor: T.accentBg,
              borderRadius: 999,
            }}>
              {f.value}
            </span>
          </motion.div>
        ))}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 2.1, duration: 0.3 }}
          style={{
            marginTop: 4,
            padding: '10px 16px',
            backgroundColor: T.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
          }}
        >
          <Search size={14} /> Search Apollo
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Scene 3: Streaming results ─────────────────────────────────────────
function SceneResults() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        width: '84%',
        maxWidth: 600,
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '10px 18px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: T.bg,
      }}>
        <div style={{ fontSize: 12, color: T.textMuted }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ fontWeight: 600, color: T.text }}
          >
            1,247
          </motion.span>{' '}
          matches in Phoenix metro
        </div>
        <div style={{ fontSize: 11, color: T.success, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={11} /> Verified emails available
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {PROSPECTS.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.32, duration: 0.3 }}
            style={{
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom: i < PROSPECTS.length - 1 ? `1px solid ${T.border}` : 'none',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: T.accentBg, color: T.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>
              {p.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
              <div style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.title} · {p.co}
              </div>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={10} /> {p.city.replace(', AZ', '')}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Scene 4: Reveal email/phone + credit ticker ────────────────────────
function SceneReveal() {
  const featured = PROSPECTS[0]
  const [credits, setCredits] = useState(1247)
  useEffect(() => {
    const target = 1245 // -2 credits revealed (cached on retry would be -1)
    const start = Date.now()
    const dur = 800
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur)
      setCredits(Math.round(1247 - 2 * t))
      if (t >= 1) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35 }}
      style={{
        width: '78%',
        maxWidth: 500,
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: '0 14px 36px rgba(0,0,0,0.14)',
        overflow: 'hidden',
      }}
    >
      {/* Header with credit ticker */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${T.border}`,
        backgroundColor: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Contact details
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.text }}>
          <Coins size={12} style={{ color: T.warning }} />
          <motion.span
            key={credits}
            initial={{ scale: 1.2, color: T.warning }}
            animate={{ scale: 1, color: T.text }}
            transition={{ duration: 0.3 }}
            style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            {credits}
          </motion.span>
          <span style={{ color: T.textMuted }}>credits</span>
        </div>
      </div>

      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            backgroundColor: T.accentBg, color: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700,
          }}>
            {featured.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{featured.name}</div>
            <div style={{ fontSize: 12, color: T.textMuted }}>{featured.title} · {featured.co}</div>
          </div>
        </div>

        {/* Revealed contact rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}
          >
            <Mail size={14} style={{ color: T.info }} />
            <span style={{ fontSize: 13, color: T.text, fontFamily: 'monospace' }}>
              <motion.span
                initial={{ filter: 'blur(8px)' }}
                animate={{ filter: 'blur(0px)' }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                schen@northbridge.com
              </motion.span>
            </span>
            <CheckCircle2 size={13} style={{ color: T.success, marginLeft: 'auto' }} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}
          >
            <Phone size={14} style={{ color: T.info }} />
            <span style={{ fontSize: 13, color: T.text, fontFamily: 'monospace' }}>
              <motion.span
                initial={{ filter: 'blur(8px)' }}
                animate={{ filter: 'blur(0px)' }}
                transition={{ delay: 0.8, duration: 0.5 }}
              >
                (602) 555-0142
              </motion.span>
            </span>
            <CheckCircle2 size={13} style={{ color: T.success, marginLeft: 'auto' }} />
          </motion.div>
        </div>

        {/* Smart-cache callout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          style={{
            marginTop: 14,
            padding: '8px 12px',
            backgroundColor: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#1f7a3a',
          }}
        >
          <Sparkles size={12} style={{ color: T.success }} />
          <span><strong>Cached for 90 days.</strong> Re-look-up costs nothing.</span>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── Scene 5: Bulk import → pipeline, commission earned ─────────────────
function SceneImport() {
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
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div style={{ width: '82%', maxWidth: 620, position: 'relative' }}>
        <KanbanShell filled />
        {/* Floating "imported" toast */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          style={{
            position: 'absolute',
            top: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            backgroundColor: T.success,
            color: '#fff',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(34,197,94,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          <CheckCircle2 size={12} /> 5 imported to pipeline
        </motion.div>
      </div>

      {/* Commission badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.4, duration: 0.4 }}
        style={{
          padding: '8px 16px',
          backgroundColor: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: T.text,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        <Sparkles size={13} style={{ color: T.warning }} />
        Setter earns <strong style={{ color: T.accent }}>$25</strong> per booked appointment
      </motion.div>
    </motion.div>
  )
}

// ─── Kanban shell (reused empty + filled) ───────────────────────────────
function KanbanShell({ empty, filled }) {
  const columns = ['New', 'Contacted', 'Callback', 'Qualified']
  const newColumnCards = filled
    ? PROSPECTS.slice(0, 5).map(p => ({ name: p.name, co: p.co }))
    : []

  return (
    <div style={{
      backgroundColor: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        backgroundColor: T.bg,
      }}>
        <Building2 size={14} style={{ color: T.accent }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Lead Setter — Today</div>
      </div>
      <div style={{
        padding: '12px',
        display: 'grid',
        gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
        gap: 8,
        minHeight: 180,
      }}>
        {columns.map((col, ci) => (
          <div key={col} style={{
            backgroundColor: T.bg,
            border: `1px dashed ${T.border}`,
            borderRadius: 8,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 160,
          }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {col}
            </div>
            {ci === 0 && newColumnCards.map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.18, duration: 0.3 }}
                style={{
                  padding: '7px 9px',
                  backgroundColor: T.bgCard,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{c.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.co}</div>
              </motion.div>
            ))}
            {empty && ci === 0 && (
              <div style={{
                marginTop: 'auto',
                marginBottom: 'auto',
                fontSize: 10,
                color: T.textMuted,
                fontStyle: 'italic',
                textAlign: 'center',
                opacity: 0.6,
              }}>
                no leads yet
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Caption / progress bar ─────────────────────────────────────────────
const MARKETING_CAPTIONS = {
  empty:   "1. The setter's lead board is empty. Time to fill it.",
  filter:  '2. Filter 275M business contacts by industry, region, headcount',
  results: '3. Verified contacts stream in — name, title, company, location',
  reveal:  '4. Reveal email + phone in one click. Smart cache = no double-charge',
  import:  '5. Bulk-import to the pipeline. Setter commission tracked automatically',
}
const SETUP_CAPTIONS = [
  'Setup 1/4 — Get your Apollo.io API key',
  'Setup 2/4 — Paste it in Settings → Integrations',
  'Setup 3/4 — Pick which roles can use Prospect Scout',
  'Setup 4/4 — Open Lead Setter and search',
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
