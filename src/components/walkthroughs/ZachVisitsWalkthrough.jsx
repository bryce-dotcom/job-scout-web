// Zach Visits walkthrough — rebuilt to Prospect Scout standard.
// Source: lawn-care Visits page (Zach module).
// Every mow, edge, and cleanup logged against the property. Zach predicts time.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ClipboardCheck, Calendar, Users, Clock, Cloud, TrendingUp,
  Compass, ArrowRight, Sparkles, CheckCircle2, Ruler, Save,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/zach-visits.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgInput: '#f7f5ef',
  border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e', successBg: 'rgba(34,197,94,0.10)', successDark: '#15803d',
  danger: '#ef4444', warning: '#eab308', warningBg: 'rgba(234,179,8,0.15)',
  purple: '#a855f7', purpleBg: 'rgba(168,85,247,0.10)',
}

// ─── Shared Zach page primitives (inlined — no ZachShell import) ──────────────

function ZachPageChrome({ title, subtitle, actionLabel, actionIcon: ActionIcon = Plus, actionHighlight, filterChips = [], children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{title}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>{subtitle}</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <ActionIcon size={14} /> {actionLabel}
          </button>
          {actionHighlight && (
            <motion.div initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: -4, borderRadius: 12, border: `2px solid ${T.accent}`, pointerEvents: 'none' }}
            />
          )}
        </div>
      </div>
      {filterChips.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {filterChips.map((chip, i) => (
            <div key={i} style={{ padding: '6px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, color: T.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {chip.icon && <chip.icon size={11} style={{ color: T.textMuted }} />}{chip.label}
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

function EmptyState({ icon: Icon, headline, hint }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 11, padding: 30, textAlign: 'center' }}>
      {Icon && <Icon size={32} style={{ color: T.textMuted, opacity: 0.6 }} />}
      <div style={{ fontSize: 13, color: T.textSecondary, fontWeight: 600 }}>{headline}</div>
      {hint && <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 320 }}>{hint}</div>}
    </div>
  )
}

function FormModal({ title, children, footer }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 5 }}
    >
      <motion.div initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.3 }}
        style={{ background: T.bgCard, borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '94%', overflow: 'auto', padding: 18, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</h2>
        </div>
        {children}
        {footer && <div style={{ marginTop: 14 }}>{footer}</div>}
      </motion.div>
    </motion.div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function FormInput({ value, placeholder, focused }) {
  return (
    <div style={{ padding: '8px 10px', background: T.bgInput, border: `1.5px solid ${focused ? T.accent : T.border}`, borderRadius: 7, fontSize: 12, color: T.text, minHeight: 14 }}>
      {value ? value : <span style={{ color: T.textMuted, fontStyle: 'italic' }}>{placeholder}</span>}
    </div>
  )
}

function FieldRow({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>
}

function Chip({ icon: Icon, children, color = T.accent, bg = T.accentBg }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: bg, color, fontSize: 10, fontWeight: 600 }}>
      {Icon && <Icon size={10} />}{children}
    </span>
  )
}

function ListCard({ children, flashIn }) {
  return (
    <motion.div initial={flashIn ? { opacity: 0, x: -10 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
      style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}
    >
      {children}
    </motion.div>
  )
}

function FormSubmit({ label }) {
  return (
    <button style={{ width: '100%', padding: '10px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
      <Save size={13} /> {label}
    </button>
  )
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const VISITS = [
  { id: 1, prop: 'Smith — Main St', date: '2026-05-26', type: 'Mow',     crew: 'Crew B', minutes: 34, weather: 'Sunny 78°',   billed: true  },
  { id: 2, prop: 'Smith — Main St', date: '2026-05-19', type: 'Mow',     crew: 'Crew B', minutes: 36, weather: 'Cloudy 70°',  billed: true  },
  { id: 3, prop: 'Smith — Main St', date: '2026-05-12', type: 'Mow',     crew: 'Crew A', minutes: 38, weather: 'Sunny 72°',   billed: true  },
  { id: 4, prop: 'Smith — Main St', date: '2026-05-05', type: 'Cleanup', crew: 'Crew A', minutes: 95, weather: 'Light rain',  billed: false },
]

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ZachVisitsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Log every visit. Zach gets smarter property by property." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ────────────────────────────────────────────────────────────────────

function Stage({ scene, sceneElapsed }) {
  if (scene === 'fieldscout') return <FieldScoutCompletionView sceneElapsed={sceneElapsed} />

  const visibleVisits = scene === 'logged' ? [VISITS[0]] : scene === 'history' ? VISITS : []

  return (
    <ZachPageChrome
      title="Visits"
      subtitle="Every mow, edge, and cleanup logged against the property."
      actionLabel="Log Visit"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[{ icon: ClipboardCheck, label: 'All properties' }]}
    >
      {scene === 'empty' && (
        <EmptyState icon={ClipboardCheck} headline="No visits logged yet."
          hint="Log a visit each time a crew rolls off a property." />
      )}

      {visibleVisits.length > 0 && (
        <div style={{ overflow: 'hidden' }}>
          {visibleVisits.map((v, i) => (
            <VisitCard key={v.id} visit={v} flashIn={scene === 'logged' && i === 0} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal title="Log visit" footer={<FormSubmit label="Save Visit" />}>
            <Field label="Property"><FormInput value="Smith — Main St" focused /></Field>
            <FieldRow>
              <Field label="Visit date"><FormInput value="2026-05-26" /></Field>
              <Field label="Service type"><FormInput value="Mow" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Crew"><FormInput value="Crew B" /></Field>
              <Field label="Duration (min)"><FormInput value="34" /></Field>
            </FieldRow>
            <Field label="Weather"><FormInput value="Sunny 78°" /></Field>
            <Field label="Notes"><FormInput value="Edged the front walk. Customer asked about aeration." /></Field>
          </FormModal>
        )}

        {scene === 'predict' && (
          <FormModal title="Log visit" footer={<FormSubmit label="Save Visit" />}>
            <Field label="Property"><FormInput value="Smith — Main St" focused /></Field>
            <FieldRow>
              <Field label="Visit date"><FormInput value="2026-05-26" /></Field>
              <Field label="Service type"><FormInput value="Mow" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Crew"><FormInput value="Crew B" /></Field>
              <Field label="Duration (min)"><FormInput value="34" /></Field>
            </FieldRow>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}
              style={{ display: 'flex', gap: 8, padding: 10, background: T.purpleBg, border: `1px solid ${T.purple}`, borderRadius: 8, marginBottom: 10 }}
            >
              <TrendingUp size={14} style={{ color: T.purple, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.4 }}>
                Zach predicts <strong style={{ color: T.text }}>36 min</strong> for this mow (6,450 sqft). Logging actual time tunes future estimates.
              </div>
            </motion.div>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachPageChrome>
  )
}

function VisitCard({ visit: v, flashIn }) {
  return (
    <ListCard flashIn={flashIn}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12, color: T.text }}>{v.prop}</strong>
        <Chip>{v.type}</Chip>
        {v.billed && <Chip color={T.successDark} bg={T.successBg}>Billed</Chip>}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: T.textSecondary }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={11} /> {v.date}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={11} /> {v.crew}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {v.minutes} min</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Cloud size={11} /> {v.weather}</span>
      </div>
    </ListCard>
  )
}

function FieldScoutCompletionView({ sceneElapsed }) {
  const clockRunning    = sceneElapsed > 800
  const markDoneVisible = sceneElapsed > 2200
  const visitToast      = sceneElapsed > 4500

  function TimerDisplay({ elapsed }) {
    const seconds = Math.floor(elapsed / 1000)
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0')
    const ss = (seconds % 60).toString().padStart(2, '0')
    return <>{mm}:{ss}</>
  }

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, overflow: 'hidden', display: 'flex', gap: 14 }}>
      <div style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 18px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Compass size={14} />
          <div style={{ fontSize: 12, fontWeight: 700 }}>Field Scout · Active job</div>
        </div>
        <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 3 }}>Smith — Main St</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>6395 W 10400 N · Highland UT 84003</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <Chip>Mow</Chip>
            <Chip icon={Ruler}>6,450 sqft</Chip>
            <Chip icon={Clock}>~36 min est.</Chip>
          </div>
          <div style={{ padding: '12px 14px', background: clockRunning ? T.successBg : T.bg, border: `1.5px solid ${clockRunning ? T.success : T.border}`, borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={18} style={{ color: clockRunning ? T.successDark : T.textMuted }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: clockRunning ? T.successDark : T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {clockRunning ? 'Clocked in to this job' : 'Not started'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                {clockRunning ? <TimerDisplay elapsed={Math.max(0, sceneElapsed - 800)} /> : '00:00'}
              </div>
            </div>
            {clockRunning && (
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
                style={{ width: 10, height: 10, borderRadius: '50%', background: T.success }}
              />
            )}
          </div>
          {markDoneVisible && (
            <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, scale: [1, 1.04, 1] }} transition={{ scale: { repeat: Infinity, duration: 1.6 } }}
              style={{ marginTop: 'auto', width: '100%', padding: '12px 14px', background: T.success, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            >
              <CheckCircle2 size={15} /> Mark mow complete
            </motion.button>
          )}
        </div>
      </div>

      <div style={{ width: 220, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <ArrowRight size={28} style={{ color: T.accent, alignSelf: 'center' }} />
        <AnimatePresence>
          {visitToast && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.success}`, borderRadius: 10, boxShadow: '0 4px 14px rgba(34,197,94,0.15)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <Sparkles size={12} style={{ color: T.success }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: T.successDark, textTransform: 'uppercase' }}>lawn_visits auto-write</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 2 }}>Smith — Main St</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>visit_date: today</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>crew: Crew B · duration: 34 min</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:      '1 · Empty Visits log — Log Visit in the top-right',
    form:       '2 · Property, date, service type, crew, duration, weather, notes',
    predict:    '3 · Zach predicts 36 min based on 6,450 sqft history — beat the prediction',
    logged:     '4 · Visit lands in the timeline: crew, duration, weather, billed status',
    history:    "5 · Property's full visit history — customers see this in their portal",
    fieldscout: '6 · Crew marks done in Field Scout — visit logs itself automatically',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Visits work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
