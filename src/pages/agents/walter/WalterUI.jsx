// Walter's small parts.
//
// Inline styles with theme tokens, like nine of the ten agent workspaces —
// Don's kit is Don's. Each piece reads the theme itself rather than being
// handed one, and useTheme comes from ThemeContext, never from Layout: that
// import is a cycle, and it crashed /payroll once.

import { useEffect } from 'react'
import { useTheme } from '../../../components/ThemeContext'

export function Card({ children, pad = 16 }) {
  const { theme } = useTheme()
  return (
    <div style={{
      background: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: 12, padding: pad, boxShadow: theme.shadow, marginBottom: 4,
    }}>
      {children}
    </div>
  )
}

export function SectionLabel({ children, right }) {
  const { theme } = useTheme()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, margin: '18px 0 8px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {children}
      </div>
      {right}
    </div>
  )
}

export function Field({ label, children }) {
  const { theme } = useTheme()
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{label}</div>
      <div style={{ fontSize: 14, color: theme.text, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

export function MiniStat({ label, value, strong }) {
  const { theme } = useTheme()
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 800,
        color: strong ? theme.accent : theme.text,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value ?? '—'}</div>
    </div>
  )
}

export function Note({ children, tone = 'warning', icon: Icon }) {
  const { theme } = useTheme()
  const tones = {
    warning: { bg: 'rgba(234,179,8,0.10)', bd: 'rgba(234,179,8,0.35)', fg: '#a16207' },
    danger: { bg: 'rgba(239,68,68,0.09)', bd: 'rgba(239,68,68,0.32)', fg: '#dc2626' },
    info: { bg: 'rgba(59,130,246,0.09)', bd: 'rgba(59,130,246,0.30)', fg: '#2563eb' },
    accent: { bg: theme.accentBg, bd: theme.accent, fg: theme.accent },
  }
  const t = tones[tone] || tones.warning
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 10,
      padding: '10px 12px', marginTop: 12,
    }}>
      {Icon && <Icon size={16} style={{ color: t.fg, flexShrink: 0, marginTop: 2 }} />}
      <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.55, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

export function Btn({ children, onClick, variant = 'primary', disabled, type = 'button', style }) {
  const { theme } = useTheme()
  const kinds = {
    primary: { background: theme.accent, color: '#fff', border: 'none' },
    secondary: { background: theme.bgCard, color: theme.text, border: `1px solid ${theme.border}` },
    danger: { background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.35)' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        minHeight: 40, whiteSpace: 'nowrap',
        ...kinds[variant], ...style,
      }}
    >
      {children}
    </button>
  )
}

export function Tag({ children, tone }) {
  const { theme } = useTheme()
  const tones = {
    ok: { bg: 'rgba(34,197,94,0.14)', fg: '#16a34a' },
    warn: { bg: 'rgba(234,179,8,0.16)', fg: '#a16207' },
    danger: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626' },
    accent: { bg: theme.accentBg, fg: theme.accent },
    muted: { bg: 'rgba(125,138,127,0.14)', fg: theme.textMuted },
  }
  const t = tones[tone] || tones.muted
  return (
    <span style={{
      background: t.bg, color: t.fg, borderRadius: 999,
      padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

/* ── form controls ─────────────────────────────────────────────────────── */

export function FormField({ label, hint, error, children }) {
  const { theme } = useTheme()
  return (
    <div style={{ minWidth: 0, marginBottom: 12 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
      }}>
        {label}
      </label>
      {children}
      {error
        ? <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4, lineHeight: 1.4 }}>{error}</div>
        : hint
          ? <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
          : null}
    </div>
  )
}

function inputStyle(theme, invalid) {
  return {
    width: '100%', boxSizing: 'border-box', minHeight: 42,
    padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${invalid ? '#dc2626' : theme.border}`,
    background: theme.bg, color: theme.text, fontSize: 15, outline: 'none',
  }
}

export function TextInput({ value, onChange, placeholder, invalid, type = 'text' }) {
  const { theme } = useTheme()
  return (
    <input
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={inputStyle(theme, invalid)}
    />
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3 }) {
  const { theme } = useTheme()
  return (
    <textarea
      value={value ?? ''}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ ...inputStyle(theme), resize: 'vertical', lineHeight: 1.5 }}
    />
  )
}

/** Numbers come back as numbers, or null for an empty box — never NaN. */
export function NumInput({ value, onChange, placeholder, invalid, step }) {
  const { theme } = useTheme()
  return (
    <input
      type="number"
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value
        onChange?.(raw === '' ? null : Number(raw))
      }}
      style={{ ...inputStyle(theme, invalid), fontVariantNumeric: 'tabular-nums' }}
    />
  )
}

export function Select({ value, onChange, options, placeholder, invalid }) {
  const { theme } = useTheme()
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value || null)}
      style={inputStyle(theme, invalid)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  const { theme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{
        width: 42, height: 26, borderRadius: 999, flexShrink: 0, position: 'relative',
        background: checked ? theme.accent : 'rgba(125,138,127,0.35)', transition: 'background 120ms',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: checked ? 19 : 3,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transition: 'left 120ms',
        }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: theme.text }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 12, color: theme.textMuted }}>{hint}</span>}
      </span>
    </button>
  )
}

/**
 * A bottom sheet on a phone, a centred panel on a laptop.
 *
 * Escape closes it and the page behind stops scrolling while it is open —
 * both of which a sheet has to do, and neither of which is obvious until it
 * does not.
 */
export function Sheet({ open, onClose, title, children, footer, isMobile }) {
  const { theme } = useTheme()
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
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
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20,24,21,0.45)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bgCard, width: '100%', maxWidth: isMobile ? '100%' : 560,
          maxHeight: isMobile ? '92vh' : '88vh',
          borderRadius: isMobile ? '16px 16px 0 0' : 14,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          padding: '14px 16px', borderBottom: `1px solid ${theme.border}`,
          fontSize: 16, fontWeight: 800, color: theme.text, flexShrink: 0,
        }}>
          {title}
        </div>
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <div style={{
            padding: 12, borderTop: `1px solid ${theme.border}`, flexShrink: 0,
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 12,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
