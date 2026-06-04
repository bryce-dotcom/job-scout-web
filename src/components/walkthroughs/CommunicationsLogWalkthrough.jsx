// Communications Log walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/CommunicationsLog.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Plus, Search, Mail, Phone, MessageCircle,
  FileText, Filter, X,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/communications-log.js'

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

// From CommunicationsLog.jsx — exact values
const TYPE_COLORS   = { Email: '#5a9bd5', SMS: '#9b59b6', Call: '#4a7c59', Note: '#f4b942' }
const TYPE_ICONS    = { Email: Mail, SMS: MessageCircle, Call: Phone, Note: FileText }
const STATUS_COLORS = { Sent: '#5a9bd5', Delivered: '#4a7c59', Failed: '#c25a5a', Completed: '#4a7c59' }

// Mock data matching communications_log table shape
const MOCK_COMMS = [
  { id: 1, date: 'Jun 5, 10:24 AM', type: 'Email',  customer: 'Marcus Okafor',  recipient: 'marcus@northbridge.co',  status: 'Delivered', logged_by: 'Doug A.' },
  { id: 2, date: 'Jun 5, 10:30 AM', type: 'SMS',    customer: 'Marcus Okafor',  recipient: '(801) 555-0142',         status: 'Delivered', logged_by: 'Doug A.' },
  { id: 3, date: 'Jun 4, 2:15 PM',  type: 'Call',   customer: 'Sarah Chen',     recipient: '(801) 555-0283',         status: 'Completed', logged_by: 'Tracy B.' },
  { id: 4, date: 'Jun 3, 9:00 AM',  type: 'Email',  customer: 'David Kim',      recipient: 'dkim@solera.com',        status: 'Sent',      logged_by: 'Doug A.' },
  { id: 5, date: 'Jun 2, 4:45 PM',  type: 'Note',   customer: 'Jennifer Walsh', recipient: '—',                     status: 'Completed', logged_by: 'Tracy B.' },
  { id: 6, date: 'Jun 1, 11:30 AM', type: 'Email',  customer: 'Ryan Torres',    recipient: 'ryan@apexsolar.io',      status: 'Failed',    logged_by: 'Doug A.' },
]

// ─── Root ──────────────────────────────────────────────────────────────────
export default function CommunicationsLogWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: T.bg, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
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
            <DonePanel key="done" onReplay={replay} subtitle="Every conversation, one place." />
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
function Stage({ scene }) {
  const filterActive = scene === 'reply'
  const searchActive = scene === 'search'
  const showModal   = scene === 'email'

  const rows = filterActive
    ? MOCK_COMMS.filter(c => c.type === 'Email')
    : searchActive
    ? MOCK_COMMS.filter(c => c.customer.toLowerCase().includes('marcus'))
    : scene === 'customer'
    ? []
    : MOCK_COMMS

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text,
      padding: '12px 16px', gap: '10px', overflow: 'hidden',
    }}>
      {/* Header — lines 155-178 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={17} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Communications Log</span>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 12px', backgroundColor: T.accent, color: '#fff',
          border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '500',
          cursor: 'pointer',
        }}>
          <Plus size={12} />Log Communication
        </button>
      </div>

      {/* Filters card — lines 180-281 */}
      <div style={{
        backgroundColor: T.bgCard, borderRadius: '8px',
        border: `1px solid ${T.border}`, padding: '9px 12px',
        display: 'flex', flexWrap: 'wrap', gap: '7px', alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '80px' }}>
          <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <input readOnly placeholder={searchActive ? 'marcus' : 'Search...'}
            style={{ width: '100%', boxSizing: 'border-box', padding: '4px 7px 4px 20px', border: `1px solid ${searchActive ? T.accent : T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bg, color: T.text, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={10} style={{ color: T.textMuted }} />
          <select style={{ padding: '4px 7px', borderRadius: '5px', border: `1px solid ${filterActive ? T.accent : T.border}`, backgroundColor: filterActive ? T.accentBg : T.bg, color: filterActive ? T.accent : T.textSecondary, fontSize: '10px', fontWeight: filterActive ? '600' : '400' }}>
            <option>{filterActive ? 'Email' : 'All Types'}</option>
          </select>
        </div>
        <input readOnly placeholder="From date" style={{ padding: '4px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bg, color: T.textMuted, width: '68px' }} />
        <span style={{ color: T.textMuted, fontSize: '10px' }}>to</span>
        <input readOnly placeholder="To date" style={{ padding: '4px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bg, color: T.textMuted, width: '68px' }} />
        {(filterActive || searchActive) && (
          <button style={{ padding: '4px 8px', backgroundColor: 'rgba(194,90,90,0.1)', color: '#c25a5a', border: 'none', borderRadius: '5px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <X size={10} />Clear
          </button>
        )}
      </div>

      {/* Table — lines 285-375 */}
      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '8px', border: `1px solid ${T.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Date', 'Type', 'Customer', 'Recipient', 'Status', 'Logged By'].map(col => (
                <th key={col} style={{ padding: '8px 10px', textAlign: col === 'Status' ? 'center' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '28px', textAlign: 'center', color: T.textMuted, fontSize: '11px' }}>
                  No communications found
                </td>
              </tr>
            ) : rows.map((comm, i) => {
              const Icon = TYPE_ICONS[comm.type] || MessageSquare
              const typeColor = TYPE_COLORS[comm.type] || T.textMuted
              const statusColor = STATUS_COLORS[comm.status] || T.textMuted
              return (
                <motion.tr
                  key={comm.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.22 }}
                  style={{ borderBottom: `1px solid ${T.border}` }}
                >
                  <td style={{ padding: '8px 10px', fontSize: '10px', color: T.text, whiteSpace: 'nowrap' }}>{comm.date}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '9px', backgroundColor: typeColor + '18', color: typeColor }}>
                      <Icon size={10} />
                      <span style={{ fontSize: '9px', fontWeight: '500' }}>{comm.type}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '10px', color: T.text, fontWeight: '500' }}>{comm.customer}</td>
                  <td style={{ padding: '8px 10px', fontSize: '9px', color: T.textSecondary }}>{comm.recipient}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '9px', fontSize: '9px', fontWeight: '500', backgroundColor: statusColor + '18', color: statusColor }}>
                      {comm.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '9px', color: T.textMuted }}>{comm.logged_by}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Log Communication modal */}
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ position: 'absolute', inset: 0, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <motion.div
            initial={{ scale: 0.96, y: -10 }} animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Log Communication</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {[
                ['Customer', 'Marcus Okafor'],
                ['Type',     'Email'],
                ['Recipient','marcus@northbridge.co'],
                ['Status',   'Delivered'],
              ].map(([label, value]) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{label}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{value}</div>
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>Notes</label>
                <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.textMuted, minHeight: '28px' }}>
                  Sent EST-041 portal link via email
                </div>
              </div>
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '500', cursor: 'pointer' }}>Log</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    customer: '1 · Communications Log — every email, SMS, call, and note in one table',
    email:    '2 · Log Communication modal — customer, type, recipient, status, notes',
    sms:      '3 · Table view — Date · Type chip · Customer · Recipient · Status · Logged By',
    reply:    '4 · Type filter — narrow to Email only to audit outreach history',
    search:   '5 · Search by customer name to see their full communication timeline',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to set up the communications log'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
