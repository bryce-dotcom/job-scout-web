// Rebate Measures walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/RebateRates.jsx (route: /utility-programs/:id/rates)
// DO NOT import ZachShell — reproduces the measure code table with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Coins, Plus, Search, Calculator, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/rebate-measures.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Mock measure codes (matching rebate_rates table shape)
const MOCK_MEASURES = [
  { id: 1, code: 'L1A', description: 'Linear Fluorescent T8 → LED — 24"',      baseline_w: 28, proposed_w: 12, per_unit: 18,  cap_per_unit: 25,  cap_per_project: null },
  { id: 2, code: 'L2A', description: 'Linear Fluorescent T8 → LED — 48"',      baseline_w: 56, proposed_w: 22, per_unit: 24,  cap_per_unit: 30,  cap_per_project: null },
  { id: 3, code: 'H1B', description: 'High Bay HID → LED',                     baseline_w: 400,proposed_w: 150,per_unit: 80,  cap_per_unit: 120, cap_per_project: 50000 },
  { id: 4, code: 'H2B', description: 'High Bay T5HO → LED',                    baseline_w: 220,proposed_w: 110,per_unit: 60,  cap_per_unit: 90,  cap_per_project: null },
  { id: 5, code: 'E1A', description: 'Exit Sign — Fluorescent → LED',          baseline_w: 40, proposed_w: 3,  per_unit: 12,  cap_per_unit: 15,  cap_per_project: null },
  { id: 6, code: 'OD1', description: 'Outdoor Area Lighting → LED',            baseline_w: 175,proposed_w: 70, per_unit: 45,  cap_per_unit: 65,  cap_per_project: null },
]

export default function RebateMeasuresWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Rebate tables loaded." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const highlightRow = scene === 'row' ? 3 : null // H1B highlight

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Coins size={15} style={{ color: T.accent }} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Rebate Measures</span>
          </div>
          <div style={{ fontSize: '10px', color: T.textMuted }}>Wattsmart Business Program · Rocky Mountain Power · UT · 2026</div>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={10} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input readOnly placeholder="Search measures..." style={{ padding: '4px 6px 4px 18px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '9px', backgroundColor: T.bgCard, color: T.text, outline: 'none', width: '100px' }} />
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>
            <Plus size={10} />Add Measure
          </button>
        </div>
      </div>

      {/* Measures table */}
      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Code', 'Description', 'Baseline W', 'Proposed W', 'Savings W', '$/Unit', 'Cap/Unit'].map(col => (
                <th key={col} style={{ padding: '6px 8px', textAlign: col.includes('W') || col.includes('$') || col.includes('/') ? 'right' : 'left', fontSize: '8px', fontWeight: '700', color: T.textMuted, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_MEASURES.map((m, i) => (
              <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: highlightRow === m.id ? T.accentBg : 'transparent' }}
              >
                <td style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: T.accent }}>{m.code}</td>
                <td style={{ padding: '6px 8px', fontSize: '9px', color: T.text, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</td>
                <td style={{ padding: '6px 8px', fontSize: '9px', color: T.textMuted, textAlign: 'right' }}>{m.baseline_w}W</td>
                <td style={{ padding: '6px 8px', fontSize: '9px', color: T.textMuted, textAlign: 'right' }}>{m.proposed_w}W</td>
                <td style={{ padding: '6px 8px', fontSize: '9px', fontWeight: '600', color: '#22c55e', textAlign: 'right' }}>{m.baseline_w - m.proposed_w}W</td>
                <td style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: T.accent, textAlign: 'right' }}>${m.per_unit}</td>
                <td style={{ padding: '6px 8px', fontSize: '9px', color: m.cap_per_unit ? T.textSecondary : T.textMuted, textAlign: 'right' }}>{m.cap_per_unit ? `$${m.cap_per_unit}` : '—'}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Math preview for scene 'audit' */}
      {scene === 'audit' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Calculator size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
          <div style={{ fontSize: '10px', color: '#15803d' }}>
            <strong>H1B × 32 fixtures</strong> → 32 × $80 = $2,560 rebate · cap $120/unit = $2,560 ✓
          </div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    table:  '1 · Rebate Measures — measure codes per utility program + baseline/proposed W + $/unit',
    row:    '2 · Each row: code (L1A, H1B…), description, watts before/after, dollars per unit, cap',
    audit:  '3 · Lenard picks the right code per fixture · math auto-calculates: qty × $/unit',
    cap:    '4 · Cap per unit and per project enforce utility limits — engine applies them automatically',
    update: '5 · New utility year? Add updated rows — old audits stay locked to their year\'s rates',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Rebate Measures work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
