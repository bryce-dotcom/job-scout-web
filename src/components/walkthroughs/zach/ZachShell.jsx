// Shared Zach UI primitives used across all 4 lawn-care walkthroughs.
//
// Mirrors the chrome of every Zach page (Properties / Visits /
// Treatments / Pricing): app header with title + action button +
// filter strip + content area. Each walkthrough composes its
// scene-specific content inside <ZachShell />.

import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from 'lucide-react'
import { Plus } from 'lucide-react'

export const T = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgInput: '#f7f5ef',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e',
  successBg: 'rgba(34,197,94,0.10)',
  successDark: '#15803d',
  danger: '#ef4444',
  warning: '#eab308',
  warningBg: 'rgba(234,179,8,0.15)',
  purple: '#a855f7',
  purpleBg: 'rgba(168,85,247,0.10)',
}

// The full Zach page chrome. Children render in the content area.
export function ZachShell({ title, subtitle, actionLabel, actionIcon, actionHighlight, filterChips = [], children }) {
  const ActionIcon = actionIcon || Plus
  return (
    <div style={{
      position: 'absolute', inset: 0,
      padding: 18,
      background: T.bg,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{title}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>{subtitle}</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '8px 14px',
            background: T.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            position: 'relative',
            zIndex: 1,
          }}>
            <ActionIcon size={14} /> {actionLabel}
          </button>
          {actionHighlight && (
            <motion.div
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
              style={{
                position: 'absolute', inset: -4,
                borderRadius: 12, border: `2px solid ${T.accent}`,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Filter strip */}
      {filterChips.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {filterChips.map((chip, i) => (
            <div key={i} style={{
              padding: '6px 10px',
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              fontSize: 11,
              color: T.textSecondary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              minWidth: chip.wide ? 200 : 'auto',
            }}>
              {chip.icon && <chip.icon size={11} style={{ color: T.textMuted }} />}
              {chip.label}
            </div>
          ))}
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

// Empty-state placeholder card (dashed border, centered icon + text).
export function EmptyState({ icon: Icon, headline, hint, ctaLabel }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8,
      background: T.bgCard,
      border: `1px dashed ${T.border}`,
      borderRadius: 11,
      padding: 30,
      textAlign: 'center',
    }}>
      {Icon && <Icon size={32} style={{ color: T.textMuted, opacity: 0.6 }} />}
      <div style={{ fontSize: 13, color: T.textSecondary, fontWeight: 600 }}>{headline}</div>
      {hint && <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 320 }}>{hint}</div>}
      {ctaLabel && (
        <button style={{
          marginTop: 8,
          padding: '7px 14px',
          background: T.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 7,
          fontSize: 11, fontWeight: 600,
          cursor: 'pointer',
        }}>
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

// Form modal overlay. Children = form fields.
export function FormModal({ title, onClose, children, footer }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18,
        zIndex: 5,
      }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 6 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: T.bgCard,
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          maxHeight: '94%',
          overflow: 'auto',
          padding: 18,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</h2>
          <Icons.X size={16} style={{ color: T.textMuted }} />
        </div>
        {children}
        {footer && <div style={{ marginTop: 14 }}>{footer}</div>}
      </motion.div>
    </motion.div>
  )
}

// Form field — label + control. Use with FormInput / FormSelect.
export function Field({ label, children, span }) {
  return (
    <div style={{ marginBottom: 10, ...(span ? { gridColumn: `span ${span}` } : {}) }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// Field input — supports a "typewriter" prop for animated text-in.
export function FormInput({ value, placeholder, focused, typing, cursorEnabled }) {
  return (
    <div style={{
      padding: '8px 10px',
      background: T.bgInput,
      border: `1.5px solid ${focused ? T.accent : T.border}`,
      borderRadius: 7,
      fontSize: 12,
      color: T.text,
      minHeight: 14,
    }}>
      {value || value === 0 ? (
        <>
          {value}
          {typing && cursorEnabled && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{ display: 'inline-block', width: 1.5, height: 11, backgroundColor: T.accent, marginLeft: 2, transform: 'translateY(2px)' }}
            />
          )}
        </>
      ) : (
        <span style={{ color: T.textMuted, fontStyle: 'italic' }}>{placeholder}</span>
      )}
    </div>
  )
}

// Two-column row inside a form.
export function FieldRow({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {children}
    </div>
  )
}

// Reusable chip badge.
export function Chip({ icon: Icon, children, color = T.accent, bg = T.accentBg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px',
      borderRadius: 99,
      background: bg,
      color,
      fontSize: 10, fontWeight: 600,
    }}>
      {Icon && <Icon size={10} />}
      {children}
    </span>
  )
}

// Card-row entry (used in lists like Visits, Treatments).
export function ListCard({ children, highlight, flashIn }) {
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, x: -10 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: T.bgCard,
        border: `1.5px solid ${highlight ? T.accent : T.border}`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
      }}
    >
      {children}
    </motion.div>
  )
}

// Save / submit button (used in form footers).
export function FormSubmit({ label, icon: Icon = Icons.Save, color = T.accent }) {
  return (
    <button style={{
      width: '100%',
      padding: '10px 14px',
      background: color,
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      cursor: 'pointer',
    }}>
      <Icon size={13} /> {label}
    </button>
  )
}
