// Zach Treatments walkthrough — seasonal application schedule.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Sprout, Calendar, CheckCircle2, Circle, SkipForward,
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
import card from '../../lib/featureKnowledge/zach-treatments.js'

const TREATMENTS_SCHEDULED = [
  { id: 1, prop: 'Smith — Main St', round: 2, type: 'Fertilizer',  product: 'Lesco 24-0-11',   sched: '2026-05-30', status: 'scheduled', amount: '12 lbs' },
]
const TREATMENTS_FULL = [
  { id: 1, prop: 'Smith — Main St', round: 1, type: 'Pre-emergent', product: 'Dimension 2EW',   sched: '2026-03-15', done: '2026-03-15', status: 'completed', amount: '8 oz' },
  { id: 2, prop: 'Smith — Main St', round: 2, type: 'Fertilizer',   product: 'Lesco 24-0-11',  sched: '2026-05-30', done: '2026-05-30', status: 'completed', amount: '12 lbs' },
  { id: 3, prop: 'Smith — Main St', round: 3, type: 'Weed control', product: 'Trimec Classic', sched: '2026-07-12', status: 'scheduled', amount: '6 oz' },
  { id: 4, prop: 'Smith — Main St', round: 4, type: 'Grub control', product: 'GrubEx',         sched: '2026-08-04', status: 'scheduled', amount: '4 lbs' },
  { id: 5, prop: 'Smith — Main St', round: 5, type: 'Fertilizer',   product: 'Lesco 24-0-11',  sched: '2026-09-08', status: 'scheduled', amount: '12 lbs' },
  { id: 6, prop: 'Smith — Main St', round: 6, type: 'Aeration',     product: '',               sched: '2026-10-15', status: 'scheduled', amount: '' },
]

export default function ZachTreatmentsWalkthrough() {
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
        {phase === 'marketing' && <Stage scene={sceneKey} />}

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
            <DonePanel key="done" onReplay={replay} subtitle="Schedule your rounds. Mark them done as you go." />
          )}
        </AnimatePresence>
      </div>

      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const visible = scene === 'scheduled' ? TREATMENTS_SCHEDULED
    : scene === 'done' ? TREATMENTS_SCHEDULED.map(t => ({ ...t, status: 'completed', done: '2026-05-30' }))
    : scene === 'program' ? TREATMENTS_FULL
    : []

  return (
    <ZachShell
      title="Treatments"
      subtitle="Seasonal applications — fert, weed, grub, aeration, overseed."
      actionLabel="Schedule Treatment"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[
        { icon: Calendar, label: 'All statuses' },
        { icon: Sprout, label: 'All properties' },
      ]}
    >
      {scene === 'empty' && (
        <EmptyState
          icon={Sprout}
          headline="No treatments scheduled yet."
          hint="Schedule rounds at the start of the season — Zach tracks completion."
        />
      )}

      {visible.length > 0 && (
        <div style={{ overflow: 'hidden' }}>
          {visible.map(t => (
            <TreatmentCard key={t.id} t={t} flashDone={scene === 'done' && t.status === 'completed'} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal title="Schedule treatment" footer={<FormSubmit label="Save Treatment" />}>
            <Field label="Property"><FormInput value="Smith — Main St" focused /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <Field label="Treatment type"><FormInput value="Fertilizer" /></Field>
              <Field label="Round #"><FormInput value="2" /></Field>
              <Field label="Status"><FormInput value="scheduled" /></Field>
            </div>
            <Field label="Product name"><FormInput value="Lesco 24-0-11" /></Field>
            <FieldRow>
              <Field label="Scheduled"><FormInput value="2026-05-30" /></Field>
              <Field label="Completed"><FormInput value="" placeholder="when done" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Amount"><FormInput value="12" /></Field>
              <Field label="Unit"><FormInput value="lbs" /></Field>
            </FieldRow>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachShell>
  )
}

function TreatmentCard({ t, flashDone }) {
  const StatusIcon = t.status === 'completed' ? CheckCircle2 : t.status === 'skipped' ? SkipForward : Circle
  const statusColor = t.status === 'completed' ? T.success : t.status === 'skipped' ? T.textMuted : T.warning
  const statusBg    = t.status === 'completed' ? T.successBg : t.status === 'skipped' ? 'rgba(125,138,127,0.10)' : T.warningBg

  return (
    <motion.div
      animate={flashDone ? { background: ['rgba(34,197,94,0.3)', T.bgCard] } : {}}
      transition={{ duration: 0.8 }}
    >
      <ListCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12, color: T.text }}>{t.prop}</strong>
          {t.round != null && <Chip>Round {t.round}</Chip>}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 99,
            background: statusBg, color: statusColor,
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          }}>
            <StatusIcon size={9} /> {t.status}
          </span>
          {t.status === 'scheduled' && (
            <button style={{
              marginLeft: 'auto',
              padding: '3px 8px',
              background: T.success,
              color: '#fff',
              border: 'none',
              borderRadius: 5,
              fontSize: 9, fontWeight: 600,
              cursor: 'pointer',
            }}>
              Mark done
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.text, marginBottom: 3 }}>
          <strong>{t.type}</strong>{t.product && <span style={{ color: T.textSecondary }}> — {t.product}</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: T.textSecondary }}>
          {t.sched && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Calendar size={10} /> Sched: {t.sched}</span>}
          {t.done && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.successDark }}><CheckCircle2 size={10} /> Done: {t.done}</span>}
          {t.amount && <span>{t.amount}</span>}
        </div>
      </ListCard>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:    '1. Empty schedule — Schedule Treatment in top-right',
    form:     '2. Pick treatment type, round #, product, scheduled date',
    scheduled:'3. Round shows up on the calendar with a scheduled badge',
    done:     '4. Mark done flips it to completed with today\'s date',
    program:  "5. Full 6-round annual program in one feed for state reporting",
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to plan a season'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
