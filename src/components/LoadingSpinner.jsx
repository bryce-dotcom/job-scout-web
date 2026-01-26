const theme = {
  accent: '#5a6349',
  textMuted: '#7d8a7f'
}

export default function LoadingSpinner({ message = 'Loading...', size = 'medium' }) {
  const sizes = {
    small: { spinner: 24, border: 3 },
    medium: { spinner: 40, border: 4 },
    large: { spinner: 56, border: 5 }
  }

  const { spinner, border } = sizes[size] || sizes.medium

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      gap: '16px'
    }}>
      <div style={{
        width: `${spinner}px`,
        height: `${spinner}px`,
        border: `${border}px solid rgba(90,99,73,0.15)`,
        borderTopColor: theme.accent,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      {message && (
        <div style={{
          fontSize: '14px',
          color: theme.textMuted
        }}>
          {message}
        </div>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
