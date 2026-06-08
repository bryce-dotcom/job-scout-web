// Utility Programs walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/UtilityPrograms.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Plus, Search, Calendar, CheckCircle, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/utility-programs.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_PROGRAMS = [
  { id: 1, program_name: 'Wattsmart Business Program',  utility_name: 'Rocky Mountain Power', state: 'UT', type: 'Prescriptive', effective: '2026-01-01', expires: '2026-12-31', pre_approval: true,  dlc: true  },
  { id: 2, program_name: 'Business Energy Solutions',   utility_name: 'SRP',                  state: 'AZ', type: 'Prescriptive', effective: '2026-01-01', expires: '2026-12-31', pre_approval: false, dlc: true  },
  { id: 3, program_name: 'Energy Savings Program',      utility_name: 'PacifiCorp',           state: 'UT', type: 'Custom',       effective: '2025-07-01', expires: '2026-06-30', pre_approval: true,  dlc: false },
  { id: 4, program_name: 'Arizona Public Service',      utility_name: 'APS',                  state: 'AZ', type: 'Prescriptive', effective: '2026-01-01', expires: null,         pre_approval: false, dlc: true  },
]

export default function UtilityProgramsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="All utility programs loaded." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showModal = scene === 'add'
  const programs = scene === 'empty' ? [] : MOCK_PROGRAMS

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Utility Programs</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Program
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder="Search programs..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
      </div>

      {/* Programs */}
      {programs.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <Zap size={32} style={{ color: T.textMuted, marginBottom: '8px' }} />
          <p style={{ color: T.textSecondary, fontSize: '11px', margin: 0 }}>No utility programs. Add your first program.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto' }}>
          {programs.map((prog, i) => (
            <motion.div key={prog.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px 14px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text, marginBottom: '1px' }}>{prog.program_name}</div>
                  <div style={{ fontSize: '10px', color: T.textMuted }}>{prog.utility_name} · {prog.state}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                  <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600', backgroundColor: prog.type === 'Prescriptive' ? 'rgba(59,130,246,0.12)' : 'rgba(139,92,246,0.12)', color: prog.type === 'Prescriptive' ? '#3b82f6' : '#8b5cf6' }}>{prog.type}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '9px', color: T.textMuted, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={9} />{prog.effective} → {prog.expires || 'ongoing'}</span>
                {prog.pre_approval && <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b' }}>⚠ Pre-approval req</span>}
                {prog.dlc && <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#22c55e' }}><CheckCircle size={9} />DLC req</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Program modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Utility Program</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Program Name', 'Wattsmart Business Program'], ['Utility', 'Rocky Mountain Power'], ['State', 'UT'], ['Type', 'Prescriptive'], ['Effective Date', '2026-01-01']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Add</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:  '1 · Utility Programs — list of rebate programs per utility provider',
    add:    '2 · Add Program — program name, utility, state, type, effective date',
    list:   '3 · Program cards — utility, state, Prescriptive/Custom, dates, pre-approval flag, DLC req',
    rates:  '4 · Click → opens Rebate Measures (measure codes + $/unit for that program)',
    lenard: '5 · Lenard reads these programs when building audit estimates for a customer',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Utility Programs work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
