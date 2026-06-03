// Utility Invoices walkthrough — rebate tracking.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Sliders, FileSignature, CircleDollarSign, AlertTriangle,
  ArrowRight, Calendar, Lightbulb,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/utility-invoices.js'

const REBATES = [
  { id: 'UI-2147', customer: 'Northbridge',    program: 'RMP Wattsmart', owes: 14_780, filed: '2026-06-01', status: 'filed',   days: 8  },
  { id: 'UI-2143', customer: 'Solera Mfg',     program: 'SRP Custom',    owes: 8_220,  filed: '2026-04-12', status: 'pending', days: 58 },
  { id: 'UI-2138', customer: 'Granite Foods',  program: 'APS Solutions', owes: 6_840,  filed: '2026-05-04', status: 'paid',    days: 30 },
  { id: 'UI-2129', customer: 'Cypress',        program: 'RMP Wattsmart', owes: 4_120,  filed: '2026-05-18', status: 'filed',   days: 22 },
]

export default function UtilityInvoicesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every rebate · filed to paid · honest job costing." />}
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
    <ZachShell title="Utility Invoices · 4 in flight" subtitle="Project cost + utility owes drive the split" actionLabel="New Filing" actionIcon={FileSignature} filterChips={[{ icon: Zap, label: '3 programs · $33,960 outstanding' }]}>
      {scene === 'open' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REBATES.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 100px 80px 80px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: T.accent }}>{r.id}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{r.customer}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>filed {r.filed} · {r.days}d ago</div>
              </div>
              <Chip color={T.purple} bg={T.purpleBg}>{r.program}</Chip>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textAlign: 'right' }}>${r.owes.toLocaleString()}</div>
              <StatusChip status={r.status} />
              <div style={{ fontSize: 10, color: r.days > 60 ? T.danger : r.days > 30 ? T.warning : T.successDark, fontWeight: 700, textAlign: 'right' }}>
                {r.days}d
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'split' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={18} style={{ color: T.purple }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>UI-2147 · Northbridge LED retrofit</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>RMP Wattsmart · 240 fixtures · audit-derived</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Stat label="Project cost" value="$28,400" color={T.text} />
            <Stat label="Utility owes" value="$14,780" color={T.successDark} highlight />
          </div>
          <div style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: 7, fontSize: 11, color: T.text }}>
            Customer portion (auto-computed): <strong style={{ color: T.accent }}>$13,620</strong>
            <span style={{ color: T.textMuted, marginLeft: 6 }}>· $28,400 − $14,780</span>
          </div>
        </div>
      )}

      {scene === 'calc' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sliders size={16} style={{ color: T.accent }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Materials / Labor split · 70/30</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} style={{ padding: 12, background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>Materials (70%)</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginTop: 3 }}>$10,346.00</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>covers ~70% of fixture cost</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} style={{ padding: 12, background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>Labor (30%)</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginTop: 3 }}>$4,434.00</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>offsets ~30% of install time</div>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ padding: 10, background: T.successBg, border: `1px solid ${T.successDark}`, borderRadius: 7, fontSize: 11, color: T.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CircleDollarSign size={14} /> Honest accounting · job profitability re-computes when rebate is paid
          </motion.div>
        </div>
      )}

      {scene === 'aging' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Calendar size={16} style={{ color: T.purple }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>AR aging · by program</div>
          </div>
          {[
            { program: 'RMP Wattsmart', avg: 30, color: T.successDark, count: 2, amt: 18_900 },
            { program: 'APS Solutions', avg: 45, color: T.warning,     count: 1, amt: 6_840 },
            { program: 'SRP Custom',    avg: 87, color: T.danger,      count: 1, amt: 8_220 },
          ].map((row, i) => (
            <motion.div key={row.program} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 80px', gap: 10, alignItems: 'center', padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, marginBottom: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.program}</div>
              <div style={{ height: 8, background: T.bgCard, borderRadius: 99, position: 'relative' }}>
                <div style={{ height: '100%', width: `${(row.avg / 100) * 100}%`, background: row.color, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: row.color, textAlign: 'right' }}>{row.avg}d avg</div>
              <div style={{ fontSize: 11, color: T.text, fontWeight: 700, textAlign: 'right' }}>${(row.amt / 1000).toFixed(1)}k</div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.warningBg, border: `1px solid ${T.warning}`, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12} style={{ color: T.warning }} />
            SRP runs 87d avg · push the rebate department or float the cash
          </motion.div>
        </div>
      )}

      {scene === 'paid' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 11, padding: 22, textAlign: 'center', maxWidth: 380 }}>
            <CircleDollarSign size={44} style={{ color: T.successDark, margin: '0 auto 8px' }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: T.successDark }}>$14,780 paid</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>RMP Wattsmart · UI-2147 · check #48820</div>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ marginTop: 12, padding: 10, background: T.successBg, borderRadius: 7, fontSize: 11, color: T.text, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: T.successDark, marginBottom: 6 }}>GL entries posted:</div>
              <div style={{ fontSize: 10, fontFamily: 'monospace' }}>
                <div>Cash ........................... +$14,780.00</div>
                <div>Rebate Income ............... +$14,780.00</div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ marginTop: 8, padding: 6, background: T.accentBg, borderRadius: 6, fontSize: 10, color: T.accent, fontWeight: 600 }}>
              JOB-2147 profitability re-computed → margin 52% → from 38%
            </motion.div>
          </motion.div>
        </div>
      )}
    </ZachShell>
  )
}

function Stat({ label, value, color, highlight }) {
  return (
    <div style={{ padding: 10, background: T.bg, border: `1.5px solid ${highlight ? color : T.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
    </div>
  )
}

function StatusChip({ status }) {
  if (status === 'paid')    return <Chip color={T.successDark} bg={T.successBg}>Paid</Chip>
  if (status === 'filed')   return <Chip color={T.accent} bg={T.accentBg}>Filed</Chip>
  if (status === 'pending') return <Chip color={T.warning} bg={T.warningBg}>Pending</Chip>
  return <Chip>{status}</Chip>
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    open:   '1. Every rebate in flight · filed, pending, paid',
    split:  '2. Project cost + utility owes drive the split',
    calc:   '3. Materials 70% · labor 30% · honest accounting',
    aging:  '4. AR aging by program · RMP fast, SRP slow',
    paid:   '5. Rebate hits · GL posts · job margin re-computes',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Auto-created from audits'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
