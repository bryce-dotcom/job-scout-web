// Payroll Inbox walkthrough — pre-payroll review queue.
// Source: src/lib/featureKnowledge/payroll-inbox.js

import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, AlertTriangle, Clock, DollarSign, CheckCircle, X, MessageSquare, ChevronRight, AlertCircle, TrendingUp, Users } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/payroll-inbox.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const ITEM_TYPES = {
  ot_exception:      { label: 'OT Exception',       color: '#c28b38', bg: 'rgba(194,139,56,0.12)' },
  missing_clockout:  { label: 'Missing Clock-out',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  commission_dispute:{ label: 'Commission Dispute', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  bonus_approval:    { label: 'Bonus Approval',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  manual_adjustment: { label: 'Manual Adjustment',  color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
}

const INBOX_ITEMS = [
  { id: 1, type: 'ot_exception',       employee: 'Marcus Webb',    summary: '6.5 hrs OT · Jun 9–10 · Job #J-2291',   amount: 214.50, date: 'Jun 10', status: 'pending' },
  { id: 2, type: 'missing_clockout',   employee: 'Ryan Diaz',      summary: 'No clock-out logged · Jun 8 shift',      amount: 112.00, date: 'Jun 8',  status: 'pending' },
  { id: 3, type: 'commission_dispute', employee: 'Sarah Lin',      summary: 'EST-041 commission rate disputed',        amount: 196.00, date: 'Jun 7',  status: 'pending' },
  { id: 4, type: 'bonus_approval',     employee: 'Doug Anderson',  summary: 'Monthly performance bonus · June',       amount: 250.00, date: 'Jun 9',  status: 'approved' },
  { id: 5, type: 'ot_exception',       employee: 'Tracy Benson',   summary: '2.25 hrs OT · Jun 6 · Job #J-2278',     amount: 67.50,  date: 'Jun 6',  status: 'approved' },
  { id: 6, type: 'manual_adjustment',  employee: 'Linda Park',     summary: 'Retroactive pay correction · May cycle', amount: 140.00, date: 'Jun 5',  status: 'approved' },
]

const MARCUS_TIMELINE = [
  { time: 'Mon Jun 9 · 7:02 AM',  event: 'Clocked in',  job: 'Job #J-2291 — Fixture install, Mesa AZ' },
  { time: 'Mon Jun 9 · 6:48 PM',  event: 'Clocked out', job: '11h 46m on-site (3.75 OT hrs)' },
  { time: 'Tue Jun 10 · 6:55 AM', event: 'Clocked in',  job: 'Job #J-2291 — Day 2 finishing' },
  { time: 'Tue Jun 10 · 5:42 PM', event: 'Clocked out', job: '10h 47m on-site (2.75 OT hrs)' },
]

export default function PayrollInboxWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Nothing slips through." />}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Inbox size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Payroll Inbox</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>Close: Jun 15, 2026</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '9px', fontWeight: '700', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>3 pending</span>
          <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '9px', fontWeight: '600', backgroundColor: T.accentBg, color: T.accent }}>3 resolved</span>
        </div>
      </div>

      {scene === 'inbox' && <SceneInbox />}
      {scene === 'item'  && <SceneItem />}
      {scene === 'approve' && <SceneApprove />}
      {scene === 'summary' && <SceneSummary />}
    </div>
  )
}

function SceneInbox() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <AlertCircle size={11} style={{ color: '#ef4444' }} />
        <span style={{ fontSize: '10px', fontWeight: '600', color: '#ef4444' }}>3 items need review before payroll runs on Jun 15</span>
      </div>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '6px 11px', borderBottom: `1px solid ${T.border}`, fontSize: '9px', fontWeight: '600', color: T.textMuted, display: 'grid', gridTemplateColumns: '4px 1fr 90px 68px 56px', gap: '8px', alignItems: 'center' }}>
          <span />
          <span>EMPLOYEE / ISSUE</span>
          <span>TYPE</span>
          <span style={{ textAlign: 'right' }}>IMPACT</span>
          <span style={{ textAlign: 'center' }}>STATUS</span>
        </div>
        {INBOX_ITEMS.map((item, i) => {
          const typeInfo = ITEM_TYPES[item.type]
          const isPending = item.status === 'pending'
          return (
            <motion.div key={item.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              style={{ display: 'grid', gridTemplateColumns: '4px 1fr 90px 68px 56px', gap: '8px', alignItems: 'center', padding: '8px 11px', borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${typeInfo.color}`, backgroundColor: isPending ? `${typeInfo.color}06` : 'transparent', cursor: 'pointer' }}>
              <span />
              <div>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{item.employee}</div>
                <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '1px' }}>{item.summary}</div>
              </div>
              <div>
                <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: typeInfo.bg, color: typeInfo.color }}>{typeInfo.label}</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: '10px', fontWeight: '700', color: T.text }}>${item.amount.toFixed(2)}</div>
              <div style={{ textAlign: 'center' }}>
                {item.status === 'approved'
                  ? <CheckCircle size={13} style={{ color: '#22c55e' }} />
                  : <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Review</span>
                }
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function SceneItem() {
  const item = INBOX_ITEMS[0]
  const typeInfo = ITEM_TYPES[item.type]
  return (
    <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderTop: `3px solid ${typeInfo.color}`, borderRadius: '10px', padding: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
            <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: '700', backgroundColor: typeInfo.bg, color: typeInfo.color }}>{typeInfo.label}</span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Marcus Webb</span>
            <span style={{ fontSize: '9px', color: T.textMuted }}>Jun 9–10 · Job #J-2291</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px', marginBottom: '8px' }}>
            {[
              { label: 'OT Hours', value: '6.5 hrs', sub: 'across 2 days' },
              { label: 'Regular Rate', value: '$22.00/hr', sub: 'base wage' },
              { label: 'OT Rate', value: '$33.00/hr', sub: '1.5× regular' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: T.bg, borderRadius: '7px', padding: '7px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>{s.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '1px' }}>{s.label}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 9px', backgroundColor: 'rgba(194,139,56,0.08)', borderRadius: '7px', border: '1px solid rgba(194,139,56,0.2)' }}>
            <span style={{ fontSize: '10px', color: T.textSecondary }}>Additional payroll cost this run:</span>
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#c28b38' }}>+$214.50</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'Approve for payroll', icon: CheckCircle, color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)' },
            { label: 'Reject & flag Marcus', icon: X, color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
            { label: 'Send note to manager', icon: MessageSquare, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
          ].map(btn => (
            <button key={btn.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px 6px', border: `1px solid ${btn.border}`, borderRadius: '8px', backgroundColor: btn.bg, color: btn.color, fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>
              <btn.icon size={13} />
              {btn.label}
            </button>
          ))}
        </motion.div>
      </div>
      <div style={{ width: '155px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: T.text }}>Punch Timeline</div>
        <div style={{ padding: '6px 0' }}>
          {MARCUS_TIMELINE.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
              style={{ display: 'flex', gap: '8px', padding: '5px 10px', alignItems: 'flex-start' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: t.event === 'Clocked in' ? '#22c55e' : '#ef4444', flexShrink: 0, marginTop: '3px' }} />
              <div>
                <div style={{ fontSize: '9px', fontWeight: '600', color: T.text }}>{t.event}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{t.time}</div>
                <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '1px' }}>{t.job}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

const APPROVED_ITEMS = [
  { id: 4, type: 'bonus_approval',    employee: 'Doug Anderson', summary: 'Monthly performance bonus · June', amount: 250.00 },
  { id: 5, type: 'ot_exception',      employee: 'Tracy Benson',  summary: '2.25 hrs OT · Jun 6 · Job #J-2278', amount: 67.50 },
  { id: 6, type: 'manual_adjustment', employee: 'Linda Park',    summary: 'Retroactive pay correction · May',   amount: 140.00 },
  { id: 1, type: 'ot_exception',      employee: 'Marcus Webb',   summary: '6.5 hrs OT · Jun 9–10 · Job #J-2291', amount: 214.50, justApproved: true },
]

function SceneApprove() {
  const resolved = 4
  const total = 6
  const pct = Math.round((resolved / total) * 100)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>{resolved} of {total} items resolved</span>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#22c55e' }}>{pct}%</span>
        </div>
        <div style={{ height: '8px', backgroundColor: T.bg, borderRadius: '4px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
          <motion.div initial={{ width: '50%' }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ height: '100%', backgroundColor: '#22c55e', borderRadius: '4px' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '8px', color: '#22c55e', fontWeight: '600' }}>{resolved} approved</span>
          <span style={{ fontSize: '8px', color: '#ef4444', fontWeight: '600' }}>2 remaining</span>
        </div>
      </motion.div>
      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '6px 11px', borderBottom: `1px solid ${T.border}`, fontSize: '10px', fontWeight: '700', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <CheckCircle size={11} />Approved Items ({resolved})
        </div>
        {APPROVED_ITEMS.map((item, i) => {
          const typeInfo = ITEM_TYPES[item.type]
          return (
            <motion.div key={item.id} initial={{ opacity: 0, x: item.justApproved ? -10 : 0 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: item.justApproved ? 0.15 : i * 0.04 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 11px', borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${item.justApproved ? '#22c55e' : typeInfo.color}`, backgroundColor: item.justApproved ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{item.employee}</div>
                  <div style={{ fontSize: '8px', color: T.textMuted }}>{item.summary}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {item.justApproved && <span style={{ fontSize: '8px', fontWeight: '700', color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', padding: '1px 5px', borderRadius: '4px' }}>Just approved</span>}
                <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>${item.amount.toFixed(2)}</span>
              </div>
            </motion.div>
          )
        })}
        <div style={{ padding: '7px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.accentBg }}>
          <span style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>Next up</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: T.accent, fontWeight: '600' }}>
            Ryan Diaz — Missing Clock-out <ChevronRight size={12} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SceneSummary() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px', flexShrink: 0 }}>
        {[
          { label: 'Approved Additions', value: '$842.00', sub: '5 approved items', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
          { label: 'Pending Disputes',   value: '1 item',  sub: 'Sarah Lin · $196', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
          { label: 'Est. Payroll Total', value: '$18,240', sub: 'incl. all approved', color: T.accent, bg: T.accentBg, border: T.border },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: '800', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.text, marginTop: '2px' }}>{s.label}</div>
            <div style={{ fontSize: '8px', color: T.textMuted, marginTop: '1px' }}>{s.sub}</div>
          </div>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', flex: 1 }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={12} style={{ color: T.accent }} />
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Pre-Payroll Summary · Jun 15 Run</span>
        </div>
        {[
          { label: 'Base wages (all employees)', amount: '$16,840.00', note: '14 employees' },
          { label: 'Approved OT additions',      amount: '+$282.00',  note: '2 OT items approved', color: '#22c55e' },
          { label: 'Approved bonuses',           amount: '+$250.00',  note: 'Doug Anderson',        color: '#22c55e' },
          { label: 'Approved manual adjustments',amount: '+$310.00',  note: '2 items',              color: '#22c55e' },
          { label: 'Commission dispute — PENDING',amount: '$196.00',  note: 'Excluded until resolved', color: '#ef4444' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <span style={{ fontSize: '10px', color: T.text }}>{r.label}</span>
              {r.note && <span style={{ fontSize: '8px', color: T.textMuted, marginLeft: '6px' }}>{r.note}</span>}
            </div>
            <span style={{ fontSize: '10px', fontWeight: '700', color: r.color || T.text }}>{r.amount}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: T.accentBg }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Estimated Run Total</span>
          <span style={{ fontSize: '14px', fontWeight: '800', color: T.accent }}>$18,240.00</span>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button style={{ flex: 1, padding: '9px 12px', border: `1px solid rgba(239,68,68,0.35)`, borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.07)', color: '#ef4444', fontSize: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
          <AlertTriangle size={11} />Resolve remaining 1 item
        </button>
        <button style={{ flex: 1.4, padding: '9px 12px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', opacity: 0.45 }}>
          Proceed to Payroll Run <ChevronRight size={12} />
        </button>
      </motion.div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    inbox:   '1 · Inbox list — 6 flagged items color-coded by type, 3 pending before Jun 15 close',
    item:    '2 · Item detail — Marcus Webb OT: 6.5 hrs at $33/hr OT rate · $214.50 impact · 3 actions',
    approve: '3 · Approval flow — item checked off, progress bar updates, next item auto-queued',
    summary: '4 · Pre-payroll summary — $842 in additions approved, 1 dispute blocks the run button',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Payroll Inbox works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
