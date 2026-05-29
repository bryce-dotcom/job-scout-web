// Communications Log walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Mail, Phone, FileSignature, Search, Eye, MousePointer,
  CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/communications-log.js'

const COMMS = [
  { id: 1, channel: 'email', dir: 'out', subject: 'Estimate #EST-247 — Sarah Chen', meta: 'opens: 3 · clicks: 1',  when: 'May 28 · 10:14 AM', icon: Mail },
  { id: 2, channel: 'sms',   dir: 'out', subject: 'Reminder: site visit tomorrow at 2pm', meta: 'delivered',         when: 'May 27 · 02:30 PM', icon: MessageSquare },
  { id: 3, channel: 'portal',dir: 'in',  subject: 'Signed Estimate #EST-247',           meta: 'IP captured · audit logged', when: 'May 28 · 03:47 PM', icon: FileSignature },
  { id: 4, channel: 'email', dir: 'in',  subject: 'Reply: invoice question',             meta: 'auto-threaded to INV-2014',  when: 'May 28 · 04:02 PM', icon: Mail },
]

export default function CommunicationsLogWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="No more 'what did we tell them last week?'" />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  const SEARCH_TYPED = 'invoice'
  const typedSearch = scene === 'search' ? SEARCH_TYPED.slice(0, Math.min(SEARCH_TYPED.length, Math.floor(sceneElapsed / 90))) : ''

  const visible = scene === 'customer' ? COMMS.slice(0, 2)
    : scene === 'email' ? [COMMS[0]]
    : scene === 'sms' ? [COMMS[1]]
    : scene === 'reply' ? COMMS.slice(2, 4)
    : scene === 'search' ? COMMS.filter(c => c.subject.toLowerCase().includes(typedSearch.toLowerCase()) || c.meta.toLowerCase().includes(typedSearch.toLowerCase()))
    : COMMS

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>Communications</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>Every email, SMS, signature, and reply in one timeline</p>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ background: T.bgCard, border: `1.5px solid ${scene === 'search' ? T.accent : T.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Search size={14} style={{ color: T.textMuted }} />
        {scene === 'search' && typedSearch.length > 0 ? (
          <div style={{ flex: 1, fontSize: 12, color: T.text }}>
            {typedSearch}
            {typedSearch.length < SEARCH_TYPED.length && (
              <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ display: 'inline-block', width: 1.5, height: 11, background: T.accent, marginLeft: 2, transform: 'translateY(2px)' }} />
            )}
          </div>
        ) : (
          <div style={{ flex: 1, fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>Search all communications</div>
        )}
        <Chip>Sarah Chen</Chip>
      </div>

      {/* Comms list */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((c, i) => (
          <CommCard key={c.id} comm={c} flashIn={i === 0 && (scene === 'reply' || scene === 'search')} highlight={scene === 'email' && c.id === 1} />
        ))}
      </div>
    </div>
  )
}

function CommCard({ comm: c, flashIn, highlight }) {
  const Icon = c.icon
  const dirColor = c.dir === 'in' ? T.purple : T.accent
  const dirBg = c.dir === 'in' ? T.purpleBg : T.accentBg

  return (
    <motion.div
      initial={flashIn ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0, borderColor: highlight ? T.accent : T.border }}
      transition={{ duration: 0.4 }}
      style={{ display: 'grid', gridTemplateColumns: '36px 1fr 100px 60px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}
    >
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: dirBg, color: dirColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={13} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {c.dir === 'out' && c.channel === 'email' && (
            <>
              <Eye size={9} style={{ color: T.success }} /> {c.meta.split(' · ')[0]?.replace('opens: ', '')} opens
              <MousePointer size={9} style={{ color: T.success, marginLeft: 4 }} /> {c.meta.split(' · ')[1]?.replace('clicks: ', '')} clicks
            </>
          )}
          {c.dir === 'out' && c.channel === 'sms' && (
            <><CheckCircle2 size={9} style={{ color: T.success }} /> delivered</>
          )}
          {c.dir === 'in' && (
            <span>{c.meta}</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10, color: T.textMuted }}>{c.when}</div>
      <div style={{ padding: '3px 7px', background: dirBg, color: dirColor, borderRadius: 99, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
        {c.dir === 'in' ? 'IN' : 'OUT'}
      </div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    customer: '1. Customer detail → Comms tab — every exchange in one place',
    email:    '2. Each email shows sent, opened, clicked timestamps',
    sms:      '3. Outbound SMS reminders + confirmations in the same feed',
    reply:    '4. Customer replies threaded to the original invoice or quote',
    search:   "5. Full-text search across every email and message",
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Almost no setup'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
