// Zach Visits walkthrough — daily visit log.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ClipboardCheck, Calendar, Users, Clock, Cloud, TrendingUp,
  Compass, Play, ArrowRight, Sparkles, CheckCircle2, Ruler,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import {
  T, ZachShell, EmptyState, FormModal, Field, FormInput, FieldRow,
  Chip, ListCard, FormSubmit,
} from './zach/ZachShell'
import card from '../../lib/featureKnowledge/zach-visits.js'

// Mock visits — a property's history at the end.
const VISITS = [
  { id: 1, prop: 'Smith — Main St',   date: '2026-05-26', type: 'Mow',     crew: 'Crew B', minutes: 34, weather: 'Sunny 78°', billed: true },
  { id: 2, prop: 'Smith — Main St',   date: '2026-05-19', type: 'Mow',     crew: 'Crew B', minutes: 36, weather: 'Cloudy 70°', billed: true },
  { id: 3, prop: 'Smith — Main St',   date: '2026-05-12', type: 'Mow',     crew: 'Crew A', minutes: 38, weather: 'Sunny 72°', billed: true },
  { id: 4, prop: 'Smith — Main St',   date: '2026-05-05', type: 'Cleanup', crew: 'Crew A', minutes: 95, weather: 'Light rain', billed: false },
]

export default function ZachVisitsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%',
      paddingBottom: '56.25%',
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />}

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
            <DonePanel key="done" onReplay={replay} subtitle="Log every visit. Zach gets smarter property by property." />
          )}
        </AnimatePresence>
      </div>

      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  if (scene === 'fieldscout') return <FieldScoutCompletionView sceneElapsed={sceneElapsed} />

  const visibleVisits = scene === 'logged' ? [VISITS[0]]
    : scene === 'history' ? VISITS
    : []

  return (
    <ZachShell
      title="Visits"
      subtitle="Every mow, edge, and cleanup logged against the property."
      actionLabel="Log Visit"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[{ icon: ClipboardCheck, label: 'All properties' }]}
    >
      {scene === 'empty' && (
        <EmptyState
          icon={ClipboardCheck}
          headline="No visits logged yet."
          hint="Log a visit each time a crew rolls off a property."
        />
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
            <Field label="Property">
              <FormInput value="Smith — Main St" focused />
            </Field>
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
            <Field label="Property">
              <FormInput value="Smith — Main St" focused />
            </Field>
            <FieldRow>
              <Field label="Visit date"><FormInput value="2026-05-26" /></Field>
              <Field label="Service type"><FormInput value="Mow" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Crew"><FormInput value="Crew B" /></Field>
              <Field label="Duration (min)"><FormInput value="34" /></Field>
            </FieldRow>

            {/* Zach AI prediction panel */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              style={{
                display: 'flex', gap: 8, padding: 10,
                background: T.purpleBg,
                border: `1px solid ${T.purple}`,
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <TrendingUp size={14} style={{ color: T.purple, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.4 }}>
                Zach predicts <strong style={{ color: T.text }}>36 min</strong> for this mow
                (6,450 sqft). Logging actual time tunes future estimates.
              </div>
            </motion.div>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachShell>
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

// Field Scout completion view — tech taps the property, marks done,
// the lawn_visits sidecar writes itself.
function FieldScoutCompletionView({ sceneElapsed }) {
  const clockRunning = sceneElapsed > 800
  const markDoneVisible = sceneElapsed > 2200
  const visitToast = sceneElapsed > 4500

  return (
    <div style={{
      position: 'absolute', inset: 0,
      padding: 18,
      background: T.bg,
      overflow: 'hidden',
      display: 'flex',
      gap: 14,
    }}>
      {/* Field Scout job-detail card */}
      <div style={{
        flex: 1,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${T.border}`,
          background: T.accent,
          color: '#fff',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Compass size={14} />
          <div style={{ fontSize: 12, fontWeight: 700 }}>Field Scout · Active job</div>
        </div>

        <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 3 }}>
            Smith — Main St
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
            6395 W 10400 N · Highland UT 84003
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <Chip>Mow</Chip>
            <Chip icon={Ruler}>6,450 sqft</Chip>
            <Chip icon={Clock}>~36 min est.</Chip>
          </div>

          {/* Clock-in panel */}
          <div style={{
            padding: '12px 14px',
            background: clockRunning ? T.successBg : T.bg,
            border: `1.5px solid ${clockRunning ? T.success : T.border}`,
            borderRadius: 10,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <Clock size={18} style={{ color: clockRunning ? T.successDark : T.textMuted }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: clockRunning ? T.successDark : T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {clockRunning ? 'Clocked in to this job' : 'Not started'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                {clockRunning ? <Timer elapsed={Math.max(0, sceneElapsed - 800)} /> : '00:00'}
              </div>
            </div>
            {clockRunning && (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                style={{ width: 10, height: 10, borderRadius: '50%', background: T.success }}
              />
            )}
          </div>

          {/* Mark done button */}
          {markDoneVisible && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, scale: [1, 1.04, 1] }}
              transition={{ scale: { repeat: Infinity, duration: 1.6 } }}
              style={{
                marginTop: 'auto',
                width: '100%',
                padding: '12px 14px',
                background: T.success,
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                fontSize: 13, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                cursor: 'pointer',
              }}
            >
              <CheckCircle2 size={15} /> Mark mow complete
            </motion.button>
          )}
        </div>
      </div>

      {/* Right: arrow + auto-logged visit toast */}
      <div style={{ width: 220, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <ArrowRight size={28} style={{ color: T.accent, alignSelf: 'center' }} />
        <AnimatePresence>
          {visitToast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                padding: 12,
                background: T.bgCard,
                border: `1.5px solid ${T.success}`,
                borderRadius: 10,
                boxShadow: '0 4px 14px rgba(34,197,94,0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <Sparkles size={12} style={{ color: T.success }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: T.successDark, textTransform: 'uppercase' }}>
                  lawn_visits auto-write
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 2 }}>Smith — Main St</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>visit_date: today</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>crew: Crew B</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>duration: 34 min</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Tiny ticking timer display ("MM:SS")
function Timer({ elapsed }) {
  const seconds = Math.floor(elapsed / 1000)
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0')
  const ss = (seconds % 60).toString().padStart(2, '0')
  return <>{mm}:{ss}</>
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:      '1. Empty Visits log — Log Visit in top-right',
    form:       '2. Pick the property, date, service type, crew, duration',
    predict:    '3. Zach predicts time based on past visits — beat the prediction',
    logged:     '4. Visit lands in the timeline with crew, duration, weather',
    history:    "5. A property's full visit history — customers see it too",
    fieldscout: '6. Crew marks done in Field Scout — visit logs itself',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how the crew logs a visit'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
