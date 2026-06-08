// Fixture Types walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/FixtureTypes.jsx
// DO NOT import ZachShell — reproduces real table structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, Plus, Search, Edit, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/fixture-types.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// fixture_types table shape from FixtureTypes.jsx
const MOCK_FIXTURES = [
  { id: 1, fixture_name: 'T8 4-Lamp Fluorescent Strip — 48"', category: 'Linear',   lamp_type: 'T8', lamp_count: 4, system_wattage: 128, led_replacement_watts: 50  },
  { id: 2, fixture_name: 'T8 2-Lamp Fluorescent Strip — 48"', category: 'Linear',   lamp_type: 'T8', lamp_count: 2, system_wattage: 64,  led_replacement_watts: 25  },
  { id: 3, fixture_name: 'HID 400W Metal Halide High Bay',     category: 'High Bay', lamp_type: 'HID',lamp_count: 1, system_wattage: 440, led_replacement_watts: 150 },
  { id: 4, fixture_name: 'HID 175W Mercury Vapor Wallpack',    category: 'Outdoor',  lamp_type: 'HID',lamp_count: 1, system_wattage: 195, led_replacement_watts: 60  },
  { id: 5, fixture_name: 'CFL 32W Downlight',                  category: 'Recessed', lamp_type: 'CFL',lamp_count: 1, system_wattage: 36,  led_replacement_watts: 12  },
]

export default function FixtureTypesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Fixture library loaded." />}
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

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lightbulb size={16} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Fixture Types</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Fixture Type
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '300px' }}>
        <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder="Search fixture types..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Fixture Name', 'Category', 'Lamp Type', 'System W', 'LED W', ''].map((col, i) => (
                <th key={i} style={{ padding: '7px 10px', textAlign: i >= 3 && i <= 4 ? 'right' : 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_FIXTURES.map((f, i) => (
              <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                style={{ borderBottom: `1px solid ${T.border}` }}
              >
                <td style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '500', color: T.text }}>{f.fixture_name}</td>
                <td style={{ padding: '8px 10px', fontSize: '9px', color: T.textSecondary }}>{f.category}</td>
                <td style={{ padding: '8px 10px', fontSize: '9px', color: T.textSecondary }}>{f.lamp_type} × {f.lamp_count}</td>
                <td style={{ padding: '8px 10px', fontSize: '10px', color: T.text, textAlign: 'right' }}>{f.system_wattage}W</td>
                <td style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '600', color: '#4a7c59', textAlign: 'right' }}>{f.led_replacement_watts}W</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <button style={{ padding: '3px 6px', backgroundColor: T.accentBg, color: T.accent, border: 'none', borderRadius: '4px', cursor: 'pointer' }}><Edit size={10} /></button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Fixture Type</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Name', 'T8 4-Lamp Fluorescent Strip — 48"'], ['Category', 'Linear'], ['Lamp Type', 'T8'], ['Lamps', '4'], ['System Wattage', '128'], ['LED Replacement', '50']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
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
    empty:  '1 · Fixture Types — library of existing fixture profiles + Add Fixture Type',
    table:  '2 · Table: name, category, lamp type × count, System W, LED W (green), Edit',
    add:    '3 · Add modal — name, category, lamp type, count, system wattage, LED wattage',
    lenard: '4 · Lenard reads this library during audits to ID existing fixtures by description',
    savings:'5 · System W − LED W = watt savings per fixture → drives kWh and rebate calculations',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Fixture Types work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
