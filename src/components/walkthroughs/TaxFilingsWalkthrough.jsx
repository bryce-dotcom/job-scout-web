// Tax Filings walkthrough — rebuilt to Prospect Scout standard.
// Source: src/lib/featureKnowledge/tax-filings.js (route: /tax-filings)
// Generates 941, 940, W-2, W-3, 1099-NEC PDFs. DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { FileBadge, Plus, Download, CheckCircle, Clock, AlertCircle, FileText } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/tax-filings.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_FILINGS = [
  { id: 1, form: '941',      period: 'Q1 2026 · Jan–Mar',  status: 'Filed',    due: 'Apr 30', amount: 18420, filed: 'Apr 22' },
  { id: 2, form: 'TC-941',   period: 'Q1 2026 · Jan–Mar',  status: 'Filed',    due: 'Apr 30', amount: 3200,  filed: 'Apr 22' },
  { id: 3, form: '941',      period: 'Q2 2026 · Apr–Jun',  status: 'Due Soon', due: 'Jul 31', amount: null,  filed: null },
  { id: 4, form: 'W-2',      period: 'Year-End 2025',       status: 'Filed',    due: 'Jan 31', amount: null,  filed: 'Jan 24' },
  { id: 5, form: '1099-NEC', period: 'Year-End 2025',       status: 'Filed',    due: 'Jan 31', amount: null,  filed: 'Jan 24' },
]

const STATUS_COLORS = {
  'Filed':     { bg: 'rgba(74,124,89,0.12)',   text: '#4a7c59', icon: CheckCircle },
  'Due Soon':  { bg: 'rgba(234,179,8,0.12)',   text: '#eab308', icon: AlertCircle },
  'Draft':     { bg: 'rgba(107,114,128,0.12)', text: '#6b7280', icon: Clock },
  'Overdue':   { bg: 'rgba(194,90,90,0.12)',   text: '#c25a5a', icon: AlertCircle },
}

export default function TaxFilingsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Taxes filed, no accountant needed." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <FileBadge size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Tax Filings</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />New Filing
        </button>
      </div>

      {/* Filing list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {MOCK_FILINGS.map((filing, i) => {
          const sc = STATUS_COLORS[filing.status] || STATUS_COLORS['Draft']
          const StatusIcon = sc.icon
          return (
            <motion.div key={filing.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '7px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={14} style={{ color: T.accent }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>{filing.form}</div>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{filing.period}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>
                    <StatusIcon size={8} />{filing.status}
                  </span>
                  {filing.status === 'Filed' && (
                    <button style={{ padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', color: T.textMuted, cursor: 'pointer' }}>
                      <Download size={10} />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '9px', color: T.textMuted }}>
                <span>Due: {filing.due}</span>
                {filing.filed && <span style={{ color: '#22c55e' }}>Filed: {filing.filed}</span>}
                {filing.amount && <span>${filing.amount.toLocaleString()}</span>}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:    '1 · Tax Filings — 941, TC-941, W-2, 1099-NEC with period, status, due date',
    quarter: '2 · Quarterly 941 — system pre-fills from payroll data, generates PDF snapshot',
    yearend: '3 · Year-end: W-2 per employee, W-3 summary, 1099-NEC for contractors — all one click',
    filed:   '4 · Filed = locked PDF snapshot stored · Download button pulls the exact filed version',
    amend:   '5 · Need to correct a filing? Amendment creates a new row, original is preserved',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Tax Filings work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
