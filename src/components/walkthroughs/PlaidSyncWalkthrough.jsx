// Plaid Bank Sync walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Landmark, Sparkles, Link, CheckCircle2, ArrowRight, Receipt,
  RefreshCw, Tag,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/plaid-sync.js'

const TXS_TAGGED = [
  { merchant: 'Lowes Highland',     cat: 'Materials', conf: 96 },
  { merchant: 'Verizon Wireless',   cat: 'Phone',     conf: 88 },
  { merchant: 'Costco Gas',         cat: 'Fuel',      conf: 94 },
  { merchant: 'Best Buy',           cat: 'Equipment', conf: 72 },
]

export default function PlaidSyncWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Bank feed connected · AI categorizes · gets smarter every week." />}
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
    <ZachShell title="Books · Bank Feed" subtitle="Plaid sync · AI categorization · learning rules" actionLabel="Connect Bank" actionIcon={Landmark} actionHighlight={scene === 'connect'}>
      {scene === 'connect' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 24, maxWidth: 280, textAlign: 'center' }}>
            <Link size={36} style={{ color: T.accent, margin: '0 auto 10px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Plaid Link</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Pick your bank · sign in · approve · 30 seconds</div>
            <Chip icon={CheckCircle2} color={T.successDark} bg={T.successBg}>12,000+ banks</Chip>
          </motion.div>
        </div>
      )}

      {scene === 'pull' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 12, background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
            <RefreshCw size={16} style={{ color: T.purple }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Pulling 90 days of history</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Chase · Business Checking + Visa</div>
            </div>
            <Chip>1,247 tx</Chip>
          </motion.div>
          {[
            { d: 'Pulled', n: 1247, c: T.successDark },
            { d: 'Categorized', n: 1184, c: T.accent },
            { d: 'Auto-rules learned', n: 23, c: T.purple },
          ].map((row, i) => (
            <motion.div key={row.d} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.15 }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7 }}>
              <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{row.d}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: row.c }}>{row.n.toLocaleString()}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'tag' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TXS_TAGGED.map((t, i) => (
            <motion.div key={t.merchant} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px', gap: 8, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7 }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{t.merchant}</div>
              <Chip icon={Tag} color={T.accent} bg={T.accentBg}>{t.cat}</Chip>
              <div style={{ fontSize: 10, color: t.conf > 90 ? T.successDark : t.conf > 80 ? T.warning : T.danger, fontWeight: 700, textAlign: 'right' }}>
                {t.conf}% confidence
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'rule' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12 }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Override</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginTop: 3 }}>Verizon Wireless</div>
            <Chip color={T.danger} bg="rgba(239,68,68,0.12)">was: Utilities</Chip>
            <ArrowRight size={11} style={{ color: T.textMuted, display: 'inline-block', margin: '0 4px' }} />
            <Chip color={T.successDark} bg={T.successBg}>now: Phone</Chip>
          </motion.div>
          <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <Sparkles size={24} style={{ color: T.purple }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} style={{ background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 9, padding: 12, maxWidth: 200 }}>
            <div style={{ fontSize: 10, color: T.purple, fontWeight: 700, textTransform: 'uppercase' }}>Rule learned</div>
            <div style={{ fontSize: 11, color: T.text, marginTop: 3, fontFamily: 'monospace' }}>Verizon* → Phone</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>Next month: auto-tagged.</div>
          </motion.div>
        </div>
      )}

      {scene === 'match' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12, minWidth: 170 }}>
            <Landmark size={16} style={{ color: T.accent, marginBottom: 4 }} />
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase' }}>Deposit · May 28</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.successDark }}>+$4,280</div>
          </motion.div>
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <ArrowRight size={24} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 9, padding: 12, minWidth: 180 }}>
            <Receipt size={16} style={{ color: T.successDark, marginBottom: 4 }} />
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase' }}>INV-2014</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Northbridge · $4,280</div>
            <Chip icon={CheckCircle2} color={T.successDark} bg={T.successBg}>Auto-matched · paid</Chip>
          </motion.div>
        </div>
      )}
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    connect: '1. Plaid OAuth · 30 seconds · 12,000+ banks',
    pull:    '2. Overnight: 90 days of history pulled',
    tag:     '3. AI tags each tx + confidence score',
    rule:    '4. Your overrides become rules · smarter weekly',
    match:   '5. Deposits auto-match outstanding invoices',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Connect once · rest is automatic'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
