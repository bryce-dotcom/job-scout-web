// Frankie The AI CFO walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, DollarSign, TrendingUp, AlertTriangle, Send, Briefcase,
  Mail, ChevronRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/frankie.js'

const AGING = [
  { customer: 'Cypress Logistics',  amount: 6400, days: 78 },
  { customer: 'Granite Foods',      amount: 3820, days: 72 },
  { customer: 'Solera Manufacturing', amount: 7900, days: 64 },
]

export default function FrankieWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Plain-English answers with the receipts attached." />}
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
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Chat header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.purple, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={16} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Frankie · AI CFO</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>Reads your books · runs your numbers</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {scene === 'ask' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ alignSelf: 'flex-end', maxWidth: '70%', padding: '10px 14px', background: T.accent, color: '#fff', borderRadius: 14, borderBottomRightRadius: 4, fontSize: 13 }}>
            why is cash tight this month?
          </motion.div>
        )}

        {scene === 'answer' && (
          <>
            <div style={{ alignSelf: 'flex-end', maxWidth: '70%', padding: '8px 12px', background: T.accent, color: '#fff', borderRadius: 12, borderBottomRightRadius: 4, fontSize: 12 }}>why is cash tight this month?</div>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ alignSelf: 'flex-start', maxWidth: '80%', padding: '12px 14px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, borderBottomLeftRadius: 4, fontSize: 12, color: T.text }}>
              <div style={{ marginBottom: 6 }}>Two main drags this month:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                <div>• <strong>3 customers</strong> over 60 days late · <strong>$18,120</strong> outstanding</div>
                <div>• <strong>Materials spend up 18%</strong> vs trailing 90-day avg</div>
              </div>
              <Chip color={T.purple} bg={T.purpleBg}>Show me the customers →</Chip>
            </motion.div>
          </>
        )}

        {scene === 'aging' && (
          <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>AR aging · 60+ days</div>
            {AGING.map((a, i) => (
              <motion.div key={a.customer} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: `1px dashed ${T.border}` }}>
                <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{a.customer}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>${a.amount.toLocaleString()}</div>
                <Chip color={T.danger} bg="rgba(239,68,68,0.12)">{a.days} days</Chip>
              </motion.div>
            ))}
          </div>
        )}

        {scene === 'collect' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 9, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Mail size={14} style={{ color: T.purple }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Frankie drafted 3 reminders</div>
            </div>
            <div style={{ padding: 10, background: T.bg, borderRadius: 7, fontSize: 11, color: T.text, marginBottom: 8 }}>
              <div style={{ fontStyle: 'italic' }}>"Hi Cypress team — just a quick friendly nudge that invoice INV-1987 ($6,400) is showing 78 days past due. Would love to get this wrapped up — happy to take a card or ACH from the pay link below. Thanks!"</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Chip>Auto-sends in 2 min</Chip>
              <button style={{ padding: '6px 12px', background: T.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Send size={11} /> Send all 3
              </button>
            </div>
          </motion.div>
        )}

        {scene === 'profit' && (
          <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Job profitability · May</div>
            {[
              { job: 'JOB-2147 · Northbridge', margin: 38, color: T.successDark },
              { job: 'JOB-2152 · Solera',      margin: 31, color: T.successDark },
              { job: 'JOB-2148 · Granite',     margin: 12, color: T.warning },
              { job: 'JOB-2150 · Cypress',     margin: 4,  color: T.danger },
            ].map((row, i) => (
              <motion.div key={row.job} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 60px', gap: 10, alignItems: 'center', padding: '6px 4px', borderBottom: `1px dashed ${T.border}` }}>
                <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{row.job}</div>
                <div style={{ height: 5, background: T.bg, borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${row.margin * 2}%`, background: row.color, borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: row.color, textAlign: 'right' }}>{row.margin}%</div>
              </motion.div>
            ))}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.warningBg, border: `1px solid ${T.warning}`, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertTriangle size={12} style={{ color: T.warning }} />
              JOB-2150 bled margin — materials spend 2.4x estimate
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    ask:     "1. Ask: 'why is cash tight this month?'",
    answer:  '2. Frankie pulls data · plain-English answer · receipts attached',
    aging:   '3. AR aging by customer · ranked by days late',
    collect: '4. Drafts collection reminders · sends all 3',
    profit:  '5. Per-job margin · flags the one that bled',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Wire Plaid · pick alert cadence'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
