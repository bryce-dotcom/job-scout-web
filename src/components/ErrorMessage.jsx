import { AlertCircle, RefreshCw } from 'lucide-react'

const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textMuted: '#7d8a7f'
}

export default function ErrorMessage({
  message = 'Something went wrong',
  details,
  onRetry
}) {
  return (
    <div style={{
      backgroundColor: 'rgba(194,90,90,0.08)',
      border: '1px solid rgba(194,90,90,0.3)',
      borderRadius: '12px',
      padding: '24px',
      margin: '16px 0'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <AlertCircle size={24} style={{ color: '#c25a5a', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#c25a5a',
            marginBottom: '4px'
          }}>
            {message}
          </div>
          {details && (
            <div style={{
              fontSize: '14px',
              color: theme.textMuted,
              marginBottom: '12px'
            }}>
              {details}
            </div>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#c25a5a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={16} /> Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
