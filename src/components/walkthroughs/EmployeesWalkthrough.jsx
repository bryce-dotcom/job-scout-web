// Employees walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Employees.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, Send, Upload, Download, Settings, User, Mail, Phone, X } from 'lucide-react'
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

function Stage({ scene }) {
  const showModal = scene === 'invite'
  const employees = scene === 'empty' ? [] : scene === 'inactive' ? MOCK_EMPLOYEES : MOCK_EMPLOYEES.filter(e => e.active)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '14px 16px', gap: '10px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: T.text }}>Team</div>
          <div style={{ fontSize: '11px', color: T.textMuted }}>{employees.length} employees</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: T.textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" readOnly defaultChecked={scene === 'inactive'} style={{ accentColor: T.accent }} />
            Show inactive
          </label>
          <button style={{ padding: '5px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textMuted, cursor: 'pointer' }}><Settings size={12} /></button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${T.accent}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.accent, fontSize: '11px', cursor: 'pointer' }}>
            <Send size={11} />Invite
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', cursor: 'pointer' }}>
            <Plus size={11} />Add Employee
          </button>
        </div>
      </div>

      {/* Grid */}
      {employees.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}` }}>
          <User size={36} style={{ color: T.textMuted, marginBottom: '10px' }} />
          <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No employees yet. Add your first team member.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', alignContent: 'start', overflowY: 'auto' }}>
          {employees.map((emp, i) => {
            const color = rc(emp.role)
            return (
              <motion.div key={emp.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: emp.active ? 1 : 0.6, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}
                style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, padding: '16px', textAlign: 'center', cursor: 'pointer' }}
              >
                {/* Avatar */}
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: '18px', fontWeight: '600', color }}>
                  {emp.name.charAt(0)}
                </div>
                {/* Name */}
                <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, marginBottom: '2px' }}>{emp.name}</div>
                {/* Role */}
                <div style={{ fontSize: '11px', color, fontWeight: '500', marginBottom: '6px' }}>{emp.role}</div>
                {/* Badges */}
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '18px', backgroundColor: emp.active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)', color: emp.active ? '#16a34a' : '#6b7280' }}>
                    {emp.active ? 'Active' : 'Inactive'}
                  </span>
                  <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '18px', backgroundColor: emp.tax === 'W2' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)', color: emp.tax === 'W2' ? '#3b82f6' : '#f97316' }}>
                    {emp.tax}
                  </span>
                </div>
                {/* Contact */}
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: T.textSecondary }}>
                    <Mail size={10} style={{ color: T.textMuted }} />{emp.email}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: T.textSecondary }}>
                    <Phone size={10} style={{ color: T.textMuted }} />{emp.phone}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Invite modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Invite Employee</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {[['Name', 'Jennifer Walsh'], ['Email', 'jwalsh@acme.com'], ['Role', 'Sales'], ['User Access', 'User']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
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
    empty:    '1 · Team page — Add Employee + Invite buttons, "Show inactive" checkbox',
    grid:     '2 · Employee grid — avatar (initials in role color), name, role, Active/W2 badges',
    invite:   '3 · Invite modal — name, email, role, user access — sends magic link',
    inactive: '4 · Show inactive reveals dim cards for former team members',
    detail:   '5 · Click any card → employee detail with pay rates, HR docs, time history',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to add your team'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
