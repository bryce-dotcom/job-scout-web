// Shared chrome components for walkthroughs.
//
// Every walkthrough rendered through useWalkthroughRunner uses these:
//   • <CenteredOverlay /> — semi-transparent backdrop for setup/done
//   • <SetupIntro />      — "Part 2 · Set it up" transition card
//   • <DonePanel />       — final "You're ready" + Replay
//   • <WalkthroughCaption /> — bottom caption strip
//   • <WalkthroughProgressBar /> — bottom progress + phase marker

import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ArrowRight } from 'lucide-react'

const T = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  success: '#22c55e',
}

export function CenteredOverlay({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(247,245,239,0.85)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {children}
    </motion.div>
  )
}

export function SetupIntro({ partLabel = 'Part 2', title = 'Set it up', subtitle = 'A few quick steps.' }) {
  return (
    <CenteredOverlay>
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35 }}
        style={{ textAlign: 'center' }}
      >
        <div style={{
          fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.12em',
          fontWeight: 700, marginBottom: 6,
        }}>
          {partLabel}
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: T.text }}>{title}</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{subtitle}</div>
      </motion.div>
    </CenteredOverlay>
  )
}

export function DonePanel({ onReplay, headline = "You're ready", subtitle = 'Open the feature and try it.' }) {
  return (
    <CenteredOverlay>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
      >
        <motion.div
          initial={{ scale: 0.7 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.4 }}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            backgroundColor: T.success,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(34,197,94,0.4)',
          }}
        >
          <CheckCircle2 size={36} color="#fff" strokeWidth={2.5} />
        </motion.div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{headline}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{subtitle}</div>
        </div>
        <button
          onClick={onReplay}
          style={{
            padding: '8px 16px',
            backgroundColor: T.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(90,99,73,0.3)',
          }}
        >
          Replay <ArrowRight size={12} />
        </button>
      </motion.div>
    </CenteredOverlay>
  )
}

export function WalkthroughCaption({ text }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text || 'empty'}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute',
          left: 18, bottom: 30, right: 18,
          padding: '8px 14px',
          backgroundColor: 'rgba(44,53,48,0.92)',
          color: '#fff',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'center',
          backdropFilter: 'blur(4px)',
          zIndex: 3,
        }}
      >
        {text || ''}
      </motion.div>
    </AnimatePresence>
  )
}

export function WalkthroughProgressBar({ elapsed, total, phaseBoundary }) {
  const pct = Math.min(100, (elapsed / total) * 100)
  const boundaryPct = phaseBoundary ? (phaseBoundary / total) * 100 : null
  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      height: 3,
      backgroundColor: 'rgba(255,255,255,0.25)',
      zIndex: 3,
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        backgroundColor: T.success,
        transition: 'width 0.1s linear',
      }} />
      {boundaryPct != null && (
        <div style={{
          position: 'absolute',
          left: `${boundaryPct}%`,
          top: -2,
          width: 2,
          height: 7,
          backgroundColor: T.accent,
          transform: 'translateX(-50%)',
        }} />
      )}
    </div>
  )
}
