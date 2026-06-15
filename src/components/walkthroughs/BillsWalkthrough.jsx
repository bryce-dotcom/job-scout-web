// Bills walkthrough — AP management: list, detail, payment, aging report.
// Source: src/lib/featureKnowledge/bills.js

import { motion, AnimatePresence } from 'framer-motion'
import { FileText, DollarSign, AlertTriangle, BarChart2, ChevronDown, Download, CreditCard, CheckCircle, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/bills.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const STATUS_STYLES = {
  'Open':            { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Partially Paid':  { bg: 'rgba(234,179,8,0.12)',   text: '#c28b38' },
  'Paid':            { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  'Overdue':         { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444' },
}

const MOCK_BILLS = [
  { id: 1, vendor: 'Phoenix Supply Co',      bill: 'INV-8823', due: 'May 28, 2026', total: 2840,  balance: 2840,  status: 'Overdue',        job: 'JOB-041' },
  { id: 2, vendor: 'Desert Electric Supply', bill: 'INV-3312', due: 'May 15, 2026', total: 1150,  balance: 1150,  status: 'Overdue',        job: 'JOB-038' },
  { id: 3, vendor: 'Sunbelt Rentals',        bill: 'INV-7744', due: 'Jun 20, 2026', total: 4200,  balance: 4200,  status: 'Open',           job: 'JOB-044' },
  { id: 4, vendor: 'Interstate Lighting',    bill: 'INV-5501', due: 'Jun 25, 2026', total: 6800,  balance: 3400,  status: 'Partially Paid', job: 'JOB-039' },
  { id: 5, vendor: 'Ace Hardware — PHX',     bill: 'INV-2209', due: 'Jun 30, 2026', total: 312,   balance: 312,   status: 'Open',           job: 'JOB-042' },
  { id: 6, vendor: 'Phoenix Supply Co',      bill: 'INV-8701', due: 'Jun 18, 2026', total: 1920,  balance: 1920,  status: 'Open',           job: 'JOB-043' },
  { id: 7, vendor: 'Desert Electric Supply', bill: 'INV-3280', due: 'May 30, 2026', total: 780,   balance: 0,     status: 'Paid',           job: 'JOB-037' },
  { id: 8, vendor: 'Sunbelt Rentals',        bill: 'INV-7601', due: 'Jun 10, 2026', total: 2200,  balance: 2200,  status: 'Open',           job: 'JOB-040' },
]

const BILL_LINE_ITEMS = [
  { product: '4ft LED Tube T8 — 14W',    qty: 48,  unit: 12.50,  total: 600.00  },
  { product: 'LED Retrofit Kit 2x4',      qty: 24,  unit: 68.00,  total: 1632.00 },
  { product: 'Ballast Bypass Wire Set',   qty: 60,  unit: 10.13,  total: 608.00  },
]

const AGING_VENDORS = [
  { vendor: 'Phoenix Supply Co',      current: 1920,  d30: 2840,  d60: 0,    d60p: 0,   total: 4760  },
  { vendor: 'Desert Electric Supply', current: 0,     d30: 1150,  d60: 780,  d60p: 0,   total: 1930  },
  { vendor: 'Sunbelt Rentals',        current: 2200,  d30: 4200,  d60: 0,    d60p: 0,   total: 6400  },
  { vendor: 'Interstate Lighting',    current: 3400,  d30: 3400,  d60: 0,    d60p: 0,   total: 6800  },
  { vendor: 'Ace Hardware — PHX',     current: 312,   d30: 0,     d60: 0,    d60p: 0,   total: 312   },
]

const AGING_TOTALS = { current: 7832, d30: 11590, d60: 780, d60p: 0, total: 20202 }

export default function BillsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="AP under control." />}
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
      {scene === 'list' && <SceneList />}
      {scene === 'bill' && <SceneBill />}
      {scene === 'pay'  && <ScenePay />}
      {scene === 'aging' && <SceneAging />}
    </div>
  )
}

function SceneList() {
  const agingBuckets = [
    { label: 'Current', amount: 12000, color: '#22c55e', pct: 43 },
    { label: '1–30',    amount: 8000,  color: '#c28b38', pct: 29 },
    { label: '31–60',   amount: 5000,  color: '#ef4444', pct: 18 },
    { label: '60+',     amount: 3000,  color: '#7f1d1d', pct: 11 },
  ]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Bills</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>Accounts Payable</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textSecondary }}>
            All Statuses <ChevronDown size={9} style={{ color: T.textMuted }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textSecondary }}>
            All Vendors <ChevronDown size={9} style={{ color: T.textMuted }} />
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer', fontWeight: '600' }}>
            + New Bill
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', flexShrink: 0 }}>
        {agingBuckets.map(b => (
          <div key={b.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px', borderTop: `3px solid ${b.color}` }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: b.color }}>${(b.amount / 1000).toFixed(0)}k</div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '1px' }}>{b.label} days</div>
            <div style={{ marginTop: '5px', height: '3px', backgroundColor: `${b.color}22`, borderRadius: '2px' }}>
              <div style={{ height: '100%', width: `${b.pct}%`, backgroundColor: b.color, borderRadius: '2px' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Vendor', 'Bill #', 'Due Date', 'Total', 'Balance Due', 'Status', 'Job'].map(col => (
                <th key={col} style={{ padding: '5px 8px', textAlign: ['Total', 'Balance Due'].includes(col) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_BILLS.map((bill, i) => {
              const ss = STATUS_STYLES[bill.status]
              const overdue = bill.status === 'Overdue'
              return (
                <motion.tr key={bill.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: overdue ? 'rgba(239,68,68,0.04)' : 'transparent', cursor: 'pointer' }}>
                  <td style={{ padding: '5px 8px', fontSize: '10px', fontWeight: '500', color: overdue ? '#ef4444' : T.text, whiteSpace: 'nowrap' }}>
                    {overdue && <AlertTriangle size={9} style={{ color: '#ef4444', marginRight: '3px', display: 'inline', verticalAlign: 'middle' }} />}
                    {bill.vendor}
                  </td>
                  <td style={{ padding: '5px 8px', fontSize: '9px', color: T.textSecondary, fontFamily: 'monospace' }}>{bill.bill}</td>
                  <td style={{ padding: '5px 8px', fontSize: '9px', color: overdue ? '#ef4444' : T.textMuted, fontWeight: overdue ? '600' : '400' }}>{bill.due}</td>
                  <td style={{ padding: '5px 8px', fontSize: '10px', color: T.text, textAlign: 'right', fontWeight: '600' }}>${bill.total.toLocaleString()}</td>
                  <td style={{ padding: '5px 8px', fontSize: '10px', color: bill.balance > 0 ? T.text : T.textMuted, textAlign: 'right', fontWeight: bill.balance > 0 ? '700' : '400' }}>{bill.balance > 0 ? `$${bill.balance.toLocaleString()}` : '—'}</td>
                  <td style={{ padding: '5px 8px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: ss.bg, color: ss.text, whiteSpace: 'nowrap' }}>{bill.status}</span>
                  </td>
                  <td style={{ padding: '5px 8px', fontSize: '9px', color: T.accent, fontWeight: '500' }}>{bill.job}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SceneBill() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Phoenix Supply Co</span>
          <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '700', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>OVERDUE</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>
            Link to Job
          </button>
          <button style={{ padding: '5px 12px', border: 'none', borderRadius: '5px', backgroundColor: '#ef4444', color: '#fff', fontSize: '10px', cursor: 'pointer', fontWeight: '600' }}>
            Pay Now
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', flexShrink: 0 }}>
        {[
          ['Bill #', 'INV-8823'],
          ['Vendor', 'Phoenix Supply Co'],
          ['Received', 'May 14, 2026'],
          ['Due Date', 'May 28, 2026 — OVERDUE'],
          ['Linked Job', 'JOB-041 — Chandler Warehouse'],
          ['Total', '$2,840.00'],
        ].map(([l, v]) => (
          <div key={l} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: T.textMuted }}>{l}</span>
            <span style={{ fontSize: '10px', fontWeight: '600', color: v.includes('OVERDUE') ? '#ef4444' : v.startsWith('$') ? '#2c3530' : T.text }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px' }}>
        <div style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Line Items</span>
          <span style={{ fontSize: '9px', color: T.textMuted }}>Linked to JOB-041</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Product', 'Qty', 'Unit Cost', 'Total'].map(col => (
                <th key={col} style={{ padding: '5px 10px', textAlign: ['Qty', 'Unit Cost', 'Total'].includes(col) ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BILL_LINE_ITEMS.map((item, i) => (
              <motion.tr key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '7px 10px', fontSize: '10px', color: T.text }}>{item.product}</td>
                <td style={{ padding: '7px 10px', fontSize: '10px', color: T.textSecondary, textAlign: 'right' }}>{item.qty}</td>
                <td style={{ padding: '7px 10px', fontSize: '10px', color: T.textSecondary, textAlign: 'right' }}>${item.unit.toFixed(2)}</td>
                <td style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '600', color: T.text, textAlign: 'right' }}>${item.total.toFixed(2)}</td>
              </motion.tr>
            ))}
            <tr style={{ backgroundColor: T.accentBg }}>
              <td colSpan={3} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: T.text }}>Total</td>
              <td style={{ padding: '7px 10px', fontSize: '11px', fontWeight: '700', color: T.text, textAlign: 'right' }}>$2,840.00</td>
            </tr>
          </tbody>
        </table>
        <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600' }}>Balance Due: $2,840.00 — 15 days past due</span>
        </div>
      </div>
    </>
  )
}

function ScenePay() {
  const methods = ['Check #', 'ACH', 'Credit Card', 'Zelle']
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <DollarSign size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Record Payment</span>
        <span style={{ fontSize: '9px', color: T.textMuted }}>INV-8823 · Phoenix Supply Co</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: T.textMuted, marginBottom: '6px' }}>Bill Summary</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Phoenix Supply Co — INV-8823</div>
            <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600' }}>OVERDUE · Due May 28, 2026</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>$2,840.00</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>balance due</div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>AMOUNT TO PAY</div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <div style={{ flex: 1, padding: '6px 9px', border: `2px solid ${T.accent}`, borderRadius: '5px', backgroundColor: T.accentBg, fontSize: '12px', fontWeight: '700', color: T.accent, textAlign: 'center' }}>$2,840.00</div>
              <div style={{ padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '9px', color: T.textMuted, cursor: 'pointer' }}>Partial</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>PAYMENT DATE</div>
            <div style={{ padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', color: T.text, backgroundColor: T.bgCard }}>Jun 12, 2026</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>PAYMENT METHOD</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {methods.map((m, i) => (
                <div key={m} style={{ padding: '5px 7px', border: `1px solid ${i === 1 ? T.accent : T.border}`, borderRadius: '5px', fontSize: '9px', fontWeight: i === 1 ? '600' : '400', color: i === 1 ? T.accent : T.textSecondary, backgroundColor: i === 1 ? T.accentBg : T.bgCard, cursor: 'pointer', textAlign: 'center' }}>{m}</div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>BANK ACCOUNT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', color: T.text, backgroundColor: T.bgCard }}>
              <CreditCard size={10} style={{ color: T.textMuted }} />
              Operating ····1482
              <ChevronDown size={9} style={{ color: T.textMuted, marginLeft: 'auto' }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: '9px', color: T.accent, cursor: 'pointer', textDecoration: 'underline', fontWeight: '500' }}>Pay Multiple Bills at Once</div>
          <div style={{ flex: 1 }} />
          <button style={{ padding: '7px 20px', border: 'none', borderRadius: '6px', backgroundColor: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle size={11} />
            Mark Paid · $2,840
          </button>
        </div>
      </motion.div>
    </>
  )
}

function SceneAging() {
  const barMax = 8000
  const bucketColors = ['#22c55e', '#c28b38', '#ef4444', '#7f1d1d']
  const bucketLabels = ['Current', '1–30', '31–60', '60+']
  const bucketAmounts = [AGING_TOTALS.current, AGING_TOTALS.d30, AGING_TOTALS.d60, AGING_TOTALS.d60p]

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>AP Aging Report</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, color: T.textSecondary, fontSize: '9px', cursor: 'pointer' }}>
            <Download size={9} />Export CSV
          </button>
          <button style={{ padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>
            Pay All Overdue
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'flex-end', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px', height: '70px' }}>
        {bucketAmounts.map((amt, i) => {
          const pct = Math.max((amt / barMax) * 100, amt > 0 ? 8 : 0)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: '3px' }}>
              <span style={{ fontSize: '8px', fontWeight: '700', color: bucketColors[i] }}>${(amt / 1000).toFixed(1)}k</span>
              <motion.div initial={{ height: 0 }} animate={{ height: `${pct}%` }} transition={{ delay: i * 0.07, duration: 0.4 }}
                style={{ width: '100%', backgroundColor: bucketColors[i], borderRadius: '3px 3px 0 0', minHeight: amt > 0 ? '4px' : '0' }} />
              <span style={{ fontSize: '8px', color: T.textMuted }}>{bucketLabels[i]}</span>
            </div>
          )
        })}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Vendor', 'Current', '1–30 Days', '31–60 Days', '60+ Days', 'Total'].map(col => (
                <th key={col} style={{ padding: '5px 9px', textAlign: col === 'Vendor' ? 'left' : 'right', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AGING_VENDORS.map((v, i) => (
              <motion.tr key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
                <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '500', color: T.text, whiteSpace: 'nowrap' }}>{v.vendor}</td>
                <td style={{ padding: '6px 9px', fontSize: '10px', color: v.current > 0 ? '#22c55e' : T.textMuted, textAlign: 'right', fontWeight: v.current > 0 ? '600' : '400' }}>{v.current > 0 ? `$${v.current.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '6px 9px', fontSize: '10px', color: v.d30 > 0 ? '#c28b38' : T.textMuted, textAlign: 'right', fontWeight: v.d30 > 0 ? '600' : '400' }}>{v.d30 > 0 ? `$${v.d30.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '6px 9px', fontSize: '10px', color: v.d60 > 0 ? '#ef4444' : T.textMuted, textAlign: 'right', fontWeight: v.d60 > 0 ? '600' : '400' }}>{v.d60 > 0 ? `$${v.d60.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '6px 9px', fontSize: '10px', color: v.d60p > 0 ? '#7f1d1d' : T.textMuted, textAlign: 'right', fontWeight: v.d60p > 0 ? '600' : '400' }}>{v.d60p > 0 ? `$${v.d60p.toLocaleString()}` : '—'}</td>
                <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: T.text, textAlign: 'right' }}>${v.total.toLocaleString()}</td>
              </motion.tr>
            ))}
            <tr style={{ backgroundColor: T.accentBg, borderTop: `2px solid ${T.border}` }}>
              <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: T.text }}>Totals</td>
              <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: '#22c55e', textAlign: 'right' }}>${AGING_TOTALS.current.toLocaleString()}</td>
              <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: '#c28b38', textAlign: 'right' }}>${AGING_TOTALS.d30.toLocaleString()}</td>
              <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: '#ef4444', textAlign: 'right' }}>${AGING_TOTALS.d60.toLocaleString()}</td>
              <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: '#7f1d1d', textAlign: 'right' }}>{AGING_TOTALS.d60p > 0 ? `$${AGING_TOTALS.d60p.toLocaleString()}` : '—'}</td>
              <td style={{ padding: '6px 9px', fontSize: '11px', fontWeight: '700', color: T.text, textAlign: 'right' }}>${AGING_TOTALS.total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:  '1 · Bills list — AP aging bar shows $28k across buckets; overdue rows highlighted in red',
    bill:  '2 · Bill detail — INV-8823 overdue $2,840 from Phoenix Supply, 3 line items linked to JOB-041',
    pay:   '3 · Record Payment — full or partial, choose method (ACH selected), one-click Mark Paid',
    aging: '4 · AP Aging report — by vendor with bar chart; Pay All Overdue quick action at top',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Bills work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
