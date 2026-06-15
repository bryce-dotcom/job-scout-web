// Employees walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Employees.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, Send, Settings, User, Mail, Phone, X, DollarSign, Award, ChevronLeft } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/employees.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// roleColors from Employees.jsx lines 19-36
const ROLE_COLORS = {
  'Admin': '#D4AF37', 'Owner': '#D4AF37', 'CEO': '#D4AF37',
  'Manager': '#f59e0b', 'Sales': '#22c55e', 'Salesperson': '#22c55e',
  'Setter': '#3b82f6', 'Lead Setter': '#3b82f6',
  'Field Tech': '#a855f7', 'Installer': '#a855f7', 'Tech': '#a855f7',
  'Office': '#f97316', 'Finance': '#06b6d4', 'Project Manager': '#06b6d4',
}
const rc = (role) => ROLE_COLORS[role] || '#6b7280'

const MOCK_EMPLOYEES = [
  { id: 1, name: 'Doug Anderson',  role: 'Sales',      email: 'doug@acme.com',    phone: '(801) 555-0101', active: true,  tax: 'W2' },
  { id: 2, name: 'Tracy Benson',   role: 'Manager',    email: 'tracy@acme.com',   phone: '(801) 555-0102', active: true,  tax: 'W2' },
  { id: 3, name: 'Marcus Webb',    role: 'Field Tech', email: 'marcus@acme.com',  phone: '(801) 555-0103', active: true,  tax: 'W2' },
  { id: 4, name: 'Linda Park',     role: 'Setter',     email: 'linda@acme.com',   phone: '(801) 555-0104', active: true,  tax: 'W2' },
  { id: 5, name: 'Ryan Diaz',      role: 'Field Tech', email: 'ryan@acme.com',    phone: '(801) 555-0105', active: false, tax: '1099' },
  { id: 6, name: 'Sarah Mitchell', role: 'Admin',      email: 'sarah@acme.com',   phone: '(801) 555-0106', active: true,  tax: 'W2' },
]

export default function EmployeesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your team is configured." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

const DOUG = MOCK_EMPLOYEES[0]
const DOUG_COLOR = rc(DOUG.role)

const PAY_RATES = [
  { type: 'Base Salary', amount: '$72,000 / yr', note: 'W2' },
  { type: 'Commission',  amount: '4% of closed revenue', note: 'Paid monthly' },
  { type: 'Bonus',       amount: 'Up to $5,000 / yr', note: 'Discretionary' },
]

const CERTS = [
  { name: 'OSHA 10 — General Industry', issued: 'Mar 2024', expires: 'Mar 2029', status: 'valid' },
  { name: 'EPA 608 Universal',           issued: 'Jan 2023', expires: 'Never',    status: 'valid' },
  { name: 'NABCEP PV Associate',         issued: 'Jun 2022', expires: 'Jun 2027', status: 'valid' },
  { name: 'First Aid / CPR',             issued: 'Nov 2023', expires: 'Nov 2025', status: 'expired' },
]

function EmpCard({ emp, highlight }) {
  const color = rc(emp.role)
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: emp.active ? 1 : 0.6, y: 0 }} transition={{ duration: 0.2 }}
      style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${highlight ? T.accent : T.border}`, padding: '12px', textAlign: 'center', cursor: 'pointer', outline: highlight ? `2px solid ${T.accent}` : 'none', outlineOffset: '-1px' }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: '15px', fontWeight: '700', color }}>
        {emp.name.charAt(0)}
      </div>
      <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{emp.name}</div>
      <div style={{ fontSize: '10px', color, fontWeight: '500', marginBottom: '5px' }}>{emp.role}</div>
      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
        <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '10px', backgroundColor: emp.active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)', color: emp.active ? '#16a34a' : '#6b7280' }}>{emp.active ? 'Active' : 'Inactive'}</span>
        <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '10px', backgroundColor: emp.tax === 'W2' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)', color: emp.tax === 'W2' ? '#3b82f6' : '#f97316' }}>{emp.tax}</span>
      </div>
    </motion.div>
  )
}

function Stage({ scene }) {
  const showRoster = scene === 'roster' || scene === 'invite'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(scene === 'detail' || scene === 'rates' || scene === 'certs') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: T.textMuted, cursor: 'pointer' }}>
              <ChevronLeft size={13} /><span style={{ fontSize: '10px' }}>Team</span>
            </div>
          )}
          {showRoster && <Users size={15} style={{ color: T.accent }} />}
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>
            {showRoster ? 'Team' : DOUG.name}
          </span>
          {showRoster && <span style={{ fontSize: '10px', color: T.textMuted }}>· {MOCK_EMPLOYEES.filter(e => e.active).length} active</span>}
          {(scene === 'detail' || scene === 'rates' || scene === 'certs') && (
            <span style={{ padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '600', backgroundColor: DOUG_COLOR + '18', color: DOUG_COLOR }}>{DOUG.role}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {showRoster && (
            <>
              <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 9px', border: `1px solid ${T.accent}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.accent, fontSize: '10px', cursor: 'pointer' }}>
                <Send size={10} />Invite
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
                <Plus size={10} />Add
              </button>
            </>
          )}
        </div>
      </div>

      {/* roster: employee grid */}
      {showRoster && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {MOCK_EMPLOYEES.filter(e => e.active).map(emp => <EmpCard key={emp.id} emp={emp} />)}
        </div>
      )}

      {/* detail / rates / certs: detail layout */}
      {(scene === 'detail' || scene === 'rates' || scene === 'certs') && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          {/* Left: avatar + contact */}
          <div style={{ width: '160px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '13px', backgroundColor: DOUG_COLOR + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: '22px', fontWeight: '700', color: DOUG_COLOR }}>D</div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>{DOUG.name}</div>
              <div style={{ fontSize: '10px', color: DOUG_COLOR, fontWeight: '600', marginBottom: '8px' }}>{DOUG.role}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: T.textSecondary }}><Mail size={9} style={{ color: T.textMuted }} />{DOUG.email}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: T.textSecondary }}><Phone size={9} style={{ color: T.textMuted }} />{DOUG.phone}</div>
              </div>
            </div>
            {/* Tabs */}
            {['Overview', 'Pay Rates', 'Certifications'].map((tab, i) => {
              const active = (i === 0 && scene === 'detail') || (i === 1 && scene === 'rates') || (i === 2 && scene === 'certs')
              return (
                <div key={tab} style={{ padding: '8px 12px', borderRadius: '7px', backgroundColor: active ? T.accentBg : 'transparent', border: active ? `1px solid ${T.accent}` : '1px solid transparent', color: active ? T.accent : T.textSecondary, fontSize: '10px', fontWeight: active ? '600' : '400', cursor: 'pointer' }}>
                  {tab}
                </div>
              )
            })}
          </div>

          {/* Right: tab content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {scene === 'detail' && (
              <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', height: '100%', overflow: 'auto' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.text, marginBottom: '10px' }}>Overview</div>
                {[
                  { label: 'Status', value: 'Active', color: '#22c55e' },
                  { label: 'Tax type', value: 'W2' },
                  { label: 'Start date', value: 'Mar 12, 2023' },
                  { label: 'Department', value: 'Sales' },
                  { label: 'Reports to', value: 'Tracy Benson' },
                  { label: 'Hire source', value: 'Referral' },
                ].map(f => (
                  <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: '10px' }}>
                    <span style={{ color: T.textMuted }}>{f.label}</span>
                    <span style={{ color: f.color || T.text, fontWeight: '500' }}>{f.value}</span>
                  </div>
                ))}
              </motion.div>
            )}

            {scene === 'rates' && (
              <motion.div key="rates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', height: '100%', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Pay Rates</div>
                  <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}><Plus size={9} />Add</button>
                </div>
                {PAY_RATES.map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    style={{ padding: '9px 10px', backgroundColor: T.bg, borderRadius: '7px', border: `1px solid ${T.border}`, marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{r.type}</div>
                        <div style={{ fontSize: '9px', color: T.textMuted }}>{r.note}</div>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent }}>{r.amount}</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {scene === 'certs' && (
              <motion.div key="certs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', height: '100%', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Certifications</div>
                  <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}><Plus size={9} />Add</button>
                </div>
                {CERTS.map((c, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    style={{ padding: '8px 10px', backgroundColor: T.bg, borderRadius: '7px', border: `1px solid ${c.status === 'expired' ? '#ef4444' : T.border}`, marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, paddingRight: '8px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{c.name}</div>
                        <div style={{ fontSize: '9px', color: T.textMuted }}>Issued {c.issued} · Expires {c.expires}</div>
                      </div>
                      <span style={{ padding: '2px 6px', borderRadius: '5px', fontSize: '8px', fontWeight: '600', backgroundColor: c.status === 'expired' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: c.status === 'expired' ? '#ef4444' : '#22c55e', flexShrink: 0 }}>
                        {c.status === 'expired' ? 'Expired' : 'Valid'}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* invite: grid + modal */}
      {scene === 'invite' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '270px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Invite Employee</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Name', 'Jennifer Walsh'], ['Email', 'jwalsh@acme.com'], ['Role', 'Sales'], ['User Access', 'User']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '9px', fontWeight: '500', color: T.textSecondary, marginBottom: '2px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              <button style={{ padding: '8px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <Send size={11} />Send Invitation
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    roster: '1 · Team roster — avatar with role color, Active/W2 badges, one card per employee',
    detail: '2 · Employee detail — start date, department, reports-to, hire source',
    rates:  '3 · Pay rates — base salary, commission %, bonus cap — all in one place',
    certs:  '4 · Certifications — OSHA, EPA, NABCEP — valid/expired status, expiry dates',
    invite: '5 · Invite modal — name, email, role · sends a magic link, no password needed',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to add your team'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
