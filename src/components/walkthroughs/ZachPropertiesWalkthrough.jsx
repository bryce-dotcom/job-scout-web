// Zach Properties walkthrough — rebuilt to Prospect Scout standard.
// Source: lawn-care Properties page (Zach module).
// Property file: name, address, sqft, mow day, frequency, gate code, dog notes.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, MapPin, Calendar, Ruler, Dog, KeyRound, Edit2, Trash2,
  Calculator, Save, Compass, Clock, Play, ArrowRight, Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/zach-properties.js'

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
            <div key={i} style={{ padding: '6px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, color: T.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: chip.wide ? 200 : 'auto' }}>
              {chip.icon && <chip.icon size={11} style={{ color: T.textMuted }} />}{chip.label}
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

function EmptyState({ icon: Icon, headline, hint, ctaLabel }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 11, padding: 30, textAlign: 'center' }}>
      {Icon && <Icon size={32} style={{ color: T.textMuted, opacity: 0.6 }} />}
      <div style={{ fontSize: 13, color: T.textSecondary, fontWeight: 600 }}>{headline}</div>
      {hint && <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 320 }}>{hint}</div>}
      {ctaLabel && <button style={{ marginTop: 8, padding: '7px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{ctaLabel}</button>}
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

function FormInput({ value, placeholder, focused, typing, cursorEnabled }) {
  return (
    <div style={{ padding: '8px 10px', background: T.bgInput, border: `1.5px solid ${focused ? T.accent : T.border}`, borderRadius: 7, fontSize: 12, color: T.text, minHeight: 14 }}>
      {value || value === 0 ? (
        <>{value}{typing && cursorEnabled && (
          <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
            style={{ display: 'inline-block', width: 1.5, height: 11, backgroundColor: T.accent, marginLeft: 2, transform: 'translateY(2px)' }}
          />
        )}</>
      ) : (
        <span style={{ color: T.textMuted, fontStyle: 'italic' }}>{placeholder}</span>
      )}
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

function FormSubmit({ label }) {
  return (
    <button style={{ width: '100%', padding: '10px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
      <Save size={13} /> {label}
    </button>
  )
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const PROPERTIES = [
  { id: 1, name: 'Smith — Main St',      addr: '6395 W 10400 N · Highland, UT', mowDay: 'Monday',    freq: 'Weekly',    sqft: 6450, dog: true,  gate: '#4791' },
  { id: 2, name: 'Garcia — Mountainview', addr: '1457 N 110 W · Orem, UT',      mowDay: 'Tuesday',   freq: 'Weekly',    sqft: 4200, dog: false, gate: null   },
  { id: 3, name: 'Walker properties',     addr: '212 E Center · Lehi, UT',      mowDay: 'Wednesday', freq: 'Bi-weekly', sqft: 8900, dog: false, gate: '#2210' },
  { id: 4, name: 'Yanni — Spanish Fork',  addr: '788 N 500 E · Spanish Fork',   mowDay: 'Thursday',  freq: 'Weekly',    sqft: 5100, dog: true,  gate: null   },
]

const ADDRESS_TYPED = '6395 W 10400 N, Highland UT 84003'

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ZachPropertiesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Add your first property and watch the file fill itself in." />}
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
  if (scene === 'fieldscout') return <FieldScoutCrewView sceneElapsed={sceneElapsed} />

  const typedLen = scene === 'form'
    ? Math.min(ADDRESS_TYPED.length, Math.floor(sceneElapsed / 55))
    : ADDRESS_TYPED.length
  const typedAddress = ADDRESS_TYPED.slice(0, typedLen)

  const showGrid = scene === 'saved' || scene === 'detail' || scene === 'grid'
  const visibleProps = scene === 'saved' ? [PROPERTIES[0]] : scene === 'detail' ? [PROPERTIES[0]] : PROPERTIES

  return (
    <ZachPageChrome
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 16px', background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 10, textAlign: 'center' }}>
            <MapPin size={24} style={{ color: T.textMuted, opacity: 0.6 }} />
            <div style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600 }}>No properties yet.</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>Add your first lawn — Zach will track visits and treatments against it.</div>
            <button style={{ marginTop: 4, padding: '6px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Add your first property</button>
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, paddingLeft: 2 }}>Preview — what your grid looks like once you add properties:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, opacity: 0.28 }}>
            {PROPERTIES.slice(0, 3).map(p => <PropertyCard key={p.id} property={p} />)}
          </div>
        </div>
      )}

      {showGrid && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, overflow: 'hidden', alignContent: 'start' }}>
          {visibleProps.map((p, i) => (
            <PropertyCard key={p.id} property={p}
              highlight={scene === 'detail' && p.id === 1}
              flashIn={scene === 'saved' && i === 0}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal title="New property" footer={<FormSubmit label="Save Property" />}>
            <Field label="Property name"><FormInput value="Smith — Main St" focused /></Field>
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
            <Field label="Dog notes"><FormInput value="Yes — Rusty (Lab). Friendly, lives in backyard." /></Field>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachPageChrome>
  )
}

function PropertyCard({ property: p, highlight, flashIn }) {
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, x: -10, background: 'rgba(34,197,94,0.3)' } : false}
      animate={{ opacity: 1, x: 0, background: T.bgCard }}
      transition={{ duration: 0.5 }}
      style={{ background: T.bgCard, border: `1.5px solid ${highlight ? T.accent : T.border}`, borderRadius: 10, padding: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div style={{ fontSize: 10, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.addr}</div>
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

function FieldScoutCrewView({ sceneElapsed }) {
  const TODAY_JOBS = [
    { id: 1, name: 'Smith — Main St',      addr: '6395 W 10400 N · Highland', sqft: 6450, prediction: 36 },
    { id: 2, name: 'Garcia — Mountainview', addr: '1457 N 110 W · Orem',      sqft: 4200, prediction: 22 },
    { id: 3, name: 'Walker — Center St',    addr: '212 E Center · Lehi',      sqft: 8900, prediction: 48 },
  ]
  const firstDone  = sceneElapsed > 3500
  const visitToast = sceneElapsed > 4200

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, overflow: 'hidden', display: 'flex', gap: 14 }}>
      <div style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 18px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Compass size={16} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Field Scout</div>
            <div style={{ fontSize: 10, opacity: 0.9 }}>Today · Wednesday May 27 · Crew B</div>
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${T.border}`, background: T.bg, display: 'flex', gap: 12, fontSize: 11, color: T.textMuted }}>
          <div><strong style={{ color: T.text }}>{TODAY_JOBS.length}</strong> jobs today</div>
          <div><strong style={{ color: T.text }}>{TODAY_JOBS.reduce((s, j) => s + j.prediction, 0)} min</strong> predicted</div>
          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={11} style={{ color: T.purple }} /> Powered by Zach
          </div>
        </div>
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
          {TODAY_JOBS.map((j, i) => {
            const isDone = i === 0 && firstDone
            return (
              <motion.div key={j.id}
                animate={isDone ? { background: T.successBg, borderColor: T.success } : { background: T.bgCard, borderColor: T.border }}
                transition={{ duration: 0.4 }}
                style={{ padding: 12, border: `1.5px solid ${T.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: isDone ? T.success : T.accentBg, color: isDone ? '#fff' : T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isDone ? <CheckCircle2 size={16} strokeWidth={2.5} /> : <span style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{j.name} <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>· Mow</span></div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 3 }}>{j.addr}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Chip icon={Ruler}>{j.sqft.toLocaleString()} sqft</Chip>
                    <Chip icon={Clock}>~{j.prediction} min</Chip>
                  </div>
                </div>
                {!isDone ? (
                  i === 0 ? (
                    <motion.button animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
                      style={{ padding: '6px 12px', background: T.accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Play size={11} /> Start
                    </motion.button>
                  ) : (
                    <div style={{ padding: '6px 12px', background: T.bg, color: T.textMuted, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 10 }}>Up next</div>
                  )
                ) : (
                  <div style={{ fontSize: 10, color: T.successDark, fontWeight: 700 }}>Done · 34 min</div>
                )}
              </motion.div>
            )
          })}
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
                <div style={{ fontSize: 10, fontWeight: 700, color: T.successDark, textTransform: 'uppercase' }}>Auto-logged</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Smith — Main St</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>lawn_visits row · Today · Mow · Crew B</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:      '1 · Empty Properties board — Add Property in the top-right',
    form:       '2 · Name, address, sqft, mow day, frequency, gate code, dog notes',
    saved:      '3 · Property card lands in the grid with all its details',
    detail:     '4 · Frequency, sqft, dog flag, gate code visible at a glance',
    grid:       '5 · Full property grid — filter by day, search by name or address',
    fieldscout: '6 · Crew taps the property in Field Scout — visit writes itself',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Properties work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
