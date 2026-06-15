// Photos & Signatures walkthrough — marketing + setup animation.
// Source: src/lib/featureKnowledge/photos-signatures.js

import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Upload, CheckCircle, FileText, MapPin, Shield, X, Download, ExternalLink, PenTool } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/photos-signatures.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const PHOTO_CATEGORIES = [
  {
    label: 'Before',
    color: '#c28b38',
    colorBg: 'rgba(194,139,56,0.12)',
    photos: [
      { id: 1, thumb: '#c9a96e', time: '8:14 AM', by: 'Marcus W.' },
      { id: 2, thumb: '#b8935c', time: '8:16 AM', by: 'Marcus W.' },
      { id: 3, thumb: '#d4aa7a', time: '8:18 AM', by: 'Doug A.' },
      { id: 4, thumb: '#bf9a62', time: '8:19 AM', by: 'Doug A.' },
    ],
  },
  {
    label: 'After',
    color: '#22c55e',
    colorBg: 'rgba(34,197,94,0.12)',
    photos: [
      { id: 5, thumb: '#6aab7d', time: '2:41 PM', by: 'Marcus W.' },
      { id: 6, thumb: '#7bbf8e', time: '2:43 PM', by: 'Marcus W.' },
      { id: 7, thumb: '#5e9e70', time: '2:45 PM', by: 'Doug A.' },
      { id: 8, thumb: '#72b082', time: '2:46 PM', by: 'Doug A.' },
    ],
  },
  {
    label: 'Completed Work',
    color: '#3b82f6',
    colorBg: 'rgba(59,130,246,0.12)',
    photos: [
      { id: 9,  thumb: '#7aa8d6', time: '3:02 PM', by: 'Marcus W.' },
      { id: 10, thumb: '#6898c8', time: '3:04 PM', by: 'Marcus W.' },
      { id: 11, thumb: '#8ab4dc', time: '3:05 PM', by: 'Doug A.' },
    ],
  },
  {
    label: 'General',
    color: '#7d8a7f',
    colorBg: 'rgba(125,138,127,0.12)',
    photos: [
      { id: 12, thumb: '#a0acaa', time: '9:30 AM', by: 'Marcus W.' },
      { id: 13, thumb: '#b0bcba', time: '1:15 PM', by: 'Doug A.' },
    ],
  },
]

const CATEGORY_CHIPS = ['Before', 'After', 'Completed', 'Cleanliness', 'General']

export default function PhotosSignaturesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Proof captured." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function PhotoThumb({ photo, catColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        backgroundColor: photo.thumb,
        borderRadius: '6px',
        aspectRatio: '4/3',
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${T.border}`,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Camera size={12} style={{ color: 'rgba(255,255,255,0.7)' }} />
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
        padding: '4px 4px 3px',
      }}>
        <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.9)', fontWeight: '500', lineHeight: 1.2 }}>{photo.time}</div>
        <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.2 }}>{photo.by}</div>
      </div>
    </motion.div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {scene === 'photos' && <ScenePhotos />}
      {scene === 'capture' && <SceneCapture />}
      {scene === 'signature' && <SceneSignature />}
      {scene === 'signed' && <SceneSigned />}
    </div>
  )
}

function ScenePhotos() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Photos</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>JOB-2847 · Okafor Commercial</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, color: T.textSecondary, fontSize: '9px', cursor: 'pointer' }}>
            <Upload size={9} />Upload
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>
            <Camera size={9} />Capture
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {PHOTO_CATEGORIES.map((cat, ci) => (
          <motion.div key={cat.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.06 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
              <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: cat.colorBg, color: cat.color }}>{cat.label}</span>
              <span style={{ fontSize: '9px', color: T.textMuted }}>{cat.photos.length} photo{cat.photos.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cat.photos.length}, minmax(0, 1fr))`, gap: '5px' }}>
              {cat.photos.map((photo, pi) => (
                <motion.div key={photo.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.06 + pi * 0.04 }}>
                  <PhotoThumb photo={photo} catColor={cat.color} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </>
  )
}

function SceneCapture() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <Camera size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Capture Photo</span>
        <span style={{ marginLeft: 'auto', fontSize: '9px', color: T.accent, fontWeight: '600', backgroundColor: T.accentBg, padding: '2px 7px', borderRadius: '8px' }}>3 of 6 required</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            flex: 1,
            border: `2px dashed ${T.border}`,
            borderRadius: '10px',
            backgroundColor: '#e8e4dc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: '8px', right: '8px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.3)' }} />
          <Camera size={28} style={{ color: T.textMuted }} />
          <div style={{ fontSize: '10px', color: T.textMuted, textAlign: 'center', lineHeight: 1.4 }}>
            Camera preview<br />
            <span style={{ fontSize: '9px' }}>Tap to focus · Hold steady</span>
          </div>
          <div style={{ position: 'absolute', inset: 0, border: '24px solid transparent', borderImage: 'none', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '10px', left: '10px', width: '14px', height: '14px', borderTop: `2px solid rgba(90,99,73,0.5)`, borderLeft: `2px solid rgba(90,99,73,0.5)`, borderRadius: '2px 0 0 0' }} />
            <div style={{ position: 'absolute', top: '10px', right: '10px', width: '14px', height: '14px', borderTop: `2px solid rgba(90,99,73,0.5)`, borderRight: `2px solid rgba(90,99,73,0.5)`, borderRadius: '0 2px 0 0' }} />
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '14px', height: '14px', borderBottom: `2px solid rgba(90,99,73,0.5)`, borderLeft: `2px solid rgba(90,99,73,0.5)`, borderRadius: '0 0 0 2px' }} />
            <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '14px', height: '14px', borderBottom: `2px solid rgba(90,99,73,0.5)`, borderRight: `2px solid rgba(90,99,73,0.5)`, borderRadius: '0 0 2px 0' }} />
          </div>
        </motion.div>

        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '5px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {CATEGORY_CHIPS.map((chip, i) => (
              <motion.span
                key={chip}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{
                  padding: '4px 9px',
                  borderRadius: '12px',
                  fontSize: '9px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: chip === 'After' ? T.accent : T.bgCard,
                  color: chip === 'After' ? '#fff' : T.textSecondary,
                  border: `1px solid ${chip === 'After' ? T.accent : T.border}`,
                }}
              >
                {chip}
              </motion.span>
            ))}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Note (optional)</div>
          <div style={{ padding: '6px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bgCard, fontSize: '10px', color: T.textMuted, fontStyle: 'italic' }}>
            e.g. "North wall fixture bank, row 2"
          </div>
        </div>

        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ flexShrink: 0, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
        >
          <Camera size={14} />
          Capture Photo
        </motion.button>
      </div>
    </>
  )
}

function SceneSignature() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <PenTool size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Customer Signature Required</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Marcus Okafor</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>Okafor Commercial Properties · Owner</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: T.textMuted }}>JOB-2847</div>
              <div style={{ fontSize: '9px', color: T.textSecondary, fontWeight: '500' }}>Completion Sign-off</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            flex: 1,
            border: `2px dashed ${T.accent}`,
            borderRadius: '10px',
            backgroundColor: 'rgba(90,99,73,0.03)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            position: 'relative',
          }}
        >
          <PenTool size={18} style={{ color: T.accent, opacity: 0.4 }} />
          <div style={{ fontSize: '10px', color: T.textMuted, fontStyle: 'italic' }}>Sign here</div>
          <div style={{ position: 'absolute', bottom: '8px', left: '10px', right: '10px', height: '1px', backgroundColor: T.border }} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}
        >
          <button style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, color: T.textSecondary, fontSize: '9px', cursor: 'pointer' }}>
            Clear
          </button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Jun 11, 2026 · 3:42 PM</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>IP: 192.168.1.42</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ flexShrink: 0, padding: '7px 10px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '6px', fontSize: '8px', color: '#3b82f6', lineHeight: 1.5 }}
        >
          <span style={{ fontWeight: '600' }}>ESIGN Disclosure:</span> By signing below you agree this electronic signature has the same legal effect as a handwritten signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN).
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{ flexShrink: 0, padding: '9px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
        >
          <CheckCircle size={13} />
          Confirm Signature
        </motion.button>
      </div>
    </>
  )
}

function SceneSigned() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={15} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Signature on File</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '8px', fontSize: '9px', fontWeight: '700', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
          <Shield size={9} />ESIGN Compliant
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', flexShrink: 0 }}
        >
          <div style={{ backgroundColor: 'rgba(34,197,94,0.06)', borderBottom: `1px solid ${T.border}`, padding: '7px 12px', fontSize: '9px', fontWeight: '600', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle size={10} />Signed · Jun 11, 2026 · 3:44 PM
          </div>
          <div style={{ padding: '10px 12px', position: 'relative', height: '52px', overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox="0 0 300 52" style={{ position: 'absolute', inset: 0 }}>
              <path d="M20,38 C40,20 55,42 70,28 C85,14 95,38 110,30 C125,22 130,38 150,34 C165,30 170,20 185,28 C195,34 200,38 220,36" stroke={T.accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M225,36 C230,34 240,28 250,30 C255,31 258,35 262,34" stroke={T.accent} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ position: 'absolute', bottom: '6px', left: '12px', right: '12px', height: '1px', backgroundColor: T.border }} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', flexShrink: 0 }}
        >
          {[
            ['Signed by', 'Marcus Okafor · Owner'],
            ['Date / Time', 'Jun 11, 2026 · 3:44:22 PM MDT'],
            ['GPS Location', '40.7608° N, 111.8910° W — Salt Lake City, UT'],
            ['IP Address', '192.168.1.42'],
            ['User Agent', 'Safari 17.4 · iPhone iOS 17.4.1'],
          ].map(([label, value], i) => (
            <motion.div key={label} initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.05 }}
              style={{ display: 'flex', padding: '6px 12px', borderBottom: `1px solid ${T.border}`, gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '9px', color: T.textMuted, minWidth: '76px', flexShrink: 0, paddingTop: '1px' }}>{label}</span>
              <span style={{ fontSize: '9px', color: T.text, fontWeight: '500', lineHeight: 1.4, wordBreak: 'break-all' }}>{value}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          style={{ display: 'flex', gap: '7px', flexShrink: 0 }}
        >
          <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px', border: 'none', borderRadius: '7px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
            <Download size={11} />Download PDF
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: '7px', backgroundColor: T.bgCard, color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>
            <ExternalLink size={11} />View on job
          </button>
        </motion.div>
      </div>
    </>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    photos:    '1 · Photo gallery — Before, After, Completed, and General shots organized by category',
    capture:   '2 · Capture flow — category selector, optional note, required-count counter, one-tap save',
    signature: '3 · Signature pad — customer signs on-device with timestamp, IP, and ESIGN disclosure',
    signed:    '4 · Signed record — GPS, IP, user agent captured for legal ESIGN compliance · PDF ready',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Photos & Signatures work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
