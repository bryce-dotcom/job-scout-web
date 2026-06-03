// Commissions walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, DollarSign, CheckCircle2, FileSignature, CircleDollarSign,
  User, ArrowRight, Clock,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/commissions.js'

export default function CommissionsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro, elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist"><SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} /></CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Pending → earned → paid · no spreadsheet, no surprises." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <ZachShell title="Commissions · Marcus & Cole" subtitle="Setter · sales rep · lead source" actionLabel="Approve Cycle" actionIcon={Trophy}>
      {scene === 'set' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, flexDirection: 'column' }}>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 10, padding: 16, maxWidth: 380, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Trophy size={18} style={{ color: T.accent }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Marcus set an appointment</div>
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>Lead: Sarah Chen · Northbridge · LED retrofit</div>
            <div style={{ padding: 12, background: T.warningBg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} style={{ color: T.warning }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.warning, textTransform: 'uppercase' }}>Pending</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>Setter rate · $25 / appointment</div>
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.warning }}>+$25</div>
            </div>
          </motion.div>
        </div>
      )}

      {scene === 'quote' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.warning}`, borderRadius: 9, padding: 12, maxWidth: 180 }}>
            <Chip color={T.warning} bg={T.warningBg}>Pending · $25</Chip>
            <div style={{ marginTop: 8, fontSize: 11, color: T.text }}>Waiting on quote-created</div>
          </motion.div>
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
            <FileSignature size={28} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 9, padding: 12, maxWidth: 200 }}>
            <Chip color={T.successDark} bg={T.successBg}>Earned · $25</Chip>
            <div style={{ marginTop: 8, fontSize: 11, color: T.text }}>Quote sent · rule fired</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>Marcus locks in his commission</div>
          </motion.div>
        </div>
      )}

      {scene === 'won' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Deal won · $28,400 · 38% gross profit</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { role: 'Setter',        person: 'Marcus',    base: 'Quote created',     amount: 25,    color: T.warning,     icon: User },
              { role: 'Sales rep',     person: 'Cole',      base: '8% gross profit',   amount: 320,   color: T.successDark, icon: Trophy },
              { role: 'Lead source',   person: 'Yelp',      base: '$25 / first invoice',amount: 25,   color: T.purple,      icon: DollarSign },
            ].map((row, i) => (
              <motion.div key={row.role} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', gap: 10, padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 11, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: row.color + '20', color: row.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <row.icon size={14} />
                </div>
                <div>
                  <div style={{ color: T.text, fontWeight: 700 }}>{row.role} · {row.person}</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>{row.base}</div>
                </div>
                <Chip color={T.successDark} bg={T.successBg}>Earned</Chip>
                <div style={{ fontSize: 14, fontWeight: 800, color: row.color, textAlign: 'right' }}>+${row.amount}</div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 10, background: T.successBg, borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.successDark }}>Total commissions earned</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.successDark }}>$370</div>
          </motion.div>
        </div>
      )}

      {scene === 'rules' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Qualification rules · per role</div>
          {[
            { role: 'Setter',      qual: 'Quote created',      rate: '$25 / appointment',     color: T.accent },
            { role: 'Sales rep',   qual: 'Deal won',           rate: '8% of gross profit',    color: T.successDark },
            { role: 'Lead source', qual: 'First invoice paid', rate: '$25 / first appointment',color: T.purple },
          ].map((row, i) => (
            <motion.div key={row.role} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: row.color }}>{row.role}</div>
                <Chip color={row.color} bg={row.color + '20'}>{row.rate}</Chip>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 24px 1fr', gap: 8, fontSize: 11, alignItems: 'center' }}>
                <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Qualifies</div>
                <Chip color={T.warning} bg={T.warningBg}>Pending</Chip>
                <ArrowRight size={12} style={{ color: T.textMuted }} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Chip color={T.successDark} bg={T.successBg}>Earned</Chip>
                  <span style={{ color: T.textMuted, fontSize: 10 }}>when {row.qual}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'payout' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 11, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CircleDollarSign size={18} style={{ color: T.successDark }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Marcus · paystub June 5</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
            {[
              { label: 'Base · 80h × $32',           amount: 2560 },
              { label: 'OT · 4h × $48',              amount: 192  },
              { label: 'Setter commission · 8 appt', amount: 200,  highlight: true },
              { label: 'Source bonus · 2 leads',     amount: 50,   highlight: true },
            ].map((row, i) => (
              <motion.div key={row.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 }} style={{ display: 'contents' }}>
                <div style={{ padding: '6px 10px', fontSize: 11, color: row.highlight ? T.successDark : T.text, fontWeight: row.highlight ? 700 : 500 }}>
                  {row.highlight && <Trophy size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />}
                  {row.label}
                </div>
                <div style={{ padding: '6px 10px', fontSize: 12, color: row.highlight ? T.successDark : T.text, fontWeight: 800, textAlign: 'right' }}>${row.amount.toLocaleString()}</div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ marginTop: 8, padding: 8, background: T.successBg, borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.successDark }}>Gross total</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.successDark }}>$3,002</div>
          </motion.div>
        </div>
      )}
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    set:    '1. Setter books · +$25 posts as pending',
    quote:  '2. Quote sent → rule fires → pending becomes earned',
    won:    '3. Deal won · setter + rep + source all paid',
    rules:  '4. One rule per role · sets when pending → earned',
    payout: '5. Next paystub · commissions itemized · paid automatically',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Set rates · pick rules · posts automatically'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
