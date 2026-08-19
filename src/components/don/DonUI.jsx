// Shared UI primitives for Don's workspace.
//
// Built phone-first. Don gets used standing in a hole with one thumb and a
// glove on the other hand, so: 48px minimum targets, numeric keyboards on
// every number field, the primary action pinned to the bottom of the screen
// within thumb reach, and the running total always visible so nobody has to
// scroll to find out what the bid is worth.
//
// Grid tracks are minmax(0,1fr), never 1fr — the root sets overflowX:hidden
// so a 1fr track that refuses to shrink clips its content silently instead of
// scrolling, and you never see it on desktop.

import { useEffect } from 'react'
import { X } from 'lucide-react'

export const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgSunk: '#f2efe6', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentHover: '#4a5239', accentBg: 'rgba(90,99,73,0.12)',
  clay: '#a06a44', clayBg: 'rgba(160,106,68,0.12)',
  success: '#22c55e', danger: '#ef4444', warning: '#eab308', info: '#3b82f6',
}

export const TOUCH = 48

export const fmtMoney = (n) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export const fmtNum = (n, d = 0) =>
  (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })

// ── Layout ───────────────────────────────────────────────────────────────

export function Screen({ children, bottomInset = 0 }) {
  return (
    <div style={{
      padding: 16,
      paddingBottom: 16 + bottomInset,
      maxWidth: 1200,
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {children}
    </div>
  )
}

export function Card({ children, onClick, style, accent }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderLeft: accent ? `4px solid ${accent}` : `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 14,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 1px 2px rgba(44,53,48,0.04)',
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '18px 0 8px' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: T.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{children}</div>
      {right}
    </div>
  )
}

// ── Buttons ──────────────────────────────────────────────────────────────

export function Btn({ children, onClick, variant = 'primary', disabled, full, style, type = 'button' }) {
  const variants = {
    primary: { background: T.accent, color: '#fff', border: `1px solid ${T.accent}` },
    ghost:   { background: 'transparent', color: T.textSecondary, border: `1px solid ${T.border}` },
    danger:  { background: 'transparent', color: T.danger, border: `1px solid ${T.danger}` },
    clay:    { background: T.clay, color: '#fff', border: `1px solid ${T.clay}` },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: TOUCH,
        padding: '0 18px',
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// Selection chips — big enough to hit while wearing gloves.
export function Chip({ children, active, onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44,
        padding: '8px 14px',
        borderRadius: 999,
        border: `1.5px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentBg : T.bgCard,
        color: active ? T.accent : T.textSecondary,
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ── Inputs ───────────────────────────────────────────────────────────────

const fieldBase = {
  width: '100%',
  minHeight: TOUCH,
  padding: '10px 12px',
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  background: T.bg,
  color: T.text,
  fontSize: 16,          // 16px or iOS zooms on focus
  boxSizing: 'border-box',
}

export function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 6 }}>{label}</div>
      )}
      {children}
      {hint && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{hint}</div>}
    </label>
  )
}

export function TextInput({ value, onChange, placeholder, ...rest }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={fieldBase}
      {...rest}
    />
  )
}

// Big numeric field. inputMode="decimal" so phones show the number pad
// instead of a full keyboard, and the unit rides inside the box so the
// number itself stays large and readable in sunlight.
export function NumInput({ value, onChange, unit, placeholder, big }) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value === '' ? '' : e.target.value)}
        placeholder={placeholder}
        style={{
          ...fieldBase,
          minHeight: big ? 60 : TOUCH,
          fontSize: big ? 26 : 16,
          fontWeight: big ? 700 : 500,
          paddingRight: unit ? 52 : 12,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      {unit && (
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, fontWeight: 600, color: T.textMuted, pointerEvents: 'none',
        }}>{unit}</span>
      )}
    </div>
  )
}

export function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ ...fieldBase, appearance: 'auto' }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        minHeight: TOUCH, padding: '10px 12px', textAlign: 'left',
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, cursor: 'pointer',
      }}
    >
      <div style={{
        width: 46, height: 28, borderRadius: 999, flexShrink: 0,
        background: checked ? T.accent : '#cfc8b6',
        position: 'relative', transition: 'background 120ms',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 22, height: 22, borderRadius: '50%', background: '#fff',
          transition: 'left 120ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: T.textMuted }}>{hint}</div>}
      </div>
    </button>
  )
}

// ── Bottom sheet — the workhorse of the phone UI ─────────────────────────
// Slides up from the bottom on a phone (thumb reach, familiar gesture
// affordance) and becomes a centered dialog on a laptop.

export function Sheet({ open, onClose, title, children, footer, isMobile }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(44,53,48,0.45)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        zIndex: 1200, padding: isMobile ? 0 : 16,
      }}
    >
      <div style={{
        background: T.bgCard,
        width: '100%',
        maxWidth: isMobile ? '100%' : 560,
        maxHeight: isMobile ? '92dvh' : '90dvh',
        borderRadius: isMobile ? '18px 18px 0 0' : 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 -4px 24px rgba(44,53,48,0.18)',
      }}>
        {/* Grab handle — signals "drag me" even though tapping the scrim works too */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: T.border }} />
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${T.border}`, gap: 8,
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: 12, borderTop: `1px solid ${T.border}`, background: T.bgSunk,
            paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── The running total bar ────────────────────────────────────────────────
// Pinned to the bottom on a phone. An excavator adding items wants to watch
// the yardage and the dollar figure move as they go — that's the whole feel
// of the thing, and burying it at the end of a scroll kills it.

export function StatBar({ stats, action, isMobile }) {
  return (
    <div style={{
      position: isMobile ? 'fixed' : 'sticky',
      bottom: 0, left: 0, right: 0,
      background: T.bgCard,
      borderTop: `1px solid ${T.border}`,
      boxShadow: '0 -2px 12px rgba(44,53,48,0.10)',
      zIndex: 900,
      padding: '10px 14px',
      paddingBottom: `calc(10px + env(safe-area-inset-bottom, 0px))`,
      display: 'flex', alignItems: 'center', gap: 12,
      minWidth: 0,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        gap: 10, flex: 1, minWidth: 0,
      }}>
        {stats.map((s) => (
          <div key={s.label} style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: T.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{s.label}</div>
            <div style={{
              fontSize: s.big ? 20 : 17, fontWeight: 700,
              color: s.color || T.text, fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{s.value}</div>
          </div>
        ))}
      </div>
      {action}
    </div>
  )
}

// ── Small bits ───────────────────────────────────────────────────────────

export function Badge({ children, tone = 'muted', title }) {
  const tones = {
    muted:   { bg: T.bgSunk, fg: T.textMuted, bd: T.border },
    accent:  { bg: T.accentBg, fg: T.accent, bd: T.accent },
    clay:    { bg: T.clayBg, fg: T.clay, bd: T.clay },
    success: { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', bd: T.success },
    warning: { bg: 'rgba(234,179,8,0.14)', fg: '#8a6d0b', bd: T.warning },
    danger:  { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c', bd: T.danger },
  }
  const c = tones[tone] || tones.muted
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}33`,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function Note({ children, tone = 'warning', icon: Icon }) {
  const tones = {
    warning: { bg: 'rgba(234,179,8,0.10)', bd: T.warning, fg: '#7a6009' },
    danger:  { bg: 'rgba(239,68,68,0.08)', bd: T.danger, fg: '#b91c1c' },
    info:    { bg: 'rgba(59,130,246,0.08)', bd: T.info, fg: '#1d4ed8' },
    accent:  { bg: T.accentBg, bd: T.accent, fg: T.accent },
  }
  const c = tones[tone] || tones.warning
  return (
    <div style={{
      display: 'flex', gap: 10, padding: 12, borderRadius: 10,
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
      fontSize: 13, lineHeight: 1.45, minWidth: 0,
    }}>
      {Icon && <Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

export function Empty({ icon: Icon, title, body, action }) {
  return (
    <div style={{
      textAlign: 'center', padding: '48px 20px',
      border: `1px dashed ${T.border}`, borderRadius: 14, background: T.bgCard,
    }}>
      {Icon && <Icon size={40} style={{ color: T.textMuted, marginBottom: 12 }} />}
      <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 6 }}>{title}</div>
      {body && <div style={{ fontSize: 14, color: T.textMuted, maxWidth: 380, margin: '0 auto 16px' }}>{body}</div>}
      {action}
    </div>
  )
}

// Provenance chip — every quantity says where it came from. This is the
// trust story: a contractor can tap any number and find out whether a human
// typed it, a plan said it, or the AI guessed it.
export function SourceBadge({ source, confidence, confirmed }) {
  const map = {
    manual:      { label: 'Typed', tone: 'muted' },
    measured:    { label: 'Measured', tone: 'accent' },
    plan:        { label: 'From plan', tone: 'accent' },
    handwritten: { label: 'Field notes', tone: 'clay' },
    ai_photo:    { label: 'AI', tone: 'clay' },
  }
  const m = map[source] || map.manual
  const pct = confidence != null ? ` ${Math.round(confidence * 100)}%` : ''
  const needsReview = confidence != null && confidence < 0.7 && !confirmed
  return (
    <Badge tone={needsReview ? 'warning' : m.tone} title={needsReview ? 'Below the confidence threshold — confirm before sending' : undefined}>
      {m.label}{pct}{needsReview ? ' · check' : ''}
    </Badge>
  )
}
