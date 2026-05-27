// SetupChecklist — shared "now here's how to turn it on" segment used
// by walkthroughs after the marketing reel finishes.
//
// Visual:
//   - Compact header: "Set it up in N steps"
//   - Vertical list of step cards
//   - Each step has an icon, title, body, and a status (pending / active
//     / done). As `currentIdx` advances, the active step expands and
//     prior steps collapse into a checkmark.
//
// The parent walkthrough drives `currentIdx` (and narration) — this
// component is purely presentational so it stays light and reusable.

import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from 'lucide-react'
import { Check } from 'lucide-react'

const T = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e',
}

export default function SetupChecklist({ title = 'Set it up', steps, currentIdx, showIntro = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      style={{
        width: '82%',
        maxWidth: 560,
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: '0 12px 30px rgba(0,0,0,0.10)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '12px 18px',
        borderBottom: `1px solid ${T.border}`,
        backgroundColor: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icons.ListChecks size={15} style={{ color: T.accent }} />
          {title}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>
          {steps.length} {steps.length === 1 ? 'step' : 'steps'}
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => {
          const status = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'
          return <StepRow key={i} step={step} index={i} status={status} />
        })}
      </div>
    </motion.div>
  )
}

function StepRow({ step, index, status }) {
  const Icon = (step.icon && Icons[step.icon]) || Icons.Circle
  const isDone = status === 'done'
  const isActive = status === 'active'
  const isPending = status === 'pending'

  return (
    <motion.div
      layout
      initial={false}
      animate={{
        backgroundColor: isActive ? T.accentBg : 'transparent',
        borderColor: isActive ? T.accent : T.border,
      }}
      transition={{ duration: 0.25 }}
      style={{
        padding: '10px 12px',
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      {/* Status badge */}
      <motion.div
        layout
        animate={{
          backgroundColor: isDone ? T.success : isActive ? T.accent : 'transparent',
          borderColor: isDone ? T.success : isActive ? T.accent : T.border,
          color: isDone || isActive ? '#fff' : T.textMuted,
        }}
        transition={{ duration: 0.25 }}
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: `1.5px solid`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <AnimatePresence mode="wait">
          {isDone ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.2, type: 'spring' }}
              style={{ display: 'inline-flex' }}
            >
              <Check size={14} strokeWidth={3} />
            </motion.span>
          ) : (
            <motion.span
              key="num"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {index + 1}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: isActive ? 700 : 600,
          color: isPending ? T.textMuted : T.text,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: isActive ? 4 : 0,
        }}>
          <Icon size={13} style={{ color: isActive ? T.accent : T.textMuted, flexShrink: 0 }} />
          {step.title}
        </div>
        <AnimatePresence>
          {isActive && step.body && (
            <motion.div
              key="body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.45, overflow: 'hidden' }}
            >
              {step.body}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
