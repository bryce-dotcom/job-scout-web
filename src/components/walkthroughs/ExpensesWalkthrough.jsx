// Expenses walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Expenses.jsx (manual expenses) + Books.jsx (transaction expenses)
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, Plus, Camera, X, Upload, Download } from 'lucide-react'
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
  const showModal = scene === 'add'
  const expenses = scene === 'empty' ? [] : MOCK_EXPENSES

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Receipt size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Expenses</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.accent, fontSize: '10px', cursor: 'pointer' }}>
            <Upload size={10} />Import
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={11} />Add Expense
          </button>
        </div>
      </div>

      {/* Expense table */}
      {expenses.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <Receipt size={36} style={{ color: T.textMuted, marginBottom: '10px', opacity: 0.5 }} />
          <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No expenses yet. Add your first expense.</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: T.accentBg }}>
                {['Date', 'Description', 'Vendor', 'Category', 'Job', 'Amount', 'Rcpt'].map(col => (
                  <th key={col} style={{ padding: '7px 9px', textAlign: col === 'Amount' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp, i) => {
                const catColor = CAT_COLORS[exp.category] || '#6b7280'
                return (
                  <motion.tr key={exp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                    style={{ borderBottom: `1px solid ${T.border}` }}
                  >
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: T.textMuted }}>{exp.date}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: T.text, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</td>
                    <td style={{ padding: '7px 9px', fontSize: '9px', color: T.textSecondary }}>{exp.vendor}</td>
                    <td style={{ padding: '7px 9px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '500', backgroundColor: catColor + '18', color: catColor }}>{exp.category}</span>
                    </td>
                    <td style={{ padding: '7px 9px', fontSize: '9px', color: exp.job ? T.accent : T.textMuted }}>{exp.job || '—'}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', fontWeight: '600', color: '#ef4444', textAlign: 'right' }}>−${exp.amount.toLocaleString()}</td>
                    <td style={{ padding: '7px 9px', textAlign: 'center' }}>
                      {exp.receipt ? <Camera size={11} style={{ color: T.accent }} /> : <span style={{ fontSize: '9px', color: T.textMuted }}>—</span>}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Expense modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96, y: -10 }} animate={{ scale: 1, y: 0 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Expense</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Description', 'LED fixtures — Northbridge'], ['Vendor', 'Home Depot'], ['Amount', '$847.32'], ['Category', 'Materials'], ['Job (optional)', 'JOB-041']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              {/* Receipt upload */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>Receipt</label>
                <div style={{ padding: '8px', border: `1px dashed ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <Camera size={12} style={{ color: T.textMuted }} />
                  <span style={{ fontSize: '10px', color: T.textMuted }}>Tap to attach receipt photo</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:   '1 · Expenses — table view, Add Expense, Import',
    add:     '2 · Add Expense modal — description, vendor, amount, category, job, receipt photo',
    table:   '3 · Expense table — date, category chip (colored), job link, receipt camera icon',
    receipt: '4 · Attach a receipt photo — camera capture lands in the expense record',
    report:  '5 · Expenses roll into Books → CPA Package for the accountant',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Expenses tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
