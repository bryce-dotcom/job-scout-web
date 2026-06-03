// Expenses walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Camera, Tag, Briefcase, DollarSign, CheckCircle2, Bot,
  Sparkles,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/expenses.js'

export default function ExpensesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Receipts in 3 taps · margin truth restored." />}
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
      {/* Phone frame */}
      <div style={{ width: '100%', maxWidth: 320, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 38px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '12px 16px', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Receipt size={16} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>New Expense</div>
          <div style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.85 }}>Cole · Field Scout</div>
        </div>

        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {scene === 'snap' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center' }}>
              <div style={{ width: 200, height: 260, margin: '0 auto', background: '#1f2937', border: `2px solid ${T.accent}`, borderRadius: 9, padding: 10, position: 'relative' }}>
                <div style={{ background: 'rgba(255,255,255,0.95)', padding: 10, borderRadius: 4, color: '#1f2937', fontSize: 9, lineHeight: 1.4, fontFamily: 'monospace', textAlign: 'left', height: '100%' }}>
                  <div style={{ fontWeight: 700, textAlign: 'center', borderBottom: '1px dashed #999', paddingBottom: 4, marginBottom: 6 }}>LOWES HIGHLAND</div>
                  <div>Store #2218</div>
                  <div>05/27/2026 14:32</div>
                  <div style={{ marginTop: 6 }}>2X4 LED PANEL × 14 ............. 67.20</div>
                  <div>2X4 BRACKET × 28 ................ 33.60</div>
                  <div>LED T8 TUBE × 12 ............... 96.00</div>
                  <div>WIRE 12-2 ROMEX × 30 ........... 12.60</div>
                  <div style={{ marginTop: 4 }}>Subtotal .................. 209.40</div>
                  <div>Tax ......................... 19.21</div>
                  <div style={{ fontWeight: 700, marginTop: 4, borderTop: '1px dashed #999', paddingTop: 4 }}>TOTAL ..................... 228.61</div>
                </div>
              </div>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 }} style={{ marginTop: 8, padding: '4px 10px', background: T.successBg, color: T.successDark, borderRadius: 99, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Camera size={11} /> Photo captured
              </motion.div>
            </motion.div>
          )}

          {scene === 'ocr' && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 10, background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={14} style={{ color: T.purple }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Dougie read the receipt</div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>OCR complete · 4 line items</div>
                </div>
                <Chip color={T.purple} bg={T.purple + '20'}>2.1s</Chip>
              </motion.div>
              <Field label="Vendor" value="Lowes Highland" />
              <Field label="Total" value="$228.61" color={T.text} />
              <Field label="Tax" value="$19.21" />
              <Field label="Date" value="May 27, 2026 · 2:32 PM" />
            </>
          )}

          {scene === 'category' && (
            <>
              <Field label="Vendor" value="Lowes Highland" />
              <Field label="Total" value="$228.61" />
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Sparkles size={12} style={{ color: T.accent }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: 'uppercase' }}>AI category</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={14} style={{ color: T.accent }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>Materials</div>
                  <Chip color={T.successDark} bg={T.successBg}>92%</Chip>
                </div>
              </motion.div>
              <button style={{ padding: '10px 12px', background: T.accent, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CheckCircle2 size={13} /> Approve
              </button>
            </>
          )}

          {scene === 'job' && (
            <>
              <Field label="Total" value="$228.61" />
              <Field label="Category" value="Materials" color={T.accent} />
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Briefcase size={12} style={{ color: T.purple }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.purple, textTransform: 'uppercase' }}>Allocated to job</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>JOB-2147 · Northbridge</div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>$228.61 rolls into job costing</div>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ padding: 8, background: T.successBg, borderRadius: 6, fontSize: 11, color: T.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={12} /> Saved · job margin re-computed
              </motion.div>
            </>
          )}

          {scene === 'reimburse' && (
            <>
              <Field label="Vendor" value="Lowes Highland" />
              <Field label="Total" value="$228.61" />
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 10, background: T.warningBg, border: `1.5px solid ${T.warning}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <DollarSign size={12} style={{ color: T.warning }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.warning, textTransform: 'uppercase' }}>Reimbursable</div>
                </div>
                <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>Cole paid out of pocket</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>Will appear on his next paycheck · payroll inbox notified</div>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, color }) {
  return (
    <div style={{ padding: 8, background: T.bg, borderRadius: 7 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: color || T.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    snap:      '1. Tech snaps a receipt at the supply house',
    ocr:       '2. Dougie OCR · vendor, total, tax in 2s',
    category:  '3. AI tags Materials at 92% · tap Approve',
    job:       '4. Allocate to JOB-2147 · rolls into job costing',
    reimburse: '5. Flag reimbursable · payroll inbox notified',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Unlock Dougie · set categories'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
