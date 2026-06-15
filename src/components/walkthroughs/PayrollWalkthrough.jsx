// Payroll walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Payroll.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Calendar, Clock, TrendingUp, Zap,
  ChevronLeft, ChevronRight, Play, Plus, FileText, X,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/payroll.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_EMPLOYEES = [
  { id: 1, name: 'Doug Anderson',  role: 'Sales',      hours: 80.0, regular: 80.0, ot: 0,   commission: 3200, gross: 6200,  net: 5100  },
  { id: 2, name: 'Tracy Benson',   role: 'Manager',    hours: 72.5, regular: 72.5, ot: 0,   commission: 1800, gross: 5800,  net: 4750  },
  { id: 3, name: 'Marcus Webb',    role: 'Field Tech', hours: 87.0, regular: 80.0, ot: 7.0, commission: 840,  gross: 4280,  net: 3520  },
  { id: 4, name: 'Linda Park',     role: 'Setter',     hours: 64.0, regular: 64.0, ot: 0,   commission: 750,  gross: 2950,  net: 2430  },
]

export default function PayrollWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Payroll processed." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

const INBOX_TASKS = [
  { id: 1, label: 'EFTPS deposit — Federal Withholding $4,200', due: 'Jun 17', color: '#ef4444', urgent: true },
  { id: 2, label: 'Form 941 Q2 — due Jul 31',                  due: 'Jul 31', color: '#f59e0b', urgent: false },
  { id: 3, label: 'State withholding deposit — UT', due: 'Jun 20', color: '#3b82f6', urgent: false },
]

function Stage({ scene }) {
  const showEmployeeList = scene === 'period' || scene === 'employees'
  const showDetail       = scene === 'detail'
  const showRunModal     = scene === 'run'
  const showInbox        = scene === 'inbox'
  const highlightPeriod  = scene === 'period'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <DollarSign size={16} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Payroll</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', border: 'none', borderRadius: '7px', backgroundColor: '#22c55e', color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
          <Play size={11} />Run Payroll
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '7px' }}>
        <div style={{ backgroundColor: T.bgCard, borderRadius: '9px', border: `1.5px solid ${highlightPeriod ? T.accent : T.border}`, padding: '10px', boxShadow: highlightPeriod ? `0 0 0 3px ${T.accentBg}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
            <Calendar size={12} style={{ color: T.accent }} />
            <span style={{ fontSize: '9px', color: T.textMuted }}>Pay Period</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button style={{ padding: '2px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer' }}><ChevronLeft size={9} /></button>
            <span style={{ fontSize: '10px', fontWeight: '600', color: T.text, flex: 1, textAlign: 'center' }}>Jun 1–14</span>
            <button style={{ padding: '2px', border: `1px solid ${T.border}`, borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer' }}><ChevronRight size={9} /></button>
          </div>
        </div>
        <div style={{ backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}`, padding: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
            <Clock size={12} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: '9px', color: T.textMuted }}>Next Payday</span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>Jun 15</div>
          <div style={{ fontSize: '10px', color: '#8b5cf6', fontWeight: '600' }}>6 days away</div>
        </div>
        <div style={{ backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}`, padding: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
            <DollarSign size={12} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: '9px', color: T.textMuted }}>Total Payroll</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>$19,230</div>
        </div>
        <div style={{ backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}`, padding: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
            <TrendingUp size={12} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '9px', color: T.textMuted }}>Commissions</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b' }}>$6,590</div>
          <div style={{ fontSize: '9px', color: '#f97316' }}>$750 pending</div>
        </div>
      </div>

      {/* Employee rows — period + employees scenes */}
      {showEmployeeList && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto' }}>
          {MOCK_EMPLOYEES.map((emp, i) => (
            <motion.div key={emp.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: T.accent, flexShrink: 0 }}>
                {emp.name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{emp.name}</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>{emp.role} · {emp.hours.toFixed(1)} hrs{emp.ot > 0 ? ` (${emp.ot}h OT)` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#22c55e' }}>${emp.net.toLocaleString()}</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>net · gross ${emp.gross.toLocaleString()}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail view for Doug — detail scene */}
      {showDetail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '11px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', color: T.accent }}>D</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>Doug Anderson</div>
              <div style={{ fontSize: '10px', color: T.textMuted }}>Sales · $32/hr · PTO: 4.5 days</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: T.textMuted }}>Net Pay</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>$5,100</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>Gross: $6,200</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {[['+ Time', '#6b7280'], ['+ Commission', '#6b7280'], ['Addition', '#22c55e'], ['Deduction', '#ef4444'], ['Check Stub', '#3b82f6']].map(([label, color]) => (
              <button key={label} style={{ padding: '5px 10px', border: `1px solid ${color}20`, borderRadius: '6px', backgroundColor: `${color}10`, color, fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              ['Reg. Hours', '80h × $32', '+$2,560'],
              ['Commissions', '3 closed deals', '+$3,200'],
              ['Benefits', 'Health / 401k', '−$420'],
              ['Taxes', 'Fed + State', '−$1,080'],
            ].map(([label, desc, val]) => (
              <div key={label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{label}</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>{desc}</div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: val.startsWith('+') ? '#22c55e' : '#ef4444', marginTop: '2px' }}>{val}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Run Payroll modal — run scene */}
      {showRunModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96, y: -10 }} animate={{ scale: 1, y: 0 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Run Payroll</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: T.textSecondary }}>Pay period: <strong>Jun 1 – Jun 14, 2026</strong></div>
              <div style={{ fontSize: '11px', color: T.textSecondary }}>Payday: <strong>Jun 15, 2026</strong></div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>Total: $19,230</div>
              <div style={{ fontSize: '9px', color: T.textMuted, backgroundColor: T.bg, padding: '6px 8px', borderRadius: '5px' }}>
                Creates payroll_runs records and locks the period. Time entries and commissions lock at this point.
              </div>
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '6px', backgroundColor: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Confirm & Run</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Payroll Inbox — inbox scene */}
      {showInbox && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <FileText size={13} style={{ color: T.accent }} />
            <span style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>Payroll Inbox</span>
            <span style={{ padding: '1px 7px', borderRadius: '9px', fontSize: '9px', fontWeight: '600', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>1 urgent</span>
          </div>
          {INBOX_TASKS.map((task, i) => (
            <motion.div key={task.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${task.urgent ? '#ef444440' : T.border}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: task.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.label}</div>
              </div>
              <div style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '7px', backgroundColor: task.urgent ? 'rgba(239,68,68,0.1)' : T.bg, color: task.urgent ? '#ef4444' : T.textMuted, fontWeight: task.urgent ? '600' : '400', flexShrink: 0 }}>
                {task.due}
              </div>
            </motion.div>
          ))}
          <div style={{ padding: '10px 12px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <Plus size={12} style={{ color: T.accent, marginTop: '1px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, marginBottom: '1px' }}>941 + W-2 auto-generate at period end</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>Quarterly and year-end filings land here automatically.</div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    period:    '1 · Payroll — pay period nav, Next Payday, Total Payroll, Commissions summary',
    employees: '2 · Employee rows — hours, OT flag, gross pay, net pay',
    detail:    '3 · Employee detail — pay breakdown: hours + commissions + additions − deductions',
    run:       '4 · Run Payroll — confirm period, payday, total · locks the period',
    inbox:     '5 · Payroll Inbox — EFTPS deposit deadlines, 941 filings, W-2 tasks auto-generated',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Payroll works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
