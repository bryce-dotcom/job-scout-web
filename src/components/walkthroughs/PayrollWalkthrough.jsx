// Payroll Runs walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Calendar, Calculator, CheckCircle2, Wallet, Send,
  FileBadge, Bell, ArrowRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/payroll.js'

const PREVIEW = [
  { name: 'Cole',   reg: 80,  ot: 4,  gross: 3920, fed: 412, state: 144, fica: 243, net: 3121 },
  { name: 'Marcus', reg: 80,  ot: 0,  gross: 3200, fed: 305, state: 112, fica: 198, net: 2585 },
  { name: 'Priya',  reg: 76,  ot: 0,  gross: 3192, fed: 298, state: 104, fica: 198, net: 2592 },
  { name: 'Alayda', reg: 80,  ot: 0,  gross: 4000, fed: 425, state: 152, fica: 248, net: 3175 },
]

export default function PayrollWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Gusto math · without the per-employee fee." />}
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
    <ZachShell title="Payroll · May 16-31" subtitle="Biweekly · 8 employees" actionLabel={scene === 'pay' ? 'Approved' : 'Approve'} actionIcon={CheckCircle2} actionHighlight={scene === 'pay'}>
      {scene === 'period' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="Pay period" value="May 16 – 31" color={T.text} icon={Calendar} />
          <Stat label="Pay date" value="Jun 5" color={T.accent} icon={Calendar} />
          <Stat label="Hours pulled" value="624 h" color={T.successDark} />
          <Stat label="Employees" value="8" color={T.text} />
          <div style={{ gridColumn: 'span 2', padding: 10, background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calculator size={16} style={{ color: T.purple }} />
            <div style={{ fontSize: 11, color: T.text }}>Time clock auto-pulled · ready to compute</div>
          </div>
        </div>
      )}

      {(scene === 'compute' || scene === 'review') && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: 'hidden', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 50px 50px 70px 60px 60px 60px 70px', fontSize: 9, color: T.textMuted, fontWeight: 700, padding: '6px 8px', borderBottom: `1.5px solid ${T.border}`, textTransform: 'uppercase' }}>
            <div>Employee</div><div>Reg</div><div>OT</div><div>Gross</div><div>Fed</div><div>State</div><div>FICA</div><div>Net</div>
          </div>
          {PREVIEW.map((row, i) => (
            <motion.div key={row.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '90px 50px 50px 70px 60px 60px 60px 70px', fontSize: 11, color: T.text, padding: '8px 8px', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{row.name}</div>
              <div>{row.reg}h</div>
              <div style={{ color: row.ot > 0 ? T.warning : T.textMuted, fontWeight: row.ot > 0 ? 700 : 400 }}>{row.ot}h</div>
              <div style={{ fontWeight: 700 }}>${row.gross.toLocaleString()}</div>
              <div style={{ color: T.danger }}>-${row.fed}</div>
              <div style={{ color: T.danger }}>-${row.state}</div>
              <div style={{ color: T.danger }}>-${row.fica}</div>
              <div style={{ fontWeight: 800, color: T.successDark }}>${row.net.toLocaleString()}</div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: T.accentBg }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>Total net</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>$11,473</div>
          </motion.div>
        </div>
      )}

      {scene === 'pay' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 12, padding: 22, textAlign: 'center', maxWidth: 360 }}>
            <CheckCircle2 size={48} style={{ color: T.successDark, margin: '0 auto 6px' }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: T.successDark }}>Payroll approved</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>$11,473 queued for direct deposit · paystubs published</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { icon: Wallet, label: 'ACH file queued · arrives Jun 5' },
                { icon: Send,   label: '8 paystubs published to My Pay' },
                { icon: FileBadge, label: 'GL journal entries posted' },
              ].map((row, i) => (
                <motion.div key={row.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.18 }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: T.bg, borderRadius: 6, fontSize: 11, color: T.text }}>
                  <row.icon size={11} style={{ color: T.accent }} />
                  {row.label}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {scene === 'tax' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Payroll inbox · tax to-dos</div>
          {[
            { label: 'EFTPS federal deposit · $1,440', due: 'Friday Jun 8', urgency: 'high' },
            { label: 'Utah TC-941 quarterly · Q2',     due: 'Jul 31',       urgency: 'med' },
            { label: 'FUTA Form 940 · annual',         due: 'Jan 31',       urgency: 'low' },
          ].map((row, i) => (
            <motion.div key={row.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.18 }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={14} style={{ color: row.urgency === 'high' ? T.danger : row.urgency === 'med' ? T.warning : T.textMuted }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{row.label}</div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>Due {row.due}</div>
                </div>
              </div>
              <Chip color={row.urgency === 'high' ? T.danger : row.urgency === 'med' ? T.warning : T.textMuted} bg={row.urgency === 'high' ? 'rgba(239,68,68,0.12)' : row.urgency === 'med' ? T.warningBg : T.bg}>{row.urgency}</Chip>
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function Stat({ label, value, color, icon: Icon }) {
  return (
    <div style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {Icon && <Icon size={12} style={{ color }} />}
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    period:  '1. Pick the pay period · hours pull from time clock',
    compute: '2. Compute · IRS Pub 15-T · state · FICA · Medicare',
    review:  '3. Per-employee preview · gross to net itemized',
    pay:     '4. Approve · ACH queued · paystubs + GL post automatically',
    tax:     '5. Tax deposits + filings auto-land in payroll inbox',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'One-time setup · runs are 5 minutes'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
