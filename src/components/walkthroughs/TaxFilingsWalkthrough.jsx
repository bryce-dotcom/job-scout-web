// Tax Engine & Filings walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileBadge, Calendar, FileText, Lock, RotateCcw, CheckCircle2,
  Download, AlertTriangle,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/tax-filings.js'

export default function TaxFilingsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Forms generate themselves · you click filed." />}
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
    <ZachShell title="Tax Filings · 2026" subtitle="Quarterly + year-end · federal + state" actionLabel="File" actionIcon={CheckCircle2}>
      {scene === 'quarter' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="Quarter" value="Q2 2026" color={T.text} icon={Calendar} />
          <Stat label="Due" value="Jul 31" color={T.warning} icon={Calendar} />
          <Stat label="Federal w/h" value="$11,820" color={T.text} />
          <Stat label="FICA + Medicare" value="$8,940" color={T.text} />
          <div style={{ gridColumn: 'span 2', padding: 10, background: T.purpleBg, border: `1.5px solid ${T.purple}`, borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileBadge size={14} style={{ color: T.purple }} />
            <div style={{ fontSize: 11, color: T.text }}>Job Scout assembling 941 from 6 payroll runs</div>
          </div>
        </div>
      )}

      {scene === 'pdf' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 14, maxWidth: 200 }}>
            <FileText size={28} style={{ color: T.accent, marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Form 941 · Q2 2026</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>HHH Services · EIN ****1287</div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Row label="Line 2 · Wages"     value="$83,420" />
              <Row label="Line 3 · Fed w/h"    value="$11,820" />
              <Row label="Line 5a · SS wages" value="$83,420" />
              <Row label="Line 12 · Total tax" value="$33,580" />
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} style={{ background: T.bgCard, border: `1.5px solid ${T.purple}`, borderRadius: 9, padding: 14, maxWidth: 180 }}>
            <Lock size={28} style={{ color: T.purple, marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Snapshot locked</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Future edits don't drift this filing</div>
            <Chip icon={Download}>Print or e-file</Chip>
          </motion.div>
        </div>
      )}

      {scene === 'state' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { code: 'TC-941', state: 'Utah', desc: 'Utah quarterly w/h', due: 'Jul 31',  status: 'ready' },
            { code: 'A-1',    state: 'AZ',  desc: 'Arizona quarterly w/h', due: 'Jul 31', status: 'ready' },
            { code: 'DE 9',   state: 'CA',  desc: 'California quarterly UI/ETT/SDI', due: 'Jul 31', status: 'ready' },
          ].map((row, i) => (
            <motion.div key={row.code} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 80px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: T.accent }}>{row.code}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{row.state} · {row.desc}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>Due {row.due}</div>
              </div>
              <Chip color={T.successDark} bg={T.successBg}>{row.status}</Chip>
              <Chip icon={Download}>PDF</Chip>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'year' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { form: 'W-2 × 12', desc: 'One per W-2 employee',     color: T.accent },
            { form: 'W-3',      desc: 'Rollup for SSA',           color: T.purple },
            { form: '1099-NEC × 3', desc: 'One per contractor ≥ $600', color: T.warning },
            { form: '1096',     desc: 'Rollup for IRS',           color: T.successDark },
          ].map((row, i) => (
            <motion.div key={row.form} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
              <FileBadge size={20} style={{ color: row.color, marginBottom: 4 }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{row.form}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{row.desc}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'amend' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12, opacity: 0.7 }}>
            <Lock size={20} style={{ color: T.textMuted, marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>941 · Q2 (original)</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Filed Jul 31 · locked</div>
          </motion.div>
          <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <RotateCcw size={20} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.warning}`, borderRadius: 9, padding: 12 }}>
            <AlertTriangle size={20} style={{ color: T.warning, marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>941-X · Amendment</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Tied to original · delta computed</div>
            <Chip color={T.warning} bg={T.warningBg}>Delta: +$420</Chip>
          </motion.div>
        </div>
      )}
    </ZachShell>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.text }}>
      <span style={{ color: T.textMuted }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
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
    quarter: '1. Quarter end · 941 assembles from payroll runs',
    pdf:     '2. PDF generated · snapshot locks the numbers',
    state:   '3. State forms · TC-941, A-1, DE 9 — same flow',
    year:    '4. Year end · W-2, W-3, 1099-NEC, 1096',
    amend:   '5. Amendments · original locked · delta computed',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Registrations once · filings auto-generate'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
