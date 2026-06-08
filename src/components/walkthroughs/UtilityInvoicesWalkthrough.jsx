// Utility Invoices walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/UtilityInvoices.jsx — utility rebate tracking.
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Plus, Search, Zap, Pencil, Trash2 } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/utility-invoices.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_UTILITY_INVOICES = [
  { id: 1, customer_name: 'Northbridge Logistics', utility_name: 'RMP Wattsmart', project_cost: 24500, incentive_amount: 8400, net_cost: 16100, payment_status: 'Pending', date: 'Jun 5', job_id: 'JOB-041' },
  { id: 2, customer_name: 'Solera Electric HQ',    utility_name: 'SRP Solutions',  project_cost: 18200, incentive_amount: 5900, net_cost: 12300, payment_status: 'Received',date: 'Jun 2', job_id: 'JOB-038' },
  { id: 3, customer_name: 'Apex Solar Warehouse',  utility_name: 'APS Bright',     project_cost: 42800, incentive_amount: 14800,net_cost: 28000, payment_status: 'Received',date: 'May 28',job_id: 'JOB-035' },
  { id: 4, customer_name: 'City Storage Units',    utility_name: 'RMP Wattsmart',  project_cost: 12000, incentive_amount: 0,    net_cost: 12000, payment_status: 'Pending', date: 'May 24',job_id: 'JOB-032' },
]

export default function UtilityInvoicesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Utility incentives tracked." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const invoices = scene === 'empty' ? [] : MOCK_UTILITY_INVOICES

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Utility Invoices</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={10} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input readOnly placeholder="Search..." style={{ padding: '4px 6px 4px 18px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '9px', backgroundColor: T.bgCard, color: T.text, outline: 'none', width: '80px' }} />
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={11} />New Bill
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        {[
          { label: 'Total Incentives', value: '$29,100', color: '#d4940a' },
          { label: 'Received',         value: '$20,700', color: '#22c55e' },
          { label: 'Pending',          value: '$8,400',  color: '#c28b38' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Invoices */}
      {invoices.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <FileText size={32} style={{ color: T.textMuted, marginBottom: '8px', opacity: 0.5 }} />
          <p style={{ color: T.textSecondary, fontSize: '11px', margin: 0 }}>No utility bills found. Add your first bill.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto' }}>
          {invoices.map((inv, i) => (
            <motion.div key={inv.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{inv.customer_name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{inv.utility_name} · {inv.job_id} · {inv.date}</div>
                </div>
                <div style={{ display: 'flex', gap: '3px' }}>
                  <button style={{ padding: '3px', border: 'none', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: T.textMuted }}><Pencil size={10} /></button>
                  <button style={{ padding: '3px', border: 'none', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', color: T.textMuted }}><Trash2 size={10} /></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Project Cost</div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>${inv.project_cost.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Incentive</div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#d4940a' }}>{inv.incentive_amount > 0 ? `$${inv.incentive_amount.toLocaleString()}` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Net Cost</div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>${inv.net_cost.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: '5px', display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: inv.payment_status === 'Received' ? 'rgba(34,197,94,0.12)' : 'rgba(194,139,56,0.12)', color: inv.payment_status === 'Received' ? '#22c55e' : '#c28b38' }}>{inv.payment_status}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:    '1 · Utility Invoices — track rebates from utilities per project',
    list:     '2 · Each record: customer, utility, Job ID, Project Cost, Incentive (amber), Net Cost',
    received: '3 · Payment Status: Received (green) vs Pending (amber) — tracks cash flow from utilities',
    detail:   '4 · Open any record → invoice detail with materials/labor split and rebate math',
    books:    '5 · Received incentives flow into Books as income; pending = receivable',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Utility Invoices work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
