// My Pay walkthrough — employee self-service pay portal.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet, FileText, TrendingUp, DollarSign, CreditCard, FileBadge,
  Download, Calendar,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/my-pay.js'

const STUBS = [
  { period: 'May 16-31', gross: 3920, fed: 412, state: 144, fica: 243, net: 3121 },
  { period: 'May 1-15',  gross: 3680, fed: 380, state: 132, fica: 228, net: 2940 },
  { period: 'Apr 16-30', gross: 3920, fed: 412, state: 144, fica: 243, net: 3121 },
  { period: 'Apr 1-15',  gross: 3520, fed: 358, state: 124, fica: 218, net: 2820 },
]

export default function MyPayWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Stubs, YTD totals, tax docs — no HR ticket required." />}
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
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 340, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 38px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '12px 16px', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wallet size={16} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>My Pay</div>
          <div style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.85 }}>Cole Westbrook</div>
        </div>

        <div style={{ flex: 1, padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scene === 'stub' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 14, background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>Latest paystub</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>May 16 – 31 · pays June 5</div>
                </div>
                <Chip color={T.successDark} bg={T.successBg}>Paid</Chip>
              </div>
              <div style={{ padding: 10, background: T.bg, borderRadius: 7, marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 3 }}>Gross pay</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>$3,920.00</div>
              </div>
              {[
                { l: 'Federal w/h',  v: '-$412.00' },
                { l: 'State w/h',    v: '-$144.00' },
                { l: 'FICA + Medi',  v: '-$243.00' },
              ].map((r, i) => (
                <motion.div key={r.l} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.1 }} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', fontSize: 11, color: T.text }}>
                  <span>{r.l}</span>
                  <span style={{ color: T.danger, fontWeight: 600 }}>{r.v}</span>
                </motion.div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: T.successBg, borderRadius: 6, marginTop: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.successDark }}>Net</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.successDark }}>$3,121.00</span>
              </div>
            </motion.div>
          )}

          {scene === 'history' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>Pay history · 2026</div>
              {STUBS.map((s, i) => (
                <motion.div key={s.period} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 30px', gap: 8, padding: 10, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, alignItems: 'center' }}>
                  <div>
                    <div style={{ color: T.text, fontWeight: 700 }}>{s.period}</div>
                    <div style={{ fontSize: 9, color: T.textMuted }}>gross ${s.gross.toLocaleString()}</div>
                  </div>
                  <div style={{ color: T.successDark, fontWeight: 800, textAlign: 'right' }}>${s.net.toLocaleString()}</div>
                  <Download size={12} style={{ color: T.textMuted }} />
                </motion.div>
              ))}
            </>
          )}

          {scene === 'ytd' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>Year-to-date · 2026</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Stat label="Gross"     value="$44,180" color={T.text}        icon={TrendingUp} />
                <Stat label="Net"       value="$33,820" color={T.successDark} icon={DollarSign} highlight />
                <Stat label="Federal"   value="$4,612"  color={T.danger}      />
                <Stat label="State"     value="$1,608"  color={T.danger}      />
                <Stat label="FICA"      value="$2,738"  color={T.danger}      />
                <Stat label="Medicare"  value="$640"    color={T.danger}      />
              </div>
            </>
          )}

          {scene === 'reimburse' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>Reimbursement balance</div>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ padding: 14, background: T.warningBg, border: `1.5px solid ${T.warning}`, borderRadius: 10, textAlign: 'center' }}>
                <DollarSign size={28} style={{ color: T.warning, margin: '0 auto 4px' }} />
                <div style={{ fontSize: 22, fontWeight: 800, color: T.warning }}>$218.40</div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Pays out on June 5 · with your paycheck</div>
              </motion.div>
              {[
                { d: 'May 27', vendor: 'Lowes Highland', cat: 'Materials',  amt: 152.40 },
                { d: 'May 24', vendor: 'Subway',         cat: 'Meals',      amt: 28.00  },
                { d: 'May 21', vendor: 'Home Depot',     cat: 'Tools',      amt: 38.00  },
              ].map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 70px', gap: 8, padding: 8, background: T.bg, borderRadius: 6, fontSize: 10, alignItems: 'center' }}>
                  <div style={{ color: T.textMuted }}>{r.d}</div>
                  <div>
                    <div style={{ color: T.text, fontWeight: 700 }}>{r.vendor}</div>
                    <div style={{ fontSize: 9, color: T.textMuted }}>{r.cat}</div>
                  </div>
                  <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${r.amt.toFixed(2)}</div>
                </motion.div>
              ))}
            </>
          )}

          {scene === 'taxdocs' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' }}>Tax docs · 2025</div>
              {[
                { form: 'W-2',         year: 2025, desc: 'Wages + withholding', icon: FileBadge },
                { form: '1095-C',      year: 2025, desc: 'Health coverage',     icon: FileText },
              ].map((r, i) => (
                <motion.div key={r.form} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.18 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px', gap: 10, padding: 12, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <r.icon size={15} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{r.form}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{r.desc}</div>
                  </div>
                  <button style={{ padding: '6px 10px', background: T.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Download size={11} /> PDF
                  </button>
                </motion.div>
              ))}
              <div style={{ fontSize: 10, color: T.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
                Ready for TurboTax · same form your CPA wants
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color, icon: Icon, highlight }) {
  return (
    <div style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${highlight ? color : T.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {Icon && <Icon size={11} style={{ color }} />}
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    stub:      '1. Latest paystub right at the top · gross to net itemized',
    history:   '2. Every stub for the year · download anytime',
    ytd:       '3. Year-to-date totals · tax prep, easy',
    reimburse: '4. Reimbursement balance · paid out next cycle',
    taxdocs:   '5. Year-end W-2 + 1095-C · ready for TurboTax',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Zero setup · stubs auto-land here'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
