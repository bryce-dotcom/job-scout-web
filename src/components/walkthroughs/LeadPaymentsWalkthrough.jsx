// Lead Payments walkthrough — Deposits, partials, and full prepayments linked to estimates and invoices.
// Source: src/lib/featureKnowledge/lead-payments.js

import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, DollarSign, Link, CheckCircle, Copy, QrCode, Clock, FileText, Send, ChevronRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/lead-payments.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_PAYMENTS = [
  { id: 1, lead: 'Marcus Okafor',    amount: 2450,  type: 'Deposit',  status: 'Paid',     estimate: 'EST-041', date: 'Jun 9, 2026',  applied: 'INV-084' },
  { id: 2, lead: 'Sandra Lim',       amount: 500,   type: 'Deposit',  status: 'Paid',     estimate: 'EST-038', date: 'Jun 7, 2026',  applied: 'INV-081' },
  { id: 3, lead: 'Derek Vasquez',    amount: 18200, type: 'Full',     status: 'Paid',     estimate: 'EST-035', date: 'Jun 5, 2026',  applied: null },
  { id: 4, lead: 'Priya Nair',       amount: 800,   type: 'Partial',  status: 'Pending',  estimate: 'EST-044', date: 'Jun 10, 2026', applied: null },
  { id: 5, lead: 'Tom Brewer',       amount: 1200,  type: 'Deposit',  status: 'Refunded', estimate: 'EST-039', date: 'Jun 3, 2026',  applied: null },
  { id: 6, lead: 'Cassandra Flores', amount: 500,   type: 'Deposit',  status: 'Paid',     estimate: 'EST-047', date: 'Jun 11, 2026', applied: null },
]

const STATUS_STYLES = {
  'Paid':     { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  'Pending':  { bg: 'rgba(234,179,8,0.12)',   text: '#c28b38' },
  'Refunded': { bg: 'rgba(168,85,247,0.12)',  text: '#a855f7' },
}

const TYPE_STYLES = {
  'Deposit': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Partial': { bg: 'rgba(234,179,8,0.12)',  text: '#c28b38' },
  'Full':    { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
}

const STRIPE_LINK = 'https://pay.stripe.com/l/acct_1P3abc/job-scout/EST-041-dep'

const PAYMENT_HISTORY = [
  { date: 'Jun 9, 2026', method: 'Stripe link', amount: 500, type: 'Deposit', note: 'Sent via SMS' },
]

export default function LeadPaymentsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Deposit collected." />}
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
      {scene === 'create' && <SceneCreate />}
      {scene === 'stripe' && <SceneStripe />}
      {scene === 'applied' && <SceneApplied />}
    </div>
  )
}

function SceneList() {
  const totalCollected = MOCK_PAYMENTS.filter(p => p.status === 'Paid').reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CreditCard size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Lead Payments</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '10px', color: T.textMuted }}>Collected this month:</div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#22c55e' }}>${totalCollected.toLocaleString()}</div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <DollarSign size={10} />Collect
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px', flexShrink: 0 }}>
        {[
          { label: 'Paid', count: MOCK_PAYMENTS.filter(p => p.status === 'Paid').length, color: '#22c55e' },
          { label: 'Pending', count: MOCK_PAYMENTS.filter(p => p.status === 'Pending').length, color: '#c28b38' },
          { label: 'Refunded', count: MOCK_PAYMENTS.filter(p => p.status === 'Refunded').length, color: '#a855f7' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: T.textMuted }}>{s.label}</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: s.color }}>{s.count}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Lead / Customer', 'Amount', 'Type', 'Status', 'Linked Estimate', 'Date'].map(col => (
                <th key={col} style={{ padding: '6px 9px', textAlign: col === 'Amount' ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_PAYMENTS.map((p, i) => {
              const ss = STATUS_STYLES[p.status]
              const ts = TYPE_STYLES[p.type]
              return (
                <motion.tr key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '6px 9px', fontSize: '10px', color: T.text, fontWeight: '500' }}>
                    <div>{p.lead}</div>
                    {p.applied && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px', padding: '1px 5px', borderRadius: '4px', fontSize: '8px', backgroundColor: 'rgba(90,99,73,0.12)', color: T.accent }}>
                        <Link size={7} />Applied to {p.applied}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '6px 9px', fontSize: '10px', fontWeight: '700', color: p.status === 'Refunded' ? '#a855f7' : '#22c55e', textAlign: 'right' }}>
                    {p.status === 'Refunded' ? '−' : ''}${p.amount.toLocaleString()}
                  </td>
                  <td style={{ padding: '6px 9px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600', backgroundColor: ts.bg, color: ts.text }}>{p.type}</span>
                  </td>
                  <td style={{ padding: '6px 9px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: ss.bg, color: ss.text }}>{p.status}</span>
                  </td>
                  <td style={{ padding: '6px 9px', fontSize: '9px', color: T.accent, fontWeight: '500' }}>{p.estimate}</td>
                  <td style={{ padding: '6px 9px', fontSize: '9px', color: T.textMuted }}>{p.date}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SceneCreate() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <CreditCard size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Collect Deposit</span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '10px', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'auto' }}>

          <div style={{ padding: '8px 10px', backgroundColor: T.accentBg, borderRadius: '7px', fontSize: '10px', color: T.accent, fontWeight: '600' }}>
            Customer: Marcus Okafor
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
            <div>
              <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>AMOUNT</div>
              <div style={{ border: `1px solid ${T.accent}`, borderRadius: '6px', padding: '7px 10px', fontSize: '13px', fontWeight: '700', color: T.text, backgroundColor: T.bgCard }}>$500.00</div>
            </div>
            <div>
              <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>TYPE</div>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '7px 10px', fontSize: '10px', color: T.text, backgroundColor: T.bgCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Deposit <ChevronRight size={10} style={{ color: T.textMuted }} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>LINKED ESTIMATE</div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '7px 10px', fontSize: '10px', color: T.accent, fontWeight: '600', backgroundColor: T.bgCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>EST-041 — Lighting Retrofit · $24,500</span>
              <ChevronRight size={10} style={{ color: T.textMuted }} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '6px', fontWeight: '600' }}>PAYMENT METHOD</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Send Stripe link', sub: 'Customer pays online — card, ACH, Apple Pay', selected: true, icon: Send },
                { label: 'Mark as received (cash / check)', sub: 'Record a payment already collected', selected: false, icon: CheckCircle },
              ].map(opt => (
                <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: `1px solid ${opt.selected ? T.accent : T.border}`, borderRadius: '7px', backgroundColor: opt.selected ? T.accentBg : 'transparent', cursor: 'pointer' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `2px solid ${opt.selected ? T.accent : T.border}`, backgroundColor: opt.selected ? T.accent : 'transparent', flexShrink: 0 }} />
                  <opt.icon size={11} style={{ color: opt.selected ? T.accent : T.textMuted, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '600', color: opt.selected ? T.text : T.textSecondary }}>{opt.label}</div>
                    <div style={{ fontSize: '8px', color: T.textMuted }}>{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600' }}>NOTE (OPTIONAL)</div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: '6px', padding: '7px 10px', fontSize: '9px', color: T.textMuted, backgroundColor: T.bgCard, minHeight: '28px' }}>Deposit to hold install date — Jun 20</div>
          </div>

          <button style={{ padding: '9px', border: 'none', borderRadius: '7px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
            Generate Stripe Link
          </button>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ width: '140px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Estimate Summary</div>
          {[['EST-041', ''], ['Customer', 'Marcus Okafor'], ['Total', '$24,500'], ['Deposit', '$500'], ['Balance', '$24,000']].map(([l, v]) => (
            <div key={l} style={{ fontSize: '9px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`, paddingBottom: '5px' }}>
              {v ? (
                <>
                  <span style={{ color: T.textMuted }}>{l}</span>
                  <span style={{ color: T.text, fontWeight: '500' }}>{v}</span>
                </>
              ) : (
                <span style={{ color: T.accent, fontWeight: '600' }}>{l}</span>
              )}
            </div>
          ))}
          <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px' }}>Stripe link expires in 24h. Reminder sent by SMS + email.</div>
        </motion.div>
      </div>
    </>
  )
}

function SceneStripe() {
  const steps = [
    { label: 'Sent', done: true },
    { label: 'Opened', done: true },
    { label: 'Paid', done: false },
  ]

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <Send size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Stripe Payment Link</span>
        <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: 'rgba(234,179,8,0.12)', color: '#c28b38', fontWeight: '600' }}>Expires in 24h</span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '10px', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '9px', color: T.textMuted, fontWeight: '600' }}>PAYMENT LINK</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: `1px solid ${T.border}`, backgroundColor: '#f9f9f7', fontSize: '9px', color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {STRIPE_LINK}
              </div>
              <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, color: T.accent, fontSize: '9px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>
                <Copy size={10} />Copy
              </button>
            </div>
            <div style={{ padding: '8px 10px', backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '7px', fontSize: '9px', color: T.textSecondary }}>
              <span style={{ fontWeight: '600', color: '#22c55e' }}>Link sent</span> to bryce@northbridge.com via SMS and email
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '9px', color: T.textMuted, fontWeight: '600', marginBottom: '10px' }}>STATUS TRACKER</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
              {steps.map((s, i) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: s.done ? '#22c55e' : T.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.done ? <CheckCircle size={12} color="#fff" /> : <Clock size={11} color={T.textMuted} />}
                    </div>
                    <span style={{ fontSize: '8px', fontWeight: '600', color: s.done ? T.text : T.textMuted, whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ flex: 1, height: '2px', backgroundColor: steps[i + 1].done ? '#22c55e' : T.border, margin: '0 4px', marginBottom: '14px' }} />
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <QrCode size={40} style={{ color: T.accent, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>QR code for in-person</div>
              <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '2px' }}>Show on your phone or print. Customer scans to pay — no link needed.</div>
              <button style={{ marginTop: '6px', padding: '4px 10px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.accent, fontSize: '8px', cursor: 'pointer', fontWeight: '600' }}>Download QR</button>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ width: '130px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Payment Details</div>
          {[['Customer', 'Marcus Okafor'], ['Estimate', 'EST-041'], ['Amount', '$500.00'], ['Type', 'Deposit'], ['Created', 'Jun 9, 2026'], ['Expires', 'Jun 10, 2026']].map(([l, v]) => (
            <div key={l} style={{ fontSize: '9px', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${T.border}`, paddingBottom: '5px' }}>
              <span style={{ color: T.textMuted, fontSize: '8px' }}>{l}</span>
              <span style={{ color: T.text, fontWeight: '500' }}>{v}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </>
  )
}

function SceneApplied() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <FileText size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>INV-084</span>
        <span style={{ fontSize: '9px', color: T.textMuted }}>Marcus Okafor · EST-041</span>
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: 'rgba(234,179,8,0.12)', color: '#c28b38' }}>Partially Paid</span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '10px', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto' }}>
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: T.text }}>Invoice Lines</div>
            {[
              { desc: 'LED Fixture Replacement (42 units)', qty: '42', unit: '$320.00', total: '$13,440.00', type: 'item' },
              { desc: 'Installation Labor — 3 days', qty: '3', unit: '$1,800.00', total: '$5,400.00', type: 'item' },
              { desc: 'Ballast Disposal Fee', qty: '1', unit: '$450.00', total: '$450.00', type: 'item' },
              { desc: 'Material Markup (12%)', qty: '', unit: '', total: '$1,612.80', type: 'item' },
            ].map((line, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '9px' }}>
                <div style={{ flex: 1, color: T.text }}>{line.desc}</div>
                {line.qty && <div style={{ width: '30px', textAlign: 'right', color: T.textMuted }}>{line.qty}</div>}
                {line.unit && <div style={{ width: '60px', textAlign: 'right', color: T.textMuted }}>{line.unit}</div>}
                <div style={{ width: '70px', textAlign: 'right', color: T.text, fontWeight: '500' }}>{line.total}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '9px' }}>
              <span style={{ color: T.textMuted }}>Subtotal</span>
              <span style={{ color: T.text, fontWeight: '600' }}>$20,902.80</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '9px' }}>
              <span style={{ color: T.textMuted }}>Tax (8.5%)</span>
              <span style={{ color: T.text }}>$1,776.74</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700' }}>
              <span style={{ color: T.text }}>Invoice Total</span>
              <span style={{ color: T.text }}>$22,679.54</span>
            </div>
            <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid rgba(34,197,94,0.25)`, backgroundColor: 'rgba(34,197,94,0.06)', fontSize: '10px', fontWeight: '700' }}>
              <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle size={11} />Deposit Applied
              </span>
              <span style={{ color: '#22c55e' }}>−$500.00</span>
            </motion.div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', fontSize: '12px', fontWeight: '800' }}>
              <span style={{ color: T.text }}>Balance Due</span>
              <span style={{ color: T.text }}>$22,179.54</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: T.text }}>Payment History</div>
            {PAYMENT_HISTORY.map((ph, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', fontSize: '9px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={12} style={{ color: '#22c55e' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', color: T.text }}>{ph.type} — {ph.method}</div>
                    <div style={{ color: T.textMuted }}>{ph.date} · {ph.note}</div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#22c55e' }}>${ph.amount.toLocaleString()}.00</div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderTop: `1px dashed ${T.border}`, fontSize: '9px', color: T.textMuted }}>
              <button style={{ padding: '5px 12px', border: `1px dashed ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.accent, fontSize: '9px', cursor: 'pointer', fontWeight: '600' }}>+ Record Payment</button>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
          style={{ width: '130px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Balance Summary</div>
            {[['Invoice Total', '$22,679.54'], ['Deposit Paid', '−$500.00'], ['Balance Due', '$22,179.54']].map(([l, v], idx) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', borderBottom: `1px solid ${T.border}`, paddingBottom: '5px' }}>
                <span style={{ color: T.textMuted }}>{l}</span>
                <span style={{ color: idx === 2 ? T.text : idx === 1 ? '#22c55e' : T.textSecondary, fontWeight: idx === 2 ? '700' : '500' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Linked Estimate</div>
            <div style={{ fontSize: '9px', color: T.accent, fontWeight: '600' }}>EST-041</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>Lighting Retrofit</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>$24,500 quoted</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>Jun 9, 2026 signed</div>
          </div>
        </motion.div>
      </div>
    </>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:    '1 · Lead payments list — all deposits, partials, and full prepayments with applied-invoice badges',
    create:  '2 · Collect deposit — pre-filled customer, amount, type, and linked estimate · Send Stripe link or mark received',
    stripe:  '3 · Stripe link generated — sent via SMS + email · status tracker shows Sent → Opened → Paid · QR for in-person',
    applied: '4 · Invoice with deposit applied — green "Deposit Applied: −$500" line reduces balance due · payment history below',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Lead Payments work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
