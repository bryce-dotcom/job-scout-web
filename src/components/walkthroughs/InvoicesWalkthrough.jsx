// Invoices walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Invoices.jsx + src/lib/statusColors.js (invoiceStatusColors).
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Plus, Upload, Download, Settings, Search, Zap, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/invoices.js'

const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
}

// invoiceStatusColors from statusColors.js (exact values)
const STATUS_COLORS = {
  'Draft':          { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'Pending':        { bg: 'rgba(194,139,56,0.12)',  text: '#c28b38' },
  'Open':           { bg: 'rgba(194,139,56,0.12)',  text: '#c28b38' },
  'Partially Paid': { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Paid':           { bg: 'rgba(74,124,89,0.12)',   text: '#4a7c59' },
  'Overdue':        { bg: 'rgba(139,90,90,0.12)',   text: '#8b5a5a' },
  'Cancelled':      { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
}

const MOCK_INVOICES = [
  { id: 1, invoice_id: 'INV-0041', customer: 'Marcus Okafor',  business: 'Northbridge Logistics', desc: 'LED Retrofit — Northbridge',  amount: 24500, status: 'Open',    type: 'customer', date: 'Jun 5' },
  { id: 2, invoice_id: 'INV-0038', customer: 'Sarah Chen',     business: 'Cypress Roofing',       desc: 'Fleet Wrap Package',         amount: 18200, status: 'Paid',    type: 'customer', date: 'Jun 2' },
  { id: 3, invoice_id: 'UTL-SRP1', customer: 'Northbridge',    business: 'SRP Rebate Program',    desc: 'LED Retrofit Incentive',     amount: 8400,  status: 'Pending', type: 'utility',  date: 'Jun 1' },
  { id: 4, invoice_id: 'INV-0035', customer: 'David Kim',      business: 'Solera Electric',       desc: 'Parking Lot LED',            amount: 12000, status: 'Overdue', type: 'customer', date: 'May 29' },
  { id: 5, invoice_id: 'INV-0032', customer: 'Jennifer Walsh', business: null,                    desc: 'Office Lighting Audit',      amount: 18200, status: 'Paid',    type: 'customer', date: 'May 24' },
]

export default function InvoicesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your invoices are out the door." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const filterActive = scene === 'overdue'
  const showAll = scene === 'grid' || scene === 'filter' || scene === 'send'

  const visibleInvoices = filterActive
    ? MOCK_INVOICES.filter(i => i.status === 'Overdue' || i.status === 'Open')
    : MOCK_INVOICES

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, overflow: 'hidden' }}>
      {/* PageHeader */}
      <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Invoices</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', backgroundColor: T.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={11} />New Invoice
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', backgroundColor: 'transparent', color: T.accent, border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}>
            <Zap size={11} />New Utility
          </button>
          <button style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textSecondary, cursor: 'pointer' }}><Settings size={11} /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Type filter tabs */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: T.bg, padding: '3px', borderRadius: '8px', width: 'fit-content' }}>
          {['All Invoices', 'Customer', 'Utility Incentives'].map((label, i) => (
            <button key={label} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: i === 0 ? '600' : '400', backgroundColor: i === 0 ? T.bgCard : 'transparent', color: i === 0 ? T.text : T.textMuted, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: i === 0 ? '0 1px 3px rgba(0,0,0,0.07)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Due date chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { label: 'Overdue',       count: 1, color: '#ef4444', active: filterActive },
            { label: 'Due in 7 days', count: 2, color: '#eab308', active: false },
            { label: 'Card on File',  count: 3, color: '#22c55e', active: false },
          ].map(chip => (
            <button key={chip.label} style={{
              padding: '4px 10px', borderRadius: '18px', fontSize: '10px', fontWeight: chip.active ? '600' : '500',
              backgroundColor: chip.active ? chip.color : T.bgCard, color: chip.active ? '#fff' : T.text,
              border: `1px solid ${chip.active ? chip.color : T.border}`,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              {chip.label}
              <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 600, backgroundColor: chip.active ? 'rgba(255,255,255,0.25)' : T.accentBg, color: chip.active ? '#fff' : T.accent }}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {[
            { label: 'Draft',   value: '1',       color: '#6b7280' },
            { label: 'Open',    value: '2',       color: '#c28b38' },
            { label: 'Overdue', value: '1',       color: '#8b5a5a' },
            { label: 'Paid',    value: '$42,700', color: '#4a7c59' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: T.bgCard, borderRadius: '8px', border: `1px solid ${T.border}`, padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input readOnly placeholder="Search invoices..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
          </div>
          <select style={{ padding: '5px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.textSecondary }}>
            <option>All Status</option>
          </select>
          <select style={{ padding: '5px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.textSecondary }}>
            <option>Newest first</option>
          </select>
        </div>

        {/* Invoice cards grid */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {(scene === 'empty' ? [] : visibleInvoices).map((inv, i) => {
            const sc = STATUS_COLORS[inv.status] || STATUS_COLORS['Open']
            const isCustomer = inv.type === 'customer'
            return (
              <motion.div key={inv.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}
                style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(44,53,48,0.05)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '7px', backgroundColor: isCustomer ? 'rgba(59,130,246,0.12)' : 'rgba(20,184,166,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isCustomer ? <FileText size={15} style={{ color: '#3b82f6' }} /> : <Zap size={15} style={{ color: '#14b8a6' }} />}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customer}</div>
                      <div style={{ fontSize: '10px', color: T.accent, fontWeight: '500' }}>{inv.invoice_id}</div>
                    </div>
                  </div>
                  <span style={{ padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '600', backgroundColor: isCustomer ? 'rgba(59,130,246,0.12)' : 'rgba(20,184,166,0.12)', color: isCustomer ? '#3b82f6' : '#14b8a6', flexShrink: 0 }}>
                    {isCustomer ? 'Customer' : 'Utility'}
                  </span>
                </div>
                {inv.desc && <div style={{ fontSize: '10px', color: T.textSecondary, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.desc}</div>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>${inv.amount.toLocaleString()}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '9px', fontSize: '9px', fontWeight: '500', backgroundColor: sc.bg, color: sc.text }}>{inv.status}</span>
                    <span style={{ fontSize: '9px', color: T.textMuted }}>{inv.date}</span>
                  </div>
                </div>
              </motion.div>
            )
          })}
          {scene === 'empty' && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
              <FileText size={36} style={{ color: T.textMuted, marginBottom: '10px', opacity: 0.5 }} />
              <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No invoices yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:   '1 · Invoices page — New Invoice + New Utility, type tabs, due-date chips',
    grid:    '2 · Invoice cards — FileText (Customer) or Zap (Utility) + amount + status pill',
    overdue: '3 · Overdue chip filters to unpaid, past-due invoices in red',
    send:    '4 · Open an invoice → Send Portal Link → customer pays with one click',
    paid:    '5 · Paid invoices show green status — closed loop from estimate to payment',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to send invoices'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
