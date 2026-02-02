import { useState, useEffect } from 'react'
import { Inbox } from 'lucide-react'

/**
 * EmptyState Component - Mobile Responsive PWA
 *
 * Centered message with icon, title, description, and optional action button.
 * Mobile: Full width, appropriate padding, readable text sizes.
 * Touch-friendly buttons (min 44px height).
 *
 * Usage:
 * <EmptyState
 *   icon={Calendar}
 *   title="No appointments scheduled"
 *   message="Drag a lead from the left panel to schedule an appointment."
 *   actionLabel="Go to Leads"
 *   onAction={() => navigate('/leads')}
 * />
 */

const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No data yet',
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  iconColor,
  compact = false
}) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: compact
        ? (isMobile ? '24px 16px' : '32px 24px')
        : (isMobile ? '40px 16px' : '60px 24px'),
      textAlign: 'center',
      backgroundColor: 'rgba(0,0,0,0.02)',
      borderRadius: '12px',
      border: '2px dashed #d6cdb8',
      width: '100%'
    }}>
      {/* Icon */}
      <div style={{
        width: compact ? '60px' : (isMobile ? '64px' : '80px'),
        height: compact ? '60px' : (isMobile ? '64px' : '80px'),
        borderRadius: '50%',
        backgroundColor: theme.accentBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: compact ? '12px' : (isMobile ? '16px' : '20px')
      }}>
        <Icon
          size={compact ? 28 : (isMobile ? 28 : 36)}
          style={{ color: iconColor || theme.accent }}
        />
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: compact ? '16px' : (isMobile ? '16px' : '18px'),
        fontWeight: '600',
        color: theme.text,
        marginBottom: '8px',
        margin: '0 0 8px 0',
        lineHeight: '1.3'
      }}>
        {title}
      </h3>

      {/* Message */}
      {message && (
        <p style={{
          fontSize: isMobile ? '13px' : '14px',
          color: theme.textMuted,
          maxWidth: '360px',
          lineHeight: '1.5',
          margin: '0 0 20px 0',
          padding: '0 12px'
        }}>
          {message}
        </p>
      )}

      {/* Action Buttons */}
      {(actionLabel || secondaryLabel) && (
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '12px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          width: isMobile ? '100%' : 'auto',
          padding: isMobile ? '0 16px' : 0
        }}>
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 24px',
                minHeight: '44px', // Touch-friendly
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                width: isMobile ? '100%' : 'auto'
              }}
            >
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 24px',
                minHeight: '44px', // Touch-friendly
                backgroundColor: 'transparent',
                color: theme.accent,
                border: `1px solid ${theme.accent}`,
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: isMobile ? '100%' : 'auto'
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
