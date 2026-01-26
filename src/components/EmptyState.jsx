import { Inbox } from 'lucide-react'

const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No data found',
  message = 'There are no items to display.',
  actionLabel,
  onAction
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      textAlign: 'center'
    }}>
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        backgroundColor: theme.accentBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '20px'
      }}>
        <Icon size={36} style={{ color: theme.accent }} />
      </div>
      <h3 style={{
        fontSize: '18px',
        fontWeight: '600',
        color: theme.text,
        marginBottom: '8px'
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '14px',
        color: theme.textMuted,
        maxWidth: '320px',
        marginBottom: actionLabel ? '20px' : '0'
      }}>
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: theme.accent,
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
