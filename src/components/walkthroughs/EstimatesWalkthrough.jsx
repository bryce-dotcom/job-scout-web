// Estimates & Quotes walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Plus, Package, Camera, Send, Briefcase, CheckCircle2,
  Image, Trash2, DollarSign,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, EmptyState, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/estimates.js'

const LINES = [
  { id: 1, name: 'Site preparation',        qty: 1, price: 450, photo: false },
  { id: 2, name: 'LED retrofit · 40 fixt.', qty: 40, price: 86, photo: true },
  { id: 3, name: 'Installation labor',      qty: 8, price: 95, photo: false },
]
const TOTAL = LINES.reduce((s, l) => s + l.qty * l.price, 0)
const TAX = Math.round(TOTAL * 0.0725)
const GRAND = TOTAL + TAX

export default function EstimatesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Quote → signature → job. One flow." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  if (scene === 'empty') {
    return (
      <ZachShell title="Estimates" subtitle="Build a quote, send it, customer signs from their phone." actionLabel="New Estimate" actionIcon={Plus} actionHighlight>
        <EmptyState icon={FileText} headline="No estimates yet." hint="Build one for a customer or lead. Send via portal; they sign from their phone." />
      </ZachShell>
    )
  }

  if (scene === 'won') {
    return (
      <div style={{ position: 'absolute', inset: 0, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: T.bg }}>
        <motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.4 }} style={{ width: 64, height: 64, borderRadius: '50%', background: T.success, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(34,197,94,0.4)' }}>
          <CheckCircle2 size={36} color="#fff" strokeWidth={2.5} />
        </motion.div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Signed!</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{`$${GRAND.toLocaleString()} · Sarah Chen · 3:47 PM`}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <CheckChip icon={Briefcase} text="Job auto-created" />
          <CheckChip icon={DollarSign} text="Pipeline → Won" />
          <CheckChip icon={CheckCircle2} text="Setter $25 stamped" />
        </div>
      </div>
    )
  }

  // lines + photos + send all render the quote builder
  const showPhotoUploaded = scene === 'photos'
  const showSendModal = scene === 'send'

  return (
    <ZachShell title="Estimate #EST-247" subtitle="For Sarah Chen · Northbridge Industries" actionLabel="Send" actionIcon={Send} actionHighlight={scene === 'send'}>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 11, padding: 12, flex: 1, overflow: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Line items</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {LINES.map((l, i) => (
            <motion.div
              key={l.id}
              initial={scene === 'lines' ? { opacity: 0, x: -8 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: scene === 'lines' ? i * 0.25 : 0, duration: 0.35 }}
              style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 80px 80px 24px', gap: 8, alignItems: 'center', padding: '6px 8px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7 }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 5, background: l.photo && (showPhotoUploaded || scene === 'send') ? T.successBg : T.accentBg, color: l.photo && (showPhotoUploaded || scene === 'send') ? T.successDark : T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {l.photo && (showPhotoUploaded || scene === 'send') ? <Image size={13} /> : <Package size={13} />}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{l.name}</div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>×{l.qty}</div>
              <div style={{ fontSize: 11, color: T.textSecondary, textAlign: 'right' }}>${l.price}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, textAlign: 'right' }}>${(l.qty * l.price).toLocaleString()}</div>
              <Trash2 size={11} style={{ color: T.textMuted }} />
            </motion.div>
          ))}
        </div>
        {scene === 'photos' && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ marginTop: 10, padding: 8, background: T.successBg, border: `1px solid ${T.success}`, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.successDark }}>
            <Camera size={13} /> Photo attached to "LED retrofit · 40 fixt." — proof of what they're buying
          </motion.div>
        )}
        {/* Totals */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, alignItems: 'flex-end' }}>
          <div style={{ color: T.textSecondary }}>Subtotal: <strong style={{ color: T.text }}>${TOTAL.toLocaleString()}</strong></div>
          <div style={{ color: T.textSecondary }}>Tax (7.25%): <strong style={{ color: T.text }}>${TAX}</strong></div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>Total: ${GRAND.toLocaleString()}</div>
        </div>
      </div>

      <AnimatePresence>
        {showSendModal && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3 }} style={{ position: 'absolute', bottom: 50, left: 18, right: 18, padding: 12, background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 10, boxShadow: '0 6px 18px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 4 }}>Portal link sent to sarah@northbridge.com</div>
            <div style={{ fontSize: 11, color: T.textMuted, fontFamily: 'monospace' }}>job-scout.app/portal/k3xR9...</div>
            <div style={{ marginTop: 6, fontSize: 11, color: T.textSecondary }}>Customer signs on their phone — every field stamped: IP, user agent, timestamp.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </ZachShell>
  )
}

function CheckChip({ icon: Icon, text }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: T.successBg, border: `1px solid ${T.success}`, borderRadius: 99, fontSize: 11, color: T.successDark, fontWeight: 600 }}>
      <Icon size={11} /> {text}
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:  '1. Empty estimates — New Estimate in top-right',
    lines:  '2. Add lines from your catalog or type them in',
    photos: '3. Photo any line — proof of what they\'re buying',
    send:   '4. Send the portal link — they sign from their phone',
    won:    '5. Signature lands → job auto-creates, pipeline flips to Won',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to send your first quote'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
