// Plaid Bank Sync walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Books.jsx (Plaid integration section) + plaid-sync knowledge card.
// DO NOT import ZachShell — shows Plaid connect flow + AI categorization.

import { motion, AnimatePresence } from 'framer-motion'
import { Landmark, Plus, CheckCircle, Sparkles, RefreshCw, AlertCircle } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/plaid-sync.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const PLAID_BLUE = '#0a85ed'

const MOCK_ACCOUNTS = [
  { id: 1, bank: 'Chase Bank',        type: 'Checking',  balance: 84200, last_sync: 'Jun 9 · 6:02 AM', status: 'connected' },
  { id: 2, bank: 'Wells Fargo',       type: 'Savings',   balance: 42800, last_sync: 'Jun 9 · 6:02 AM', status: 'connected' },
  { id: 3, bank: 'Amex Business',     type: 'Credit',    balance: -8420, last_sync: 'Jun 9 · 6:02 AM', status: 'connected' },
]

const MOCK_TXNS = [
  { id: 1, name: 'Home Depot #1042',  amount: -847.32, ai_category: 'Materials',      confidence: 0.97, confirmed: true  },
  { id: 2, name: 'Shell Gas Station', amount: -124.50, ai_category: 'Vehicle — Fuel', confidence: 0.91, confirmed: false },
  { id: 3, name: 'ACH Deposit',       amount: 18200,   ai_category: 'Income',         confidence: 0.88, confirmed: false },
]

export default function PlaidSyncWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Bank feeds live, books clean." />}
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
          <Landmark size={15} style={{ color: PLAID_BLUE }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Plaid Bank Sync</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: PLAID_BLUE, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Connect Bank
        </button>
      </div>

      {/* Plaid OAuth modal (connect scene) */}
      {scene === 'connect' && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          style={{ backgroundColor: T.bgCard, border: `2px solid ${PLAID_BLUE}`, borderRadius: '12px', padding: '16px', textAlign: 'center' }}
        >
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: PLAID_BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <Landmark size={20} color="#fff" />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: T.text, marginBottom: '4px' }}>Connect your bank</div>
          <div style={{ fontSize: '10px', color: T.textMuted, marginBottom: '12px' }}>Plaid connects to 12,000+ banks — search yours</div>
          <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bg, fontSize: '10px', color: T.textMuted, marginBottom: '10px', textAlign: 'left' }}>
            Search: Chase, Wells Fargo, Bank of America…
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['Chase', 'Wells Fargo', 'Amex'].map(bank => (
              <div key={bank} style={{ flex: 1, padding: '8px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, textAlign: 'center', fontSize: '9px', color: T.text, cursor: 'pointer' }}>{bank}</div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '9px', color: T.textMuted }}>256-bit encryption · OAuth 2.0 · read-only access</div>
        </motion.div>
      )}

      {/* Connected accounts */}
      {(scene === 'accounts' || scene === 'categorize' || scene === 'learn') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {MOCK_ACCOUNTS.map((acc, i) => (
            <motion.div key={acc.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: PLAID_BLUE + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Landmark size={13} style={{ color: PLAID_BLUE }} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{acc.bank} · {acc.type}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <RefreshCw size={8} />{acc.last_sync}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: acc.balance < 0 ? '#ef4444' : '#22c55e' }}>
                  {acc.balance < 0 ? '−' : '+'}${Math.abs(acc.balance).toLocaleString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', fontSize: '9px', color: '#22c55e' }}>
                  <CheckCircle size={8} />connected
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* AI categorization */}
      {(scene === 'categorize' || scene === 'learn') && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <Sparkles size={12} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#7c3aed' }}>AI categorized {MOCK_TXNS.length} new transactions</span>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '8px', border: `1px solid ${T.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ backgroundColor: T.accentBg }}>
                {['Merchant', 'Amount', 'AI Category', '✓'].map(c => (
                  <th key={c} style={{ padding: '6px 8px', textAlign: c === 'Amount' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {MOCK_TXNS.map(txn => (
                  <tr key={txn.id} style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: txn.confirmed ? 'transparent' : 'rgba(234,179,8,0.03)' }}>
                    <td style={{ padding: '6px 8px', fontSize: '10px', color: T.text }}>{txn.name}</td>
                    <td style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '600', textAlign: 'right', color: txn.amount > 0 ? '#22c55e' : '#ef4444' }}>
                      {txn.amount > 0 ? '+' : ''}{txn.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: T.accentBg, color: T.accent, fontWeight: '500' }}>{txn.ai_category}</span>
                      <span style={{ marginLeft: '4px', fontSize: '9px', color: T.textMuted }}>{Math.round(txn.confidence * 100)}%</span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {txn.confirmed ? <CheckCircle size={11} style={{ color: '#22c55e' }} /> : <div style={{ width: '11px', height: '11px', borderRadius: '3px', border: `1.5px solid ${T.border}`, cursor: 'pointer' }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {scene === 'learn' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <CheckCircle size={12} style={{ color: '#16a34a' }} />
          <span style={{ fontSize: '10px', color: '#15803d' }}>Rule saved — "Home Depot" will auto-categorize as Materials from now on.</span>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    connect:    '1 · Plaid OAuth — search your bank, connect in 30 seconds, read-only access',
    accounts:   '2 · Connected accounts show bank name, type, live balance, last sync time',
    categorize: '3 · AI auto-categorizes every imported transaction with a confidence score',
    confirm:    '4 · Confirm = accept AI category · edit to correct it — teaches the rule engine',
    learn:      '5 · Rule saved — "Home Depot" auto-categorizes as Materials from now on',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Plaid Bank Sync works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
