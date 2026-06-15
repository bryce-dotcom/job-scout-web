// Books walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Books.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Wallet, TrendingUp, TrendingDown, PiggyBank,
  AlertCircle, CheckCircle, CheckSquare, Download, CreditCard,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/books.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_TRANSACTIONS = [
  { id: 1, date: 'Jun 8', name: 'Home Depot #1042',       amount: -847.32, ai_category: 'Materials',     confirmed: true,  tax_cat: 'Line 26 - Materials' },
  { id: 2, date: 'Jun 7', name: 'Shell Gas Station',      amount: -124.50, ai_category: 'Vehicle — Fuel', confirmed: false, tax_cat: 'Line 20 - Auto expenses' },
  { id: 3, date: 'Jun 7', name: 'ACH Deposit',            amount: 18200.00,ai_category: 'Income',        confirmed: false, tax_cat: '' },
  { id: 4, date: 'Jun 6', name: 'Office Depot',           amount: -89.99,  ai_category: 'Office',        confirmed: true,  tax_cat: 'Line 20 - Office expenses' },
  { id: 5, date: 'Jun 5', name: 'Northbridge Invoice Pay',amount: 24500.00,ai_category: 'Income',        confirmed: true,  tax_cat: '' },
]

export default function BooksWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Books clean, CPA happy." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const isTransactionView = scene === 'transactions' || scene === 'edit'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={16} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Books</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: scene === 'export' ? T.accent : T.bgCard, fontSize: '10px', cursor: 'pointer', color: scene === 'export' ? '#fff' : T.textSecondary }}>
          <Download size={10} />Download CPA Package
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', backgroundColor: T.bg, padding: '3px', borderRadius: '8px', width: 'fit-content' }}>
        {['Overview', 'Transactions 2', 'Expenses', 'Tax Summary'].map((tab, i) => {
          const active = isTransactionView ? i === 1 : i === 0
          return (
            <button key={tab} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: active ? '600' : '400', backgroundColor: active ? T.bgCard : 'transparent', color: active ? T.text : T.textMuted, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              {tab === 'Transactions 2' ? <>Transactions<span style={{ marginLeft: '4px', padding: '1px 5px', borderRadius: '8px', backgroundColor: '#ef4444', color: '#fff', fontSize: '8px', fontWeight: '700' }}>2</span></> : tab}
            </button>
          )
        })}
      </div>

      {/* Overview / Reconcile */}
      {(scene === 'overview' || scene === 'reconcile') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { icon: Wallet,       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  label: 'Cash Available', value: '$84,200' },
              { icon: TrendingUp,   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Money In (MTD)', value: '$48,700' },
              { icon: TrendingDown, color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  label: 'Money Out (MTD)',value: '$12,400' },
              { icon: PiggyBank,    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  label: 'Net This Month', value: '$36,300' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <s.icon size={13} style={{ color: s.color }} />
                  </div>
                  <span style={{ fontSize: '9px', color: T.textMuted }}>{s.label}</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          {scene === 'reconcile' && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: '10px 12px', backgroundColor: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <AlertCircle size={13} style={{ color: '#eab308' }} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Income to reconcile</span>
              </div>
              <div style={{ fontSize: '10px', color: T.textSecondary, marginBottom: '8px' }}>2 bank deposits not matched to invoices. Blocks commission tracking until resolved.</div>
              {[
                { date: 'Jun 7', amount: '$18,200', label: 'ACH Deposit — no invoice match' },
                { date: 'Jun 5', amount: '$6,400',  label: 'ACH Deposit — no invoice match' },
              ].map(item => (
                <div key={item.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: T.bgCard, borderRadius: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: T.textSecondary }}>{item.date} · {item.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#22c55e' }}>{item.amount}</span>
                    <button style={{ padding: '2px 8px', border: 'none', borderRadius: '4px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>Match</button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </>
      )}

      {/* Transactions / Edit row */}
      {isTransactionView && (
        <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: T.accentBg }}>
                {['Date', 'Description', 'Amount', 'Category (AI)', 'Tax Line', '✓'].map(col => (
                  <th key={col} style={{ padding: '7px 10px', textAlign: col === 'Amount' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_TRANSACTIONS.map((txn, i) => {
                const isEditing = scene === 'edit' && i === 1
                return (
                  <motion.tr key={txn.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                    style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: isEditing ? 'rgba(90,99,73,0.08)' : txn.confirmed ? 'transparent' : 'rgba(234,179,8,0.04)', outline: isEditing ? `2px solid ${T.accent}` : 'none', outlineOffset: '-2px' }}
                  >
                    <td style={{ padding: '7px 10px', fontSize: '10px', color: T.textMuted }}>{txn.date}</td>
                    <td style={{ padding: '7px 10px', fontSize: '10px', color: T.text, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.name}</td>
                    <td style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '600', textAlign: 'right', color: txn.amount > 0 ? '#22c55e' : '#ef4444' }}>
                      {txn.amount > 0 ? '+' : ''}{txn.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {isEditing
                        ? <select style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', border: `1px solid ${T.accent}`, color: T.accent, backgroundColor: T.bgCard, outline: 'none' }}><option>Vehicle — Fuel</option></select>
                        : <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: T.accentBg, color: T.accent, fontWeight: '500' }}>{txn.ai_category}</span>}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: '9px', color: isEditing ? T.accent : T.textMuted, fontWeight: isEditing ? '600' : '400', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isEditing ? 'Line 20 — Auto expenses' : (txn.tax_cat || '—')}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      {txn.confirmed ? <CheckCircle size={12} style={{ color: '#22c55e' }} /> : <div style={{ width: '12px', height: '12px', borderRadius: '3px', border: `1.5px solid ${T.border}`, cursor: 'pointer' }} />}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Export panel */}
      {scene === 'export' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.text, marginBottom: '12px' }}>CPA Package — June 2026</div>
            {[
              { label: 'Profit & Loss Statement', file: 'PnL_Jun2026.xlsx',      size: '48 KB' },
              { label: 'Balance Sheet',           file: 'Balance_Jun2026.xlsx',  size: '32 KB' },
              { label: 'Trial Balance',           file: 'TrialBal_Jun2026.xlsx', size: '28 KB' },
              { label: 'Transaction Detail',      file: 'Txn_Jun2026.xlsx',      size: '124 KB' },
            ].map((f, i) => (
              <motion.div key={f.label} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 10px', borderRadius: '7px', border: `1px solid ${T.border}`, marginBottom: '6px', backgroundColor: T.bg }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{f.label}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{f.file} · {f.size}</div>
                </div>
                <button style={{ padding: '4px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Download size={9} />Download
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview:     '1 · Books Overview — Cash Available, Money In, Money Out, Net This Month',
    transactions: '2 · Transactions tab — Plaid feed with AI category suggestions + confirm checkbox',
    edit:         '3 · Edit row — pick category, map to IRS Form 1065 line, allocate to a job',
    reconcile:    '4 · Reconcile — match deposits to invoices, clear unmatched entries',
    export:       '5 · CPA Package — P&L, Balance Sheet, Trial Balance in one download',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to keep Books clean'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
