// Leads walkthrough — the single intake.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, UserPlus, Phone, Mail, MapPin, Tag, UserCheck, GitBranch,
  ArrowRight, Sparkles,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import {
  T, ZachShell, EmptyState, FormModal, Field, FormInput, FieldRow, Chip, FormSubmit,
} from './zach/ZachShell'
import card from '../../lib/featureKnowledge/leads.js'

const TYPED_NAME = 'Marcus Reeves'

export default function LeadsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your lead funnel is wired up." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  const typedName = scene === 'form' ? TYPED_NAME.slice(0, Math.min(TYPED_NAME.length, Math.floor(sceneElapsed / 55))) : TYPED_NAME

  return (
    <ZachShell
      title="Leads"
      subtitle="The single intake for every potential customer."
      actionLabel="Add Lead"
      actionIcon={Plus}
      actionHighlight={scene === 'empty'}
      filterChips={[{ icon: Tag, label: 'All sources' }, { icon: UserCheck, label: 'All owners' }]}
    >
      {scene === 'empty' && <EmptyState icon={UserPlus} headline="No leads yet." hint="Add a lead manually or let Prospect Scout and your public quote forms feed them in." />}

      {scene === 'card' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          <LeadCard lead={{ name: TYPED_NAME, biz: 'Cypress Logistics', phone: '(801) 555-0118', source: 'Web', owner: 'Doug', attempts: 0, status: 'New' }} flashIn />
        </div>
      )}

      {scene === 'detail' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, overflow: 'hidden' }}>
          <LeadCard lead={{ name: TYPED_NAME, biz: 'Cypress Logistics', phone: '(801) 555-0118', source: 'Web', owner: 'Doug', attempts: 2, status: 'Contacted' }} expanded />
          <ContactLog />
        </div>
      )}

      {scene === 'convert' && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <LeadCard lead={{ name: TYPED_NAME, biz: 'Cypress Logistics', phone: '(801) 555-0118', source: 'Web', owner: 'Doug', attempts: 3, status: 'Qualified' }} compact />
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <ArrowRight size={32} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14, minWidth: 220, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>NEW CUSTOMER</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{TYPED_NAME}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>Cypress Logistics</div>
            <Chip color={T.successDark} bg={T.successBg}>Converted from lead</Chip>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal title="New lead" footer={<FormSubmit label="Save Lead" />}>
            <Field label="Name">
              <FormInput value={typedName} placeholder="Lead name" focused typing cursorEnabled={typedName.length < TYPED_NAME.length} />
            </Field>
            <FieldRow>
              <Field label="Phone"><FormInput value="(801) 555-0118" /></Field>
              <Field label="Email"><FormInput value="marcus@cypress.com" /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Source"><FormInput value="Web form" /></Field>
              <Field label="Owner"><FormInput value="Doug Anderson" /></Field>
            </FieldRow>
          </FormModal>
        )}
      </AnimatePresence>
    </ZachShell>
  )
}

function LeadCard({ lead, flashIn, expanded, compact }) {
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, x: -10, background: 'rgba(34,197,94,0.25)' } : false}
      animate={{ opacity: 1, x: 0, background: T.bgCard }}
      transition={{ duration: 0.5 }}
      style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: compact ? 10 : 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.purpleBg, color: T.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
          {lead.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{lead.name}</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>{lead.biz}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
        <Chip icon={Phone}>{lead.phone}</Chip>
        <Chip>{lead.status}</Chip>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Chip icon={Tag}>{lead.source}</Chip>
        <Chip icon={UserCheck}>{lead.owner}</Chip>
        {lead.attempts > 0 && <Chip>{lead.attempts} attempts</Chip>}
      </div>
      {expanded && (
        <button style={{ marginTop: 10, width: '100%', padding: '8px 12px', background: T.success, color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <GitBranch size={12} /> Convert to customer
        </button>
      )}
    </motion.div>
  )
}

function ContactLog() {
  const events = [
    { when: 'May 27 · 10:14 AM', what: 'Phone — voicemail', icon: Phone },
    { when: 'May 27 · 02:30 PM', what: 'Email sent — intro packet', icon: Mail },
    { when: 'May 28 · 09:08 AM', what: 'Phone — connected, scheduled site visit', icon: Phone },
  ]
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 11, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>Contact attempts</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.map((e, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.18 }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: T.bg, borderRadius: 6, fontSize: 11 }}>
            <e.icon size={12} style={{ color: T.accent }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontWeight: 500 }}>{e.what}</div>
              <div style={{ color: T.textMuted, fontSize: 10 }}>{e.when}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:   '1. Empty lead list — Add Lead in top-right',
    form:    '2. Name, phone, email, source, owner',
    card:    '3. New lead lands with owner + source stamped on',
    detail:  '4. Contact attempts logged — voicemail, email, callback',
    convert: '5. Convert when ready — customer record auto-created',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to capture leads'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
