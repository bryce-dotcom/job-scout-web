// Dougie walkthrough — rebuilt to Prospect Scout standard.
// Source: the Dougie panel on LenardUTRMP / LenardAZSRP and the
// dougie-analyze Edge Function — the handwritten takeoff-sheet reader.
// DO NOT import ZachShell — shows the sheet going in and the areas coming out.
//
// 2026-10-04: this used to draw Dougie reading a utility bill (account
// number, kWh, rate schedule) and routing receipts to Expenses. He never did
// that; see featureKnowledge/dougie.js. Scenes follow the card: upload →
// extract → correct → learn → use.

import { motion, AnimatePresence } from 'framer-motion'
import { FileSearch, Camera, CheckCircle, Sparkles, Pencil } from 'lucide-react'
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

// What Dougie structures out of one handwritten page: areas, each with its
// fixture lines matched to the price book. The warehouse count is the one he
// misread — a 4 that looked like a 9 — and the one the person corrects.
const AREAS = [
  { area: 'Office',      fixture: '2x4 T8 troffer, 4-lamp',   count: 24, height: "9'",  controls: 'switch' },
  { area: 'Warehouse',   fixture: "8' T12 strip, 2-lamp",     count: 49, height: "24'", controls: 'none', fixed: 4 },
  { area: 'Shop',        fixture: '400W MH high bay',         count: 18, height: "22'", controls: 'none' },
  { area: 'Exterior',    fixture: '250W HPS wall pack',       count: 6,  height: "14'", controls: 'photocell' },
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="No more retyping field sheets." />}
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
  const showAreas = scene === 'extract' || scene === 'correct' || scene === 'learn' || scene === 'use'
  const corrected = scene === 'learn' || scene === 'use'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileSearch size={15} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Dougie</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Document Reader · inside Lenard</span>
      </div>

      {/* The sheet going in */}
      {showUpload && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ border: `2px dashed ${T.border}`, borderRadius: '10px', padding: '28px', textAlign: 'center', backgroundColor: T.bgCard, cursor: 'pointer' }}
        >
          <Camera size={28} style={{ color: T.textMuted, marginBottom: '8px' }} />
          <div style={{ fontSize: '12px', fontWeight: '500', color: T.textSecondary }}>Add the photos of the handwritten takeoff sheet</div>
          <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '3px' }}>Up to five pages — tick marks, arrows and coffee rings included</div>
        </motion.div>
      )}

      {/* Reading */}
      {scene === 'extract' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Sparkles size={13} style={{ color: '#d97706' }} />
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#92400e' }}>Dougie is reading takeoff_bldgC_p1.jpg — transcribing, then structuring against the image…</span>
        </motion.div>
      )}

      {/* The areas coming out */}
      {showAreas && (
        <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, borderRadius: '9px', border: `1px solid ${T.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: T.accentBg }}>
                {['Area', 'Fixture (price book)', 'Count', 'Height', 'Controls'].map(col => (
                  <th key={col} style={{ padding: '6px 9px', textAlign: 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a, i) => {
                const wrong = a.fixed != null && !corrected
                const count = a.fixed != null && corrected ? a.fixed : a.count
                return (
                  <motion.tr key={a.area} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                    style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: scene === 'correct' && a.fixed != null ? '#fef2f2' : 'transparent' }}
                  >
                    <td style={{ padding: '7px 9px', fontSize: '10px', fontWeight: '500', color: T.text }}>{a.area}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: T.textSecondary }}>{a.fixture}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', fontWeight: '600', color: wrong ? '#b91c1c' : a.fixed != null ? '#15803d' : T.text }}>
                      {count}
                      {scene === 'correct' && a.fixed != null && <Pencil size={9} style={{ marginLeft: 4, color: '#b91c1c', verticalAlign: 'middle' }} />}
                    </td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: T.textSecondary }}>{a.height}</td>
                    <td style={{ padding: '7px 9px', fontSize: '10px', color: T.textSecondary }}>{a.controls}</td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {scene === 'correct' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Pencil size={13} style={{ color: '#b91c1c' }} />
          <div style={{ fontSize: '10px', color: '#991b1b' }}>Warehouse reads 49 — the sheet says 4. You change it. Dougie records the correction.</div>
        </motion.div>
      )}

      {scene === 'learn' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <CheckCircle size={13} style={{ color: '#16a34a' }} />
          <div style={{ fontSize: '10px', color: '#15803d' }}>Correction saved for your company — replayed as an example the next time Dougie reads a sheet from this crew.</div>
        </motion.div>
      )}

      {scene === 'use' && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: T.accentBg, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <CheckCircle size={13} style={{ color: T.accent }} />
          <div style={{ fontSize: '10px', color: T.text }}>4 areas · 52 fixtures into the Lenard audit. Lenard prices it; the estimate follows.</div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    upload:  '1 · On a Lenard audit, add the photos of the handwritten takeoff sheet',
    extract: '2 · Dougie transcribes the page, then structures it into areas and fixture lines matched to the price book',
    correct: '3 · Review the counts against the sheet — fix anything he misread',
    learn:   '4 · The correction is saved per company and replayed on the next read',
    use:     '5 · The audit is built; Lenard prices it and the estimate follows',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Dougie works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
