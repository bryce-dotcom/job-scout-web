// Dark theme constants for Data Console
export const adminTheme = {
  bg: '#0a0a0a',
  bgCard: '#141414',
  bgHover: '#1f1f1f',
  bgInput: '#1a1a1a',
  border: '#2a2a2a',
  borderFocus: '#f97316',
  text: '#ffffff',
  textMuted: '#888888',
  textDim: '#555555',
  accent: '#f97316',
  accentHover: '#ea580c',
  accentBg: 'rgba(249, 115, 22, 0.15)',
  success: '#22c55e',
  successBg: 'rgba(34, 197, 94, 0.15)',
  error: '#ef4444',
  errorBg: 'rgba(239, 68, 68, 0.15)',
  warning: '#eab308',
  warningBg: 'rgba(234, 179, 8, 0.15)'
}

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  backgroundColor: adminTheme.bgInput,
  border: `1px solid ${adminTheme.border}`,
  borderRadius: '8px',
  color: adminTheme.text,
  fontSize: '14px',
  outline: 'none'
}

export const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '500',
  color: adminTheme.textMuted,
  marginBottom: '6px'
}

export const buttonStyle = {
  padding: '10px 16px',
  backgroundColor: adminTheme.accent,
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '500',
  cursor: 'pointer'
}

export const secondaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: adminTheme.bgHover,
  border: `1px solid ${adminTheme.border}`
}
