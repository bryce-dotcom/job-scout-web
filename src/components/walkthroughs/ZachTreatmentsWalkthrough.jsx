// Zach Treatments walkthrough — rebuilt to Prospect Scout standard.
// Source: lawn-care Treatments page (Zach module).
// Seasonal application schedule: pre-emergent, fertilizer, weed, grub, aeration.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Sprout, Calendar, CheckCircle2, Circle, SkipForward, Save,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/zach-treatments.js'

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
        <div style={{ marginBottom: 14 }}>
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
    <div style={{ padding: '8px 10px', background: T.bgInput, border: `1.5px solid ${focused ? T.accent : T.border}`, borderRadius: 7, fontSize: 12, color: T.text }}>
      {value ? value : <span style={{ color: T.textMuted, fontStyle: 'italic' }}>{placeholder}</span>}
    </div>
  )
}

function FieldRow({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>
}

function Chip({ children, color = T.accent, bg = T.accentBg }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: bg, color, fontSize: 10, fontWeight: 600 }}>
      {children}
    </span>
  )
}

function ListCard({ children }) {
  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      {children}
    </div>
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

const TREATMENTS_SCHEDULED = [
  { id: 1, prop: 'Smith — Main St', round: 2, type: 'Fertilizer', product: 'Lesco 24-0-11', sched: '2026-05-30', status: 'scheduled', amount: '12 lbs' },
]
const TREATMENTS_FULL = [
  { id: 1, prop: 'Smith — Main St', round: 1, type: 'Pre-emergent', product: 'Dimension 2EW',   sched: '2026-03-15', done: '2026-03-15', status: 'completed', amount: '8 oz'  },
  { id: 2, prop: 'Smith — Main St', round: 2, type: 'Fertilizer',   product: 'Lesco 24-0-11',  sched: '2026-05-30', done: '2026-05-30', status: 'completed', amount: '12 lbs'},
  { id: 3, prop: 'Smith — Main St', round: 3, type: 'Weed control', product: 'Trimec Classic', sched: '2026-07-12', status: 'scheduled', amount: '6 oz'  },
  { id: 4, prop: 'Smith — Main St', round: 4, type: 'Grub control', product: 'GrubEx',         sched: '2026-08-04', status: 'scheduled', amount: '4 lbs' },
  { id: 5, prop: 'Smith — Main St', round: 5, type: 'Fertilizer',   product: 'Lesco 24-0-11',  sched: '2026-09-08', status: 'scheduled', amount: '12 lbs'},
  { id: 6, prop: 'Smith — Main St', round: 6, type: 'Aeration',     product: '',               sched: '2026-10-15', status: 'scheduled', amount: ''     },
]

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ZachTreatmentsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Schedule your rounds. Mark them done as you go." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ────────────────────────────────────────────────────────────────────

function Stage({ scene }) {
  const visible = scene === 'scheduled'
    ? TREATMENTS_SCHEDULED
    : scene === 'done'
      ? TREATMENTS_SCHEDULED.map(t => ({ ...t, status: 'completed', done: '2026-05-30' }))
      : scene === 'program'
        ? TREATMENTS_FULL
        : []

  return (
    <ZachPageChrome
      title="Treatments"
      subtitle="Seasonal applications — fert, weed, grub, aeration, overseed."
      actionLabel="Schedule Treatment"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[
        { icon: Calendar, label: 'All statuses' },
        { icon: Sprout,   label: 'All properties' },
      ]}
    >
      {scene === 'empty' && (
        <EmptyState icon={Sprout} headline="No treatments scheduled yet."
          hint="Schedule rounds at the start of the season — Zach tracks completion." />
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
              <Field label="Completed"><FormInput placeholder="when done" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Amount"><FormInput value="12" /></Field>
              <Field label="Unit"><FormInput value="lbs" /></Field>
            </FieldRow>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachPageChrome>
  )
}

function TreatmentCard({ t, flashDone }) {
  const StatusIcon  = t.status === 'completed' ? CheckCircle2 : t.status === 'skipped' ? SkipForward : Circle
  const statusColor = t.status === 'completed' ? T.success : t.status === 'skipped' ? T.textMuted : T.warning
  const statusBg    = t.status === 'completed' ? T.successBg : t.status === 'skipped' ? 'rgba(125,138,127,0.10)' : T.warningBg

  return (
    <motion.div animate={flashDone ? { background: ['rgba(34,197,94,0.3)', T.bgCard] } : {}} transition={{ duration: 0.8 }}>
      <ListCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12, color: T.text }}>{t.prop}</strong>
          {t.round != null && <Chip>Round {t.round}</Chip>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, background: statusBg, color: statusColor, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
            <StatusIcon size={9} /> {t.status}
          </span>
          {t.status === 'scheduled' && (
            <button style={{ marginLeft: 'auto', padding: '3px 8px', background: T.success, color: '#fff', border: 'none', borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>
              Mark done
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.text, marginBottom: 3 }}>
          <strong>{t.type}</strong>{t.product && <span style={{ color: T.textSecondary }}> — {t.product}</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: T.textSecondary }}>
          {t.sched && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Calendar size={10} /> Sched: {t.sched}</span>}
          {t.done  && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.successDark }}><CheckCircle2 size={10} /> Done: {t.done}</span>}
          {t.amount && <span>{t.amount}</span>}
        </div>
      </ListCard>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:     '1 · Empty schedule — Schedule Treatment in the top-right',
    form:      '2 · Treatment type, round #, product name, scheduled date, amount',
    scheduled: '3 · Round shows up with a scheduled badge — ready for the crew',
    done:      "4 · Mark done flips it to completed with today's date",
    program:   '5 · Full 6-round annual program — pre-emergent through aeration',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Treatments work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
