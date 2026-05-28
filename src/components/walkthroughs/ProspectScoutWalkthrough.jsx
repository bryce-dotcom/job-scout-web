// Prospect Scout walkthrough — rebuilt with realistic UI mocks.
//
// Instead of abstract Framer Motion mockups, this version renders a
// mini Lead Setter kanban + the ProspectResearchDrawer at near-pixel
// fidelity. Mock data is baked in; no API calls, no auth required.
// Scene transitions drive a state machine — the same drawer renders in
// 5 different states (empty → typing → researching → results →
// enrichment → import → done).
//
// Narration scene ids are preserved (empty / filter / results / reveal
// / import + setup) so the existing ElevenLabs MP3s map straight in.

import { useEffect, useMemo, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Sparkles, Loader2, MapPin, Briefcase, Users, UserPlus,
  ExternalLink, X as XIcon, CheckCircle2, Coins, ArrowRight, Zap,
} from 'lucide-react'
import { useNarration, resetNarrationCache, probeWalkthroughAudio } from './useNarration'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import { WALKTHROUGH_SCRIPTS } from '../../lib/walkthroughScripts'

const WALKTHROUGH_ID = 'prospect-scout'
const NARRATION = WALKTHROUGH_SCRIPTS[WALKTHROUGH_ID].lines

// Match the actual app theme. Drawer uses purple (#7c3aed) for the
// "AI / prospecting" accent — keep it consistent.
const T = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgKanban: '#f7f5ef',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  purple: '#7c3aed',
  purpleBg: 'rgba(124,58,237,0.10)',
  success: '#22c55e',
  successBg: 'rgba(34,197,94,0.10)',
  warning: '#eab308',
  info: '#3b82f6',
  contacted: '#8b5cf6',
}

// ─── Marketing reel ─────────────────────────────────────────────────────
// These are minimum visible durations per scene. At runtime the runner
// probes each scene's MP3 duration and extends the scene to the larger
// of (a) this base value and (b) audio length + AUDIO_TAIL_MS buffer.
// That way the voice never gets cut off mid-sentence regardless of
// which TTS voice is used.
const BASE_SCENES = [
  { id: 'empty',   dur: 4500 },
  { id: 'filter',  dur: 7500 },
  { id: 'results', dur: 5000 },
  { id: 'reveal',  dur: 6000 },
  { id: 'import',  dur: 6500 },
]
const AUDIO_TAIL_MS = 600  // breathing room after audio ends

// ─── Setup phase ────────────────────────────────────────────────────────
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
    body: "Choose which setter owns the new leads — they show up in that rep's board with full source citation.",
  },
]
const BASE_SETUP_INTRO_MS = 1200
const BASE_SETUP_STEP_DUR = [4500, 6000, 5000, 5500]

// All scene + setup keys in playback order — used to probe audio
// durations on mount.
const ALL_SCENE_KEYS = [
  ...BASE_SCENES.map(s => s.id),
  'setup-intro',
  ...BASE_SETUP_STEP_DUR.map((_, i) => `setup-${i}`),
]

// ─── Mock data ──────────────────────────────────────────────────────────
const TYPED_QUERY = 'warehouses in Salt Lake County over 50 employees'

const CANDIDATES = [
  {
    id: 1,
    name: 'Northbridge Industrial Storage',
    city: 'Salt Lake City', state: 'UT', industry: 'Warehousing',
    size: '80–120 employees', confidence: 'high',
    why: 'Large refrigerated warehouse with 24/7 operations; likely on outdated HID lighting.',
    enrichment: {
      person: 'Sarah Chen', title: 'Facilities Director',
      mobile: '(801) 555-0142', email: 'schen@northbridge.com',
      linkedin: true,
    },
  },
  {
    id: 2,
    name: 'Cypress Logistics SLC',
    city: 'West Valley', state: 'UT', industry: 'Logistics',
    size: '110+ employees', confidence: 'high',
    why: 'Distribution hub with multiple loading bays. High lighting load.',
  },
  {
    id: 3,
    name: 'Solera Manufacturing',
    city: 'Murray', state: 'UT', industry: 'Manufacturing',
    size: '65 employees', confidence: 'medium',
    why: '50,000 sqft plant on the south end of the valley.',
  },
  {
    id: 4,
    name: 'Granite Foods Distribution',
    city: 'South Salt Lake', state: 'UT', industry: 'Food & Beverage',
    size: '90 employees', confidence: 'high',
    why: 'Cold storage facility with documented energy-rebate participation.',
  },
  {
    id: 5,
    name: 'Ridgeline Industrial Park',
    city: 'Sandy', state: 'UT', industry: 'Warehousing',
    size: '55 employees', confidence: 'medium',
    why: 'Multi-tenant warehouse with shared lighting infrastructure.',
  },
]

// Leads that drop into the kanban after import.
const IMPORTED_LEADS = CANDIDATES.slice(0, 3).map(c => ({
  id: c.id, name: c.name, city: c.city, industry: c.industry,
}))

// ─── Main ───────────────────────────────────────────────────────────────
export default function ProspectScoutWalkthrough() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [voiceOn, setVoiceOn] = useState(true)
  const [audioDurations, setAudioDurations] = useState({})
  const timerRef = useRef(null)
  const startedAt = useRef(Date.now())

  // Probe each scene's MP3 duration on mount so we can extend any scene
  // that's shorter than its audio. Doesn't block render — scenes use
  // their base durations until the probe completes.
  useEffect(() => {
    let cancelled = false
    probeWalkthroughAudio(WALKTHROUGH_ID, ALL_SCENE_KEYS).then((map) => {
      if (!cancelled) setAudioDurations(map)
    })
    return () => { cancelled = true }
  }, [])

  // Effective durations = max(base, audio + tail buffer). Recomputed
  // whenever audio durations land.
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

  const { phase, sceneKey, setupIdx, setupShowingIntro, sceneElapsed } =
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
      paddingBottom: '56.25%', // 16:9
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* The marketing reel is rendered as a single live stage; scene
            transitions just change the props. This keeps the drawer
            sliding in/out smoothly instead of mounting/unmounting. */}
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}

        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="setup-intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="setup-checklist">
              <SetupChecklist title="Set it up in 4 steps" steps={SETUP_STEPS} currentIdx={setupIdx} />
            </CenteredOverlay>
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

// ─── Stage — renders kanban + drawer based on current scene ─────────────
function Stage({ scene, sceneElapsed }) {
  // Drawer visibility & state per scene:
  //   empty   — drawer hidden, "Find Prospects" button highlighted
  //   filter  — drawer in, typing query
  //   results — drawer in, results popping in
  //   reveal  — drawer in, first card expanded with enrichment
  //   import  — drawer in, 3 selected + bottom bar; near end drawer slides
  //             away and kanban shows new leads
  const drawerOpen = scene !== 'empty'
  // In the back half of the import scene, slide the drawer away and
  // show the freshly-imported leads in the kanban.
  const showImported = scene === 'import' && sceneElapsed > 4500
  const kanbanLeads = showImported ? IMPORTED_LEADS : []
  const highlightCta = scene === 'empty'

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, display: 'flex' }}>
      <MiniLeadSetter
        highlightCta={highlightCta}
        importedLeads={kanbanLeads}
        flashImported={showImported}
      />
      <AnimatePresence>
        {drawerOpen && (
          <ProspectDrawer
            key={showImported ? 'drawer-closing' : 'drawer-open'}
            scene={scene}
            sceneElapsed={sceneElapsed}
            closing={showImported}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Mini Lead Setter board ─────────────────────────────────────────────
function MiniLeadSetter({ highlightCta, importedLeads, flashImported }) {
  return (
    <div style={{
      flex: 1,
      backgroundColor: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
    }}>
      {/* Header — title + setter-pay strip + Find Prospects button */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backgroundColor: T.bgCard,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Lead Setter</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>Drag leads to calendar to schedule appointments</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatPill label="/appt" value="$25" />
          <StatPill label=" pending" value="0" />
          <StatPill label=" earned" value="$0" />
          <FindProspectsButton highlight={highlightCta} />
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 14, fontSize: 11, color: T.textMuted, backgroundColor: T.bg }}>
        <Stat label="New Leads"  value={importedLeads.length || 0} color={T.info} />
        <Stat label="Contacted"  value={0} color={T.contacted} />
        <Stat label="📅 Scheduled" value={0} color={T.success} />
        <Stat label="✅ Qualified" value={0} color={T.success} />
      </div>

      {/* Kanban columns */}
      <div style={{ flex: 1, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, backgroundColor: T.bg }}>
        <KanbanColumn title="New"       color={T.info}      leads={importedLeads} flashIn={flashImported} />
        <KanbanColumn title="Contacted" color={T.contacted} leads={[]} />
        <KanbanColumn title="Scheduled" color={T.success}   leads={[]} />
        <KanbanColumn title="Qualified" color={T.success}   leads={[]} />
      </div>
    </div>
  )
}

function StatPill({ label, value }) {
  return (
    <div style={{ padding: '4px 8px', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11 }}>
      <span style={{ fontWeight: 700, color: T.text }}>{value}</span>
      <span style={{ color: T.textMuted }}>{label}</span>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, backgroundColor: color }} />
      <span style={{ fontWeight: 700, color: T.text }}>{value}</span>
      <span>{label}</span>
    </div>
  )
}

function FindProspectsButton({ highlight }) {
  return (
    <div style={{ position: 'relative' }}>
      <button style={{
        padding: '8px 14px',
        backgroundColor: T.purple,
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        position: 'relative',
        zIndex: 1,
      }}>
        <Sparkles size={13} /> Find Prospects
      </button>
      {highlight && (
        <>
          {/* Pulse ring */}
          <motion.div
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: -4,
              borderRadius: 12, border: `2px solid ${T.purple}`,
              pointerEvents: 'none',
            }}
          />
          {/* Arrow callout below the button */}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              padding: '5px 10px',
              backgroundColor: T.purple,
              color: '#fff',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(124,58,237,0.35)',
            }}
          >
            Click to open
            <div style={{
              position: 'absolute', top: -4, right: 18, width: 8, height: 8,
              backgroundColor: T.purple, transform: 'rotate(45deg)',
            }} />
          </motion.div>
        </>
      )}
    </div>
  )
}

function KanbanColumn({ title, color, leads, flashIn }) {
  return (
    <div style={{
      backgroundColor: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, backgroundColor: color }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.textMuted }}>{leads.length}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {leads.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>
            empty
          </div>
        ) : (
          leads.map((lead, i) => (
            <motion.div
              key={lead.id}
              initial={flashIn ? { opacity: 0, x: 12, backgroundColor: 'rgba(34,197,94,0.3)' } : false}
              animate={{ opacity: 1, x: 0, backgroundColor: '#fff' }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
              style={{
                padding: '6px 8px',
                border: `1px solid ${T.border}`,
                borderRadius: 5,
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.name}
              </div>
              <div style={{ fontSize: 9, color: T.textMuted }}>
                {lead.industry} · {lead.city}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Prospect Drawer Mock ───────────────────────────────────────────────
function ProspectDrawer({ scene, sceneElapsed, closing }) {
  // Typewriter animation for the query
  const showTyping = scene === 'filter'
  const typedLen = showTyping
    ? Math.min(TYPED_QUERY.length, Math.floor((sceneElapsed / 50)))
    : TYPED_QUERY.length
  const typed = TYPED_QUERY.slice(0, typedLen)
  const typingDone = typedLen >= TYPED_QUERY.length

  // Searching state — once typing is done (scene=filter, late), show
  // the Researching button until results scene starts.
  const isResearching = scene === 'filter' && typingDone
  const showResults = ['results', 'reveal', 'import'].includes(scene)
  const expandedCandidateId = ['reveal', 'import'].includes(scene) ? CANDIDATES[0].id : null
  const selectedIds = scene === 'import' ? new Set([1, 2, 4]) : new Set()

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={closing ? { x: '100%', opacity: 0 } : { x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        top: 18, right: 18, bottom: 18,
        width: '42%',
        maxWidth: 420,
        backgroundColor: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 2,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        backgroundColor: T.bgCard,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <Sparkles size={16} style={{ color: T.purple }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Find Prospects</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>
            AI-researched · live web search
            <span style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, backgroundColor: T.purpleBg, color: T.purple }}>
              ⭐ Field Boss
            </span>
          </div>
        </div>
        <XIcon size={16} style={{ color: T.textMuted }} />
      </div>

      {/* Quota strip */}
      <div style={{ padding: '6px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.textMuted, display: 'flex', gap: 14, backgroundColor: T.bgCard }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Searches: <strong style={{ color: T.text }}>3/unlimited</strong>
          <div style={{ width: 32, height: 3, backgroundColor: T.border, borderRadius: 2 }}>
            <div style={{ width: '5%', height: '100%', backgroundColor: T.purple }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Enrichments: <strong style={{ color: T.text }}>12/unlimited</strong>
        </div>
      </div>

      {/* Search form */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.bgCard }}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <div style={{
            padding: '9px 10px 9px 30px',
            border: `1.5px solid ${showTyping ? T.purple : T.border}`,
            borderRadius: 8,
            fontSize: 12,
            color: T.text,
            backgroundColor: '#fff',
            minHeight: 14,
            fontFamily: 'inherit',
          }}>
            {scene === 'filter' && typed.length === 0 ? (
              <span style={{ color: T.textMuted, fontStyle: 'italic' }}>
                warehouses in Salt Lake County over 50 employees
              </span>
            ) : (
              <>
                {showResults ? TYPED_QUERY : typed}
                {scene === 'filter' && !typingDone && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ display: 'inline-block', width: 1.5, height: 11, backgroundColor: T.purple, marginLeft: 2, transform: 'translateY(2px)' }}
                  />
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, lineHeight: 1.3 }}>
          <strong>Try:</strong> "auto repair shops in Northern Utah" · "restaurants with 20+ locations in Idaho"
        </div>
        <button style={{
          width: '100%',
          padding: '9px 14px',
          backgroundColor: T.purple,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          cursor: 'pointer',
        }}>
          {isResearching ? (
            <>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              Researching… (10–30s)
            </>
          ) : (
            <><Sparkles size={13} /> Find prospects</>
          )}
        </button>
      </div>

      {/* Results / empty state */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!showResults ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16 }}>
            <Sparkles size={26} style={{ color: T.purple, opacity: 0.5, marginBottom: 8 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>
              Type what you're hunting for
            </div>
            <div style={{ fontSize: 10, color: T.textMuted }}>
              Be specific. The more detail you give, the better results.
            </div>
          </div>
        ) : (
          CANDIDATES.map((c, i) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              index={i}
              expanded={c.id === expandedCandidateId && scene === 'reveal'}
              selected={selectedIds.has(c.id)}
              showActionButton={scene === 'reveal' && i === 0}
            />
          ))
        )}
      </div>

      {/* Sticky bottom action bar (only when selections are checked) */}
      {scene === 'import' && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            flexShrink: 0,
            padding: '10px 12px',
            backgroundColor: T.bgCard,
            borderTop: `1px solid ${T.border}`,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{
            flex: 1,
            padding: '7px 10px',
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            fontSize: 11,
            backgroundColor: '#fff',
            color: T.text,
          }}>
            Assign to: <strong>Bryce Westcott</strong>
          </div>
          <button style={{
            padding: '8px 14px',
            backgroundColor: T.success,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
          }}>
            <UserPlus size={12} /> Add 3 to leads
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}

function CandidateCard({ candidate: c, index, expanded, selected, showActionButton }) {
  const confColor = c.confidence === 'high' ? '#16a34a' : c.confidence === 'medium' ? '#a16207' : '#6b7280'
  const confBg    = c.confidence === 'high' ? 'rgba(34,197,94,0.15)' : c.confidence === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(156,163,175,0.15)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.35 }}
      style={{
        padding: 10,
        backgroundColor: T.bgCard,
        border: `2px solid ${selected ? T.accent : T.border}`,
        borderRadius: 10,
        display: 'flex',
        gap: 8,
      }}
    >
      <input type="checkbox" checked={selected} readOnly style={{ marginTop: 3, width: 13, height: 13, accentColor: T.accent }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.name}
          </div>
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 8,
            backgroundColor: confBg, color: confColor,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>
            {c.confidence}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10, color: T.textMuted, marginBottom: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><MapPin size={9} />{c.city}, {c.state}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Briefcase size={9} />{c.industry}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Users size={9} />{c.size}</span>
        </div>
        <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4, marginBottom: 4 }}>
          {c.why}
        </div>

        <AnimatePresence>
          {expanded && c.enrichment && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35 }}
              style={{
                marginTop: 6, padding: 8,
                backgroundColor: T.purpleBg,
                border: `1px solid ${T.purple}33`,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                {c.enrichment.person} <span style={{ fontWeight: 400, color: T.textMuted }}>— {c.enrichment.title}</span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 6px', marginBottom: 3,
                backgroundColor: T.successBg,
                border: `1px solid ${T.success}40`,
                borderRadius: 4,
                fontSize: 11,
              }}>
                <span>📱</span>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>{c.enrichment.mobile}</span>
                <span style={{ fontSize: 8, color: '#16a34a', fontWeight: 700, padding: '1px 4px', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 3 }}>
                  MOBILE
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 8, color: '#16a34a', border: '1px solid #16a34a', padding: '1px 4px', borderRadius: 3 }}>
                  Text
                </span>
              </div>
              <div style={{ fontSize: 10, color: T.text, marginBottom: 2 }}>
                ✉ <span style={{ color: T.accent }}>{c.enrichment.email}</span>
              </div>
              {c.enrichment.linkedin && (
                <div style={{ fontSize: 10, color: T.accent }}>
                  LinkedIn ↗
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {showActionButton && !expanded && (
          <button style={{
            marginTop: 5,
            padding: '4px 8px',
            backgroundColor: T.purple,
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
          }}>
            <Sparkles size={9} /> Find decision-maker
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Timeline ───────────────────────────────────────────────────────────
// Takes the live (audio-aware) durations so scenes auto-extend to fit
// narration that runs longer than the planned visual length.
function timelinePosition(elapsed, { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs }) {
  if (elapsed >= totalMs) {
    return { phase: 'done', sceneKey: null, setupIdx: SETUP_STEPS.length - 1, setupShowingIntro: false, sceneElapsed: 0 }
  }
  if (elapsed < totalMarketingMs) {
    let acc = 0
    for (let i = 0; i < scenes.length; i++) {
      const start = acc
      acc += scenes[i].dur
      if (elapsed < acc) return { phase: 'marketing', sceneKey: scenes[i].id, setupIdx: 0, setupShowingIntro: false, sceneElapsed: elapsed - start }
    }
  }
  const setupElapsed = elapsed - totalMarketingMs
  if (setupElapsed < setupIntroMs) {
    return { phase: 'setup', sceneKey: 'setup-intro', setupIdx: 0, setupShowingIntro: true, sceneElapsed: setupElapsed }
  }
  let acc = setupIntroMs
  for (let i = 0; i < setupStepDur.length; i++) {
    const start = acc
    acc += setupStepDur[i]
    if (setupElapsed < acc) return { phase: 'setup', sceneKey: `setup-${i}`, setupIdx: i, setupShowingIntro: false, sceneElapsed: setupElapsed - start }
  }
  return { phase: 'setup', sceneKey: `setup-${SETUP_STEPS.length - 1}`, setupIdx: SETUP_STEPS.length - 1, setupShowingIntro: false, sceneElapsed: 0 }
}

// ─── Reusable overlay components ────────────────────────────────────────
function CenteredOverlay({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(247,245,239,0.85)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {children}
    </motion.div>
  )
}

function SetupIntro() {
  return (
    <CenteredOverlay>
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35 }}
        style={{ textAlign: 'center' }}
      >
        <div style={{ fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 6 }}>
          Part 2
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: T.text }}>Set it up</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>Four steps. About a minute.</div>
      </motion.div>
    </CenteredOverlay>
  )
}

function DonePanel({ onReplay }) {
  return (
    <CenteredOverlay>
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
    </CenteredOverlay>
  )
}

// ─── Caption + progress bar ─────────────────────────────────────────────
const MARKETING_CAPTIONS = {
  empty:   "1. The setter's lead board is empty",
  filter:  '2. Type the prospect description in plain English',
  results: '3. Claude does live web research and returns real businesses',
  reveal:  '4. Tap to reveal email, phone, and decision-maker',
  import:  '5. Import to the pipeline — full source attribution',
}
const SETUP_CAPTIONS = [
  'Setup 1/4 — Open Lead Setter → Find Prospects',
  'Setup 2/4 — Write specific plain-English queries',
  'Setup 3/4 — Multi-select then enrich',
  'Setup 4/4 — Assign the new leads on import',
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
          left: 18, bottom: 30, right: 18,
          padding: '8px 14px',
          backgroundColor: 'rgba(44,53,48,0.92)',
          color: '#fff',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'center',
          backdropFilter: 'blur(4px)',
          zIndex: 3,
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
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', zIndex: 3 }}>
      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: T.success, transition: 'width 0.1s linear' }} />
      {boundaryPct != null && (
        <div style={{ position: 'absolute', left: `${boundaryPct}%`, top: -2, width: 2, height: 7, backgroundColor: T.accent, transform: 'translateX(-50%)' }} />
      )}
    </div>
  )
}

// CSS keyframe used by the Researching spinner — injected once globally.
if (typeof document !== 'undefined' && !document.getElementById('prospect-scout-walkthrough-css')) {
  const s = document.createElement('style')
  s.id = 'prospect-scout-walkthrough-css'
  s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
  document.head.appendChild(s)
}
