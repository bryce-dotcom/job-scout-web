// Customers walkthrough — the customer hub.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Users, User, Mail, Phone, MapPin, CreditCard, Globe, Briefcase,
  DollarSign, Edit2, Trash2, Send,
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
import card from '../../lib/featureKnowledge/customers.js'

const NAME_TYPED = 'Sarah Chen'
const EMAIL_TYPED = 'sarah@northbridge.com'

const CUSTOMERS = [
  { id: 1, name: 'Sarah Chen',     biz: 'Northbridge Industries', phone: '(801) 555-0142', city: 'Highland UT',   jobs: 7, totalPaid: 4280 },
  { id: 2, name: 'Marcus Reeves',  biz: 'Cypress Logistics',      phone: '(801) 555-0118', city: 'Lehi UT',      jobs: 3, totalPaid: 1640 },
  { id: 3, name: 'Priya Anand',    biz: 'Solera Manufacturing',   phone: '(801) 555-0203', city: 'Orem UT',      jobs: 12, totalPaid: 9180 },
  { id: 4, name: 'David Okafor',   biz: 'Granite Foods',          phone: '(801) 555-0455', city: 'Provo UT',     jobs: 5, totalPaid: 3520 },
]

export default function CustomersWalkthrough() {
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
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="Your customer hub is ready. Add your first contact." />
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
  const typedName = scene === 'form' ? NAME_TYPED.slice(0, Math.min(NAME_TYPED.length, Math.floor(sceneElapsed / 55))) : NAME_TYPED
  const typedEmail = scene === 'form' && sceneElapsed > 1700 ? EMAIL_TYPED.slice(0, Math.min(EMAIL_TYPED.length, Math.floor((sceneElapsed - 1700) / 55))) : ''

  const visible = scene === 'card' ? [CUSTOMERS[0]]
    : scene === 'detail' ? [CUSTOMERS[0]]
    : scene === 'portal' ? [CUSTOMERS[0]]
    : []

  return (
    <ZachShell
      title="Customers"
      subtitle="Every customer file — contact, payments, jobs, statements."
      actionLabel="Add Customer"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[{ icon: Users, label: 'All customers' }]}
    >
      {scene === 'empty' && <EmptyState icon={Users} headline="No customers yet." hint="Add your first customer — Job Scout tracks every job and invoice against it." />}

      {visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, overflow: 'hidden' }}>
          {visible.map((c, i) => (
            <CustomerCard key={c.id} customer={c} highlight={scene === 'detail' || scene === 'portal'} flashIn={scene === 'card' && i === 0} expanded={scene === 'detail' || scene === 'portal'} showPortal={scene === 'portal'} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal title="New customer" footer={<FormSubmit label="Save Customer" />}>
            <Field label="Name">
              <FormInput value={typedName} placeholder="Customer name" focused typing cursorEnabled={typedName.length < NAME_TYPED.length} />
            </Field>
            <Field label="Business name">
              <FormInput value="Northbridge Industries" />
            </Field>
            <FieldRow>
              <Field label="Phone"><FormInput value="(801) 555-0142" /></Field>
              <Field label="Email"><FormInput value={typedEmail} placeholder="email@example.com" focused={sceneElapsed > 1700} typing cursorEnabled={sceneElapsed > 1700 && typedEmail.length < EMAIL_TYPED.length} /></Field>
            </FieldRow>
            <Field label="Billing address">
              <FormInput value="6395 W 10400 N, Highland UT 84003" />
            </Field>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachShell>
  )
}

function CustomerCard({ customer: c, highlight, flashIn, expanded, showPortal }) {
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, x: -10, background: 'rgba(34,197,94,0.25)' } : false}
      animate={{ opacity: 1, x: 0, background: T.bgCard }}
      transition={{ duration: 0.5 }}
      style={{
        background: T.bgCard,
        border: `1.5px solid ${highlight ? T.accent : T.border}`,
        borderRadius: 11,
        padding: 12,
        gridColumn: expanded ? 'span 2' : 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
          {c.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.name}</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>{c.biz}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        <Chip icon={Phone}>{c.phone}</Chip>
        <Chip icon={MapPin}>{c.city}</Chip>
      </div>
      {expanded && (
        <>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Chip icon={Briefcase}>{c.jobs} jobs</Chip>
            <Chip icon={DollarSign} color={T.successDark} bg={T.successBg}>${c.totalPaid.toLocaleString()} paid</Chip>
            <Chip icon={CreditCard}>Visa •• 4242 saved</Chip>
          </div>
          {showPortal && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{ marginTop: 8, padding: 10, background: T.purpleBg, border: `1px solid ${T.purple}`, borderRadius: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Globe size={12} style={{ color: T.purple }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: T.purple, textTransform: 'uppercase' }}>Portal magic link</div>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: T.text, marginBottom: 4 }}>
                job-scout.app/portal/k3xR9...
              </div>
              <button style={{ padding: '4px 8px', background: T.accent, color: '#fff', border: 'none', borderRadius: 5, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Send size={10} /> Send by email
              </button>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:  '1. Empty customer list — Add Customer in top-right',
    form:   '2. Fill name, business, phone, email, billing address',
    card:   '3. Customer card lands in the grid',
    detail: '4. Open one — jobs, invoices, payments, cards on file',
    portal: '5. Send a magic-link portal — no password needed',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to set it up'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
