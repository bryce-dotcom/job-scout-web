// Zach Properties walkthrough — renders the Properties page mock.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, MapPin, Calendar, Ruler, Dog, KeyRound, Edit2, Trash2,
  Calculator, User, Save,
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
  Chip, FormSubmit,
} from './zach/ZachShell'
import card from '../../lib/featureKnowledge/zach-properties.js'

// Mock properties used in scenes 4–5.
const PROPERTIES = [
  { id: 1, name: 'Smith — Main St',     addr: '6395 W 10400 N · Highland, UT', mowDay: 'Monday',    freq: 'Weekly',   sqft: 6450, dog: true,  gate: '#4791' },
  { id: 2, name: 'Garcia — Mountainview',addr: '1457 N 110 W · Orem, UT',      mowDay: 'Tuesday',   freq: 'Weekly',   sqft: 4200, dog: false, gate: null },
  { id: 3, name: 'Walker properties',    addr: '212 E Center · Lehi, UT',     mowDay: 'Wednesday', freq: 'Bi-weekly',sqft: 8900, dog: false, gate: '#2210' },
  { id: 4, name: 'Yanni — Spanish Fork', addr: '788 N 500 E · Spanish Fork',  mowDay: 'Thursday',  freq: 'Weekly',   sqft: 5100, dog: true,  gate: null },
]

const ADDRESS_TYPED = '6395 W 10400 N, Highland UT 84003'

export default function ZachPropertiesWalkthrough() {
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
            <DonePanel key="done" onReplay={replay} subtitle="Add your first property and watch the file fill itself in." />
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
  // form scene: typewriter address
  const typedLen = scene === 'form'
    ? Math.min(ADDRESS_TYPED.length, Math.floor(sceneElapsed / 55))
    : ADDRESS_TYPED.length
  const typedAddress = ADDRESS_TYPED.slice(0, typedLen)

  // Which properties to show in the grid
  const showGrid = scene === 'saved' || scene === 'detail' || scene === 'grid'
  const visibleProps = scene === 'saved'
    ? [PROPERTIES[0]]
    : scene === 'detail'
      ? [PROPERTIES[0]]
      : PROPERTIES
  const detailProp = scene === 'detail' ? PROPERTIES[0] : null

  return (
    <ZachShell
      title="Properties"
      subtitle="The lawn-care file on every property you maintain."
      actionLabel="Add Property"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[
        { icon: Search, label: 'Search by name, address, city', wide: true },
        { icon: Calendar, label: 'All days' },
      ]}
    >
      {scene === 'empty' && (
        <EmptyState
          icon={MapPin}
          headline="No properties yet."
          hint="Add your first lawn — Zach will start tracking visits and treatments against it."
          ctaLabel="Add your first property"
        />
      )}

      {showGrid && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
          overflow: 'hidden',
          alignContent: 'start',
        }}>
          {visibleProps.map((p, i) => (
            <PropertyCard key={p.id} property={p} highlight={scene === 'detail' && p.id === detailProp?.id} flashIn={scene === 'saved' && i === 0} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal
            title="New property"
            footer={<FormSubmit label="Save Property" />}
          >
            <Field label="Property name">
              <FormInput value="Smith — Main St" focused />
            </Field>
            <Field label="Address">
              <FormInput value={typedAddress} placeholder="Start typing the address…" focused typing cursorEnabled={typedLen < ADDRESS_TYPED.length} />
            </Field>
            <FieldRow>
              <Field label="Turf sqft"><FormInput value="6,450" /></Field>
              <Field label="Mow day"><FormInput value="Monday" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Frequency"><FormInput value="Weekly" /></Field>
              <Field label="Gate code"><FormInput value="#4791" /></Field>
            </FieldRow>
            <Field label="Dog notes">
              <FormInput value="Yes — Rusty (Lab). Friendly, lives in backyard." />
            </Field>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachShell>
  )
}

function PropertyCard({ property: p, highlight, flashIn }) {
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, x: -10, background: 'rgba(34,197,94,0.3)' } : false}
      animate={{ opacity: 1, x: 0, background: T.bgCard }}
      transition={{ duration: 0.5 }}
      style={{
        background: T.bgCard,
        border: `1.5px solid ${highlight ? T.accent : T.border}`,
        borderRadius: 10,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.addr}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <div style={{ padding: 3, border: `1px solid ${T.accent}`, color: T.accent, background: T.accentBg, borderRadius: 4 }}><Calculator size={10} /></div>
          <div style={{ padding: 3, border: `1px solid ${T.border}`, color: T.textMuted, borderRadius: 4 }}><Edit2 size={10} /></div>
          <div style={{ padding: 3, border: `1px solid ${T.border}`, color: T.danger, borderRadius: 4 }}><Trash2 size={10} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
        <Chip icon={Calendar}>{p.freq} · {p.mowDay}</Chip>
        <Chip icon={Ruler}>{p.sqft.toLocaleString()} sqft</Chip>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {p.dog && <Chip icon={Dog} color={T.danger} bg="rgba(239,68,68,0.10)">Dog</Chip>}
        {p.gate && <Chip icon={KeyRound}>Gate: {p.gate}</Chip>}
      </div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:  '1. Empty Properties board — Add Property in top-right',
    form:   '2. Fill in name, address, lot details, gate code, dog notes',
    saved:  '3. Property card lands in the grid',
    detail: '4. Key details visible on the card — frequency, sqft, dog, gate',
    grid:   '5. Full grid of properties · filter and search',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to set it up'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
