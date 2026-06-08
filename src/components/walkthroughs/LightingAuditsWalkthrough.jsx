// Lighting Audits walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/LightingAudits.jsx + src/lib/statusColors.js (auditStatusColors)
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, Plus, Search, User, Zap, DollarSign, TrendingDown } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/lighting-audits.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// auditStatusColors from statusColors.js
const STATUS_COLORS = {
  'Draft':       { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'In Progress': { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Completed':   { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  'Submitted':   { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b' },
  'Approved':    { bg: 'rgba(22,163,74,0.12)',   text: '#16a34a' },
  'Rejected':    { bg: 'rgba(139,90,90,0.12)',   text: '#8b5a5a' },
}

const MOCK_AUDITS = [
  { id: 1, audit_id: 'AUD-0041', customer: 'Northbridge Logistics', city: 'Salt Lake City', state: 'UT', status: 'In Progress', utility: 'RMP Wattsmart', fixtures: 48, annual_kwh_savings: 42800, rebate: 8400, date: 'Jun 5' },
  { id: 2, audit_id: 'AUD-0038', customer: 'Solera Electric HQ',    city: 'Draper',         state: 'UT', status: 'Submitted',   utility: 'SRP Solutions', fixtures: 32, annual_kwh_savings: 28600, rebate: 5900, date: 'Jun 2' },
  { id: 3, audit_id: 'AUD-0035', customer: 'Apex Solar Warehouse',  city: 'Phoenix',        state: 'AZ', status: 'Approved',    utility: 'APS Bright',   fixtures: 64, annual_kwh_savings: 61200, rebate: 14800, date: 'May 28' },
  { id: 4, audit_id: 'AUD-0032', customer: 'City Storage Units',    city: 'Ogden',          state: 'UT', status: 'Draft',       utility: 'RMP Wattsmart', fixtures: 0, annual_kwh_savings: 0, rebate: 0, date: 'May 24' },
]

export default function LightingAuditsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every rebate captured." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const audits = scene === 'empty' ? [] : MOCK_AUDITS

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, overflow: 'hidden' }}>
      {/* PageHeader */}
      <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <ClipboardList size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Lighting Audits</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={10} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input readOnly placeholder="Search..." style={{ padding: '4px 6px 4px 18px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '9px', backgroundColor: T.bg, color: T.text, outline: 'none', width: '80px' }} />
          </div>
          <select style={{ padding: '4px 6px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '9px', backgroundColor: T.bg, color: T.textSecondary }}>
            <option>All Status</option>
          </select>
          <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', fontSize: '9px', color: T.textSecondary, cursor: 'pointer' }}>
            <User size={9} />My Audits
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>
            <Plus size={10} />New Audit
          </button>
        </div>
      </div>

      {/* Audit list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {audits.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, padding: '40px' }}>
            <ClipboardList size={32} style={{ color: T.textMuted, marginBottom: '8px' }} />
            <p style={{ color: T.textSecondary, fontSize: '11px', margin: 0 }}>No lighting audits found. Click "New Audit" to create one.</p>
          </div>
        ) : audits.map((audit, i) => {
          const sc = STATUS_COLORS[audit.status] || STATUS_COLORS['Draft']
          return (
            <motion.div key={audit.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', cursor: 'pointer' }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>{audit.customer}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '9px', fontSize: '9px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>{audit.status}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: T.textMuted }}>{audit.audit_id} · {audit.city}, {audit.state}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10px', color: T.textMuted }}>{audit.date}</div>
              </div>
              {/* Stats row */}
              {audit.rebate > 0 && (
                <div style={{ display: 'flex', gap: '12px', fontSize: '10px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: T.textSecondary }}><Zap size={10} style={{ color: T.accent }} />{audit.utility}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#3b82f6' }}>{audit.fixtures} fixtures</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#22c55e' }}><TrendingDown size={10} />{audit.annual_kwh_savings.toLocaleString()} kWh/yr</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b' }}><DollarSign size={10} />${audit.rebate.toLocaleString()} rebate</span>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:  '1 · Lighting Audits — ClipboardList header, status filter, My Audits toggle, New Audit',
    list:   '2 · Audit cards — customer, status badge, audit ID, city/state, utility, kWh savings, rebate $',
    detail: '3 · Open an audit → fixture inventory by zone + Lenard AI suggests measure codes',
    submit: '4 · Submit to utility for approval — status flips from Completed → Submitted',
    rebate: '5 · Approved → rebate amount flows into the project invoice as a utility incentive',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Lighting Audits work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
