// Estimates walkthrough — rebuilt to Prospect Scout standard.
// Source of truth: src/pages/Estimates.jsx + src/lib/statusColors.js (quoteStatusColors)
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Plus, Search, Upload, Download, User, Calendar, X,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/estimates.js'

// ─── Theme ─────────────────────────────────────────────────────────────────
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

// quoteStatusColors from src/lib/statusColors.js
const STATUS_COLORS = {
  'Draft':    { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'Sent':     { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Approved': { bg: 'rgba(74,124,89,0.12)',   text: '#4a7c59' },
  'Rejected': { bg: 'rgba(139,90,90,0.12)',   text: '#8b5a5a' },
  'Expired':  { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
}

// Mock estimates matching real quotes table fields
const MOCK_ESTIMATES = [
  { id: 1, quote_id: 'EST-041', estimate_name: 'LED Retrofit — Northbridge', customer_name: 'Marcus Okafor',  business_name: 'Northbridge Logistics', salesperson: 'Doug A.',  date: 'Jun 5',  amount: 24500, status: 'Sent' },
  { id: 2, quote_id: 'EST-038', estimate_name: 'Fleet Wrap Package',         customer_name: 'Sarah Chen',    business_name: 'Cypress Roofing',       salesperson: 'Tracy B.', date: 'Jun 2',  amount: 18200, status: 'Approved' },
  { id: 3, quote_id: 'EST-035', estimate_name: 'Parking Lot LED',            customer_name: 'David Kim',     business_name: 'Solera Electric',       salesperson: 'Doug A.',  date: 'May 29', amount: 12000, status: 'Sent' },
  { id: 4, quote_id: 'EST-032', estimate_name: 'Office Lighting Audit',      customer_name: 'Jennifer Walsh', business_name: null,                   salesperson: 'Tracy B.', date: 'May 24', amount: 0,     status: 'Draft' },
  { id: 5, quote_id: 'EST-027', estimate_name: 'Solar Panel Array',          customer_name: 'Ryan Torres',   business_name: 'Apex Solar',            salesperson: 'Doug A.',  date: 'May 18', amount: 48200, status: 'Approved' },
]

const TYPED = 'LED Retrofit — Northbridge'

// ─── Root ──────────────────────────────────────────────────────────────────
export default function EstimatesWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: T.bg, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist
                title={`Set it up in ${card.setup.steps.length} steps`}
                steps={card.setup.steps}
                currentIdx={setupIdx}
              />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="Your estimates are ready to send." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ─────────────────────────────────────────────────────────────────
function Stage({ scene, sceneElapsed }) {
  const typedName = scene === 'modal'
    ? TYPED.slice(0, Math.min(TYPED.length, Math.floor(sceneElapsed / 75)))
    : TYPED
  const nameDone = typedName.length >= TYPED.length

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      fontSize: '12px', fontFamily: 'system-ui, sans-serif',
      color: T.text, overflow: 'hidden',
    }}>
      <MiniPageHeader />
      <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
        <StatsRow scene={scene} />
        <SearchFilterRow scene={scene} />
        {scene === 'empty' && <EmptyEstimates />}
        {(scene === 'grid' || scene === 'filter' || scene === 'approved') && (
          <EstimateGrid scene={scene} />
        )}
        {scene === 'modal' && <ModalOverGrid typedName={typedName} nameDone={nameDone} />}
      </div>
    </div>
  )
}

// ─── PageHeader — Estimates.jsx lines 254-285 ─────────────────────────────
function MiniPageHeader() {
  const btnBase = {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '5px 11px', border: `1px solid ${T.border}`,
    borderRadius: '6px', fontSize: '11px', fontWeight: '500',
    cursor: 'pointer', backgroundColor: 'transparent',
  }
  return (
    <div style={{
      backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`,
      padding: '9px 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileText size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Estimates</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button style={{ ...btnBase, color: T.accent }}><Upload size={12} />Import</button>
        <button style={{ ...btnBase, color: T.textSecondary }}><Download size={12} />Export</button>
        <button style={{ ...btnBase, backgroundColor: T.accent, color: '#fff', border: 'none' }}>
          <Plus size={13} />New Estimate
        </button>
      </div>
    </div>
  )
}

// ─── Stats cards — lines 288-334 ─────────────────────────────────────────
function StatsRow({ scene }) {
  const isEmpty = scene === 'empty'
  const stats = [
    { label: 'Draft',       value: isEmpty ? '0' : '1',         color: T.text },
    { label: 'Sent',        value: isEmpty ? '0' : '2',         color: T.text },
    { label: 'Approved',    value: isEmpty ? '0' : '2',         color: '#4a7c59' },
    { label: 'Total Value', value: isEmpty ? '$0.00' : '$66,400', color: T.accent, isValue: true },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px',
    }}>
      {stats.map(stat => (
        <motion.div
          key={stat.label}
          initial={false}
          animate={{ opacity: 1 }}
          style={{
            backgroundColor: T.bgCard, borderRadius: '10px',
            border: `1px solid ${T.border}`, padding: '10px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '11px', color: T.textMuted, marginBottom: '3px' }}>{stat.label}</div>
          <div style={{ fontSize: stat.isValue ? '14px' : '20px', fontWeight: '600', color: stat.color }}>
            {stat.value}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Search + filter row — lines 336-394 ─────────────────────────────────
function SearchFilterRow({ scene }) {
  const filterActive = scene === 'filter'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder="Search estimates..." style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px 6px 26px', border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '11px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
      </div>
      <select style={{ padding: '6px 10px', border: `1px solid ${filterActive ? T.accent : T.border}`, borderRadius: '6px', fontSize: '11px', backgroundColor: filterActive ? T.accentBg : T.bgCard, color: filterActive ? T.accent : T.textSecondary, fontWeight: filterActive ? '600' : '400' }}>
        <option>{filterActive ? 'Sent' : 'All Status'}</option>
      </select>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', fontSize: '11px', color: T.textSecondary, cursor: 'pointer' }}>
        <input type="checkbox" defaultChecked readOnly style={{ accentColor: T.accent }} />
        Hide $0 drafts
      </label>
    </div>
  )
}

// ─── Empty state — lines 396-410 ─────────────────────────────────────────
function EmptyEstimates() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`,
      }}
    >
      <FileText size={36} style={{ color: T.textMuted, marginBottom: '12px', opacity: 0.5 }} />
      <p style={{ color: T.textSecondary, fontSize: '13px', margin: 0 }}>No estimates yet. Create your first estimate.</p>
    </motion.div>
  )
}

// ─── Estimate card — mirrors lines 422-474 ────────────────────────────────
function EstimateCard({ est, flashIn }) {
  const sc = STATUS_COLORS[est.status] || STATUS_COLORS['Draft']
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: '10px', padding: '12px', boxShadow: '0 1px 4px rgba(44,53,48,0.06)',
        cursor: 'pointer',
      }}
    >
      {/* Icon + name + quote_id */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
        <div style={{ width: '40px', height: '40px', backgroundColor: T.accentBg, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} style={{ color: T.accent }} />
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {est.estimate_name || est.customer_name}
          </div>
          <div style={{ fontSize: '11px', color: T.accent, fontWeight: '500' }}>{est.quote_id}</div>
        </div>
      </div>
      {/* Salesperson + date */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: T.textSecondary }}>
          <User size={11} />{est.salesperson}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: T.textSecondary }}>
          <Calendar size={11} />{est.date}
        </div>
      </div>
      {/* Amount + status pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>
          {est.amount > 0 ? `$${est.amount.toLocaleString()}` : '$0.00'}
        </span>
        <span style={{ padding: '3px 9px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', backgroundColor: sc.bg, color: sc.text }}>
          {est.status}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Estimate grid ─────────────────────────────────────────────────────────
function EstimateGrid({ scene }) {
  const filtered = scene === 'filter'
    ? MOCK_ESTIMATES.filter(e => e.status === 'Sent')
    : scene === 'approved'
    ? MOCK_ESTIMATES.filter(e => e.status === 'Approved' || e.status === 'Sent')
    : MOCK_ESTIMATES.filter(e => !(e.status === 'Draft' && e.amount === 0)) // hide $0 drafts

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: '10px', alignContent: 'start', flex: 1, overflowY: 'auto',
    }}>
      {filtered.map((est, i) => (
        <EstimateCard key={est.id} est={est} flashIn={i === 0} />
      ))}
    </div>
  )
}

// ─── Modal over dimmed grid — mirrors lines 480-730 ───────────────────────
function ModalOverGrid({ typedName, nameDone }) {
  const fieldBox = (value, focused) => ({
    padding: '6px 10px',
    border: `1px solid ${focused ? T.accent : T.border}`,
    borderRadius: '6px', backgroundColor: T.bg,
    fontSize: '11px', color: value ? T.text : T.textMuted, minHeight: '26px',
  })

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {/* Dimmed background */}
      <div style={{ opacity: 0.2, position: 'absolute', inset: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {MOCK_ESTIMATES.slice(0, 2).map(est => <EstimateCard key={est.id} est={est} />)}
        </div>
      </div>
      {/* Overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: -14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
          style={{ backgroundColor: T.bgCard, borderRadius: '14px', border: `1px solid ${T.border}`, width: '340px', maxHeight: '95%', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          {/* Modal header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, backgroundColor: T.bgCard }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>New Estimate</span>
            <X size={15} style={{ color: T.textMuted }} />
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Estimate Name */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Estimate Name</label>
              <div style={{ ...fieldBox(typedName, true), display: 'flex', alignItems: 'center' }}>
                <span>{typedName}</span>
                {!nameDone && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ borderRight: `1.5px solid ${T.accent}`, marginLeft: '1px', height: '12px', display: 'inline-block' }}
                  />
                )}
              </div>
            </div>

            {/* Associate With toggle */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Associate With</label>
              <div style={{ display: 'flex', borderRadius: '6px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {[
                  { key: 'lead', label: 'Existing Lead' },
                  { key: 'customer', label: 'Customer' },
                  { key: 'newLead', label: 'New Lead' },
                ].map((opt, i) => (
                  <button key={opt.key} style={{
                    flex: 1, padding: '6px 4px', fontSize: '10px',
                    fontWeight: opt.key === 'lead' ? '600' : '400',
                    backgroundColor: opt.key === 'lead' ? T.accent : 'transparent',
                    color: opt.key === 'lead' ? '#fff' : T.textSecondary,
                    border: 'none', cursor: 'pointer',
                    borderRight: i < 2 ? `1px solid ${T.border}` : 'none',
                  }}>{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Lead picker */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Lead</label>
              <div style={{ ...fieldBox(nameDone, false) }}>
                {nameDone ? 'Marcus Okafor · LED Retrofit · Jun 10 [Appointment Set]' : ''}
              </div>
            </div>

            {/* Salesperson + Service Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Salesperson</label>
                <div style={fieldBox(nameDone, false)}>{nameDone && 'Doug Anderson'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Service Type</label>
                <div style={fieldBox(nameDone, false)}>{nameDone && 'LED Retrofit'}</div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Notes</label>
              <div style={{ ...fieldBox(false, false), minHeight: '32px' }} />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ flex: 1, padding: '8px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}>Create Estimate</button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:    '1 · Empty estimates — Draft/Sent/Approved/Total Value stats + New Estimate',
    modal:    '2 · New Estimate modal — name it, associate with a lead, customer, or new lead',
    grid:     '3 · Estimate grid — FileText card, quote ID, salesperson, date, amount, status pill',
    filter:   '4 · Status filter — filter to Sent, Approved, Draft, Rejected, or Expired',
    approved: '5 · Approved cards — customer signed via portal; converts to a job',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to send your first estimate'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
