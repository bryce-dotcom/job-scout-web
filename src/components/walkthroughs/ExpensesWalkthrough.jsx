// Expenses walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Expenses.jsx (manual expenses) + Books.jsx (transaction expenses)
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, Plus, Camera, X, Upload, Download, CheckCircle, Tag, Briefcase, ToggleRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/expenses.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Mock expense categories with colors
const CAT_COLORS = {
  'Materials':       '#f97316',
  'Vehicle — Fuel':  '#3b82f6',
  'Subcontractor':   '#8b5cf6',
  'Office':          '#06b6d4',
  'Meals':           '#f59e0b',
  'Tools':           '#22c55e',
}

const MOCK_EXPENSES = [
  { id: 1, date: 'Jun 8', description: 'Home Depot — LED fixtures', vendor: 'Home Depot',    amount: 847.32, category: 'Materials',      job: 'JOB-041', receipt: true  },
  { id: 2, date: 'Jun 7', description: 'Shell Gas',                 vendor: 'Shell',          amount: 124.50, category: 'Vehicle — Fuel', job: null,      receipt: true  },
  { id: 3, date: 'Jun 6', description: 'Sub labor — wiring',        vendor: 'Tom\'s Electric', amount: 1200,   category: 'Subcontractor',  job: 'JOB-038', receipt: false },
  { id: 4, date: 'Jun 5', description: 'Office supplies',           vendor: 'Staples',        amount: 89.99,  category: 'Office',         job: null,      receipt: true  },
  { id: 5, date: 'Jun 4', description: 'Team lunch',                vendor: 'Costa Vida',     amount: 67.40,  category: 'Meals',          job: null,      receipt: false },
]

export default function ExpensesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every dollar accounted for." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showReceiptForm = scene === 'ocr' || scene === 'approve' || scene === 'allocate' || scene === 'reimburse'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Receipt size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Expenses</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Expense
        </button>
      </div>

      {/* snap: receipt upload zone + table below */}
      {scene === 'snap' && (
        <>
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '18px', border: `2px dashed ${T.accent}`, borderRadius: '10px', backgroundColor: T.accentBg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 }}>
            <Camera size={22} style={{ color: T.accent }} />
            <span style={{ fontSize: '11px', fontWeight: '600', color: T.accent }}>Snap or upload a receipt</span>
            <span style={{ fontSize: '9px', color: T.textMuted }}>Dougie reads vendor, amount, line items automatically</span>
          </motion.div>
          <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ backgroundColor: T.accentBg }}>
                {['Date', 'Description', 'Category', 'Job', 'Amount'].map(c => (
                  <th key={c} style={{ padding: '6px 9px', textAlign: c === 'Amount' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {MOCK_EXPENSES.slice(0, 3).map((exp, i) => {
                  const cc = CAT_COLORS[exp.category] || '#6b7280'
                  return (
                    <tr key={exp.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '6px 9px', fontSize: '10px', color: T.textMuted }}>{exp.date}</td>
                      <td style={{ padding: '6px 9px', fontSize: '10px', color: T.text, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</td>
                      <td style={{ padding: '6px 9px' }}><span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '9px', backgroundColor: cc + '18', color: cc }}>{exp.category}</span></td>
                      <td style={{ padding: '6px 9px', fontSize: '9px', color: exp.job ? T.accent : T.textMuted }}>{exp.job || '—'}</td>
                      <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '600', color: '#ef4444', textAlign: 'right' }}>−${exp.amount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ocr / approve / allocate / reimburse: receipt form card */}
      {showReceiptForm && (
        <motion.div key={scene} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Dougie analyzing banner — only for ocr */}
          {scene === 'ocr' && (
            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Camera size={13} style={{ color: '#3b82f6' }} />
              <span style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '500' }}>Dougie reading receipt… vendor, amount, line items auto-filling</span>
            </div>
          )}

          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Receipt preview */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ width: '54px', height: '68px', borderRadius: '6px', backgroundColor: T.bg, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Receipt size={20} style={{ color: T.textMuted }} />
              </div>
              <div style={{ flex: 1 }}>
                {[
                  { label: 'Vendor',  value: 'Home Depot', filled: true },
                  { label: 'Date',    value: 'Jun 8, 2026', filled: true },
                  { label: 'Total',   value: '$847.32',     filled: scene !== 'ocr' },
                  { label: 'Tax',     value: '$71.83',      filled: scene !== 'ocr' },
                ].map(f => (
                  <div key={f.label} style={{ display: 'flex', gap: '6px', marginBottom: '4px', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', color: T.textMuted, width: '40px', flexShrink: 0 }}>{f.label}</span>
                    <span style={{ fontSize: '10px', color: f.filled ? T.text : T.textMuted, fontWeight: f.filled ? '500' : '400' }}>{f.filled ? f.value : '…'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI category chip — approve, allocate, reimburse */}
            {(scene === 'approve' || scene === 'allocate' || scene === 'reimburse') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', backgroundColor: '#f97316' + '10', border: '1px solid #f97316' + '40', borderRadius: '7px' }}>
                <Tag size={11} style={{ color: '#f97316' }} />
                <span style={{ fontSize: '10px', fontWeight: '600', color: '#f97316' }}>Materials</span>
                <span style={{ fontSize: '9px', color: T.textMuted }}>92% confidence</span>
                {scene === 'approve' && (
                  <button style={{ marginLeft: 'auto', padding: '3px 10px', border: 'none', borderRadius: '5px', backgroundColor: '#22c55e', color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <CheckCircle size={9} />Approve
                  </button>
                )}
              </div>
            )}

            {/* Job allocation — allocate, reimburse */}
            {(scene === 'allocate' || scene === 'reimburse') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', backgroundColor: scene === 'allocate' ? T.accentBg : T.bg, border: `1px solid ${scene === 'allocate' ? T.accent : T.border}`, borderRadius: '7px' }}>
                <Briefcase size={11} style={{ color: scene === 'allocate' ? T.accent : T.textMuted }} />
                <span style={{ fontSize: '10px', color: T.text }}>Allocate to job:</span>
                <span style={{ fontSize: '10px', fontWeight: '600', color: T.accent }}>JOB-2147 — Northbridge LED</span>
              </div>
            )}

            {/* Reimbursable toggle — reimburse */}
            {scene === 'reimburse' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '7px' }}>
                <ToggleRight size={16} style={{ color: '#22c55e' }} />
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>Flag as reimbursable</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Appears in payroll inbox → paid on next paycheck</div>
                </div>
              </div>
            )}

            <button style={{ padding: '8px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
              Save Expense
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    snap:     '1 · Snap a receipt — photo uploads via Field Scout, lands in Expenses',
    ocr:      '2 · Dougie reads it — vendor, amount, tax, line items auto-fill in 2 seconds',
    approve:  '3 · AI tags "Materials" at 92% confidence — tech taps Approve',
    allocate: '4 · Allocate to a job — expense rolls into that job\'s cost-of-goods',
    reimburse:'5 · Flag as reimbursable — owner pays it back through payroll on next check',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Expenses tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
