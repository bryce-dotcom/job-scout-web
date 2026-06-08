// Dougie walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/Dougie.jsx — document reader/OCR agent.
// DO NOT import ZachShell — shows document upload + field extraction.

import { motion, AnimatePresence } from 'framer-motion'
import { FileSearch, Upload, CheckCircle, AlertCircle, Sparkles } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/dougie.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const EXTRACTED_FIELDS = [
  { label: 'Utility',          value: 'Rocky Mountain Power',   confidence: 0.97 },
  { label: 'Account Number',   value: 'ACC-0042-8881',          confidence: 0.99 },
  { label: 'Service Address',  value: '1440 S Temple, SLC, UT', confidence: 0.95 },
  { label: 'Billing Period',   value: 'May 1 – May 31, 2026',   confidence: 0.98 },
  { label: 'kWh Used',         value: '42,800 kWh',             confidence: 0.99 },
  { label: 'Total Due',        value: '$4,820.00',              confidence: 0.96 },
  { label: 'Rate Schedule',    value: 'SC-2 Small Commercial',  confidence: 0.88 },
]

export default function DougieWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="No more manual data entry." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showUpload = scene === 'upload'
  const showExtract = scene === 'extract' || scene === 'review' || scene === 'learn'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileSearch size={15} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Dougie</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Document Reader</span>
      </div>

      {/* Upload zone */}
      {showUpload && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ border: `2px dashed ${T.border}`, borderRadius: '10px', padding: '28px', textAlign: 'center', backgroundColor: T.bgCard, cursor: 'pointer' }}
        >
          <Upload size={28} style={{ color: T.textMuted, marginBottom: '8px' }} />
          <div style={{ fontSize: '12px', fontWeight: '500', color: T.textSecondary }}>Drop utility bill, receipt, or form here</div>
          <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '3px' }}>PDF, JPG, PNG — Dougie reads them all</div>
        </motion.div>
      )}

      {/* Processing animation */}
      {scene === 'extract' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Sparkles size={13} style={{ color: '#d97706' }} />
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#92400e' }}>Dougie is reading RMP_Bill_May2026.pdf…</span>
        </motion.div>
      )}

      {/* Extracted fields */}
      {showExtract && (
        <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: T.accentBg }}>
                {['Field', 'Extracted Value', 'Confidence'].map(col => (
                  <th key={col} style={{ padding: '6px 9px', textAlign: 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXTRACTED_FIELDS.map((f, i) => {
                const confColor = f.confidence >= 0.95 ? '#22c55e' : f.confidence >= 0.90 ? '#f59e0b' : '#ef4444'
                return (
                  <motion.tr key={f.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                    style={{ borderBottom: `1px solid ${T.border}` }}
                  >
                    <td style={{ padding: '7px 9px', fontSize: '10px', fontWeight: '500', color: T.text }}>{f.label}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: T.textSecondary }}>{f.value}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: confColor, fontWeight: '600' }}>{Math.round(f.confidence * 100)}%</td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {scene === 'learn' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <CheckCircle size={13} style={{ color: '#16a34a' }} />
          <div style={{ fontSize: '10px', color: '#15803d' }}>Correction saved — Dougie will apply "Rate Schedule" fix automatically on all future RMP bills.</div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    upload:  '1 · Dougie — drop any document (PDF, JPG) into the zone',
    extract: '2 · Dougie reads the file and extracts structured fields with confidence scores',
    review:  '3 · Review extracted values — edit any field that\'s wrong',
    learn:   '4 · Dougie learns from corrections — same document type gets better every time',
    route:   '5 · Extracted data routes to the right place: utility bill → UtilityInvoices, receipt → Expenses',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Dougie works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
