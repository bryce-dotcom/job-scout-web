// Books walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, TrendingUp, FileText, CheckSquare, Download, Edit2,
  Landmark, ArrowUp, ArrowDown,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/books.js'

const TXS = [
  { date: 'May 28', desc: 'Stripe deposit · INV-2014',  cat: 'Income',           amount: 4280, in: true },
  { date: 'May 27', desc: 'Lowes Highland #2218',       cat: 'Materials',         amount: -389, in: false },
  { date: 'May 26', desc: 'Verizon Wireless',           cat: 'Phone',             amount: -128, in: false },
  { date: 'May 25', desc: 'Stripe deposit · INV-2011',  cat: 'Income',           amount: 1840, in: true },
  { date: 'May 24', desc: 'Pacific Gas & Electric',     cat: 'Utilities',         amount: -284, in: false },
]

export default function BooksWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Clean books your CPA actually trusts." />}
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
    <ZachShell title="Books · May 2026" subtitle="Profit & loss · transactions · reconciliation" actionLabel="Export" actionIcon={Download}>
      {scene === 'pnl' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="Revenue" value="$48,420" color={T.successDark} icon={ArrowUp} />
          <Stat label="Expenses" value="$31,180" color={T.danger} icon={ArrowDown} />
          <Stat label="Net income" value="$17,240" color={T.accent} icon={TrendingUp} highlight />
          <Stat label="Margin" value="35.6%" color={T.purple} icon={TrendingUp} />
          <div style={{ gridColumn: 'span 2', background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>P&L by month</div>
            <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 60 }}>
              {[28, 35, 42, 38, 48].map((h, i) => (
                <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * 0.1, duration: 0.6 }} style={{ flex: 1, background: T.accent, borderRadius: 4, position: 'relative' }}>
                  <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: T.textMuted }}>
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May'][i]}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(scene === 'tx' || scene === 'edit') && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 10, height: '100%', overflow: 'auto' }}>
          {TXS.map((tx, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1, backgroundColor: scene === 'edit' && i === 1 ? T.accentBg : 'transparent' }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 110px 90px', gap: 8, alignItems: 'center', padding: '8px 6px', borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
              <div style={{ fontSize: 10, color: T.textMuted }}>{tx.date}</div>
              <div style={{ color: T.text }}>{tx.desc}</div>
              <Chip color={tx.in ? T.successDark : T.accent} bg={tx.in ? T.successBg : T.accentBg}>{tx.cat}</Chip>
              <div style={{ fontWeight: 700, textAlign: 'right', color: tx.in ? T.successDark : T.text }}>
                {tx.in ? '+' : ''}${Math.abs(tx.amount).toLocaleString()}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'recon' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 18, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Chip icon={Landmark} color={T.accent} bg={T.accentBg}>Chase Business Checking</Chip>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <Stat label="Plaid ending balance" value="$42,118" color={T.text} />
            <Stat label="Book balance" value="$42,118" color={T.text} />
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 12, padding: 12, background: T.successBg, border: `1.5px solid ${T.successDark}`, borderRadius: 7, textAlign: 'center' }}>
            <CheckSquare size={28} style={{ color: T.successDark, margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: T.successDark }}>Reconciled · $0 drift</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Period locked · ready for CPA</div>
          </motion.div>
        </div>
      )}

      {scene === 'export' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'P&L (Profit & Loss)', icon: TrendingUp },
            { label: 'Balance Sheet',       icon: BookOpen },
            { label: 'Trial Balance',       icon: FileText },
            { label: 'General Ledger',      icon: FileText },
          ].map((r, i) => (
            <motion.div key={r.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
              <r.icon size={18} style={{ color: T.accent }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{r.label}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>CPA-ready PDF + CSV</div>
              </div>
              <Download size={14} style={{ color: T.textMuted }} />
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function Stat({ label, value, color, icon: Icon, highlight }) {
  return (
    <motion.div animate={{ borderColor: highlight ? T.accent : T.border }} style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {Icon && <Icon size={12} style={{ color }} />}
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    pnl:    '1. P&L by month / quarter / year — at a glance',
    tx:     '2. Every transaction · bank, expense, payment, payroll',
    edit:   '3. Edit a row — category · Form 1065 line · job alloc',
    recon:  '4. Reconcile to bank statement in two clicks',
    export: '5. CPA-ready exports · P&L · BS · GL · trial balance',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Plaid + chart of accounts'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
