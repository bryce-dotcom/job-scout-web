import { useNavigate } from 'react-router-dom'
import { useTheme } from './Layout'
import { ArrowLeft } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

/**
 * Standardized page header for consistent UI across all pages.
 *
 * Props:
 *   title       — Page title (string)
 *   subtitle    — Optional subtitle text
 *   icon        — Optional lucide icon component (renders at 28px)
 *   backTo      — If provided, shows a back button navigating to this path
 *   onBack      — Alternative: callback for back button (takes priority over backTo)
 *   actions     — React node(s) rendered on the right side (buttons, etc.)
 *   children    — Content rendered below the header row (filters, tabs, etc.)
 *   statusBadge — Optional React node for status badge
 */
export default function PageHeader({ title, subtitle, icon: Icon, backTo, onBack, actions, children, statusBadge }) {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const handleBack = () => {
    if (onBack) onBack()
    else if (backTo) navigate(backTo)
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Main header row */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '12px',
        marginBottom: children ? '16px' : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          {(backTo || onBack) && (
            <button
              onClick={handleBack}
              style={{
                padding: isMobile ? '10px' : '8px',
                minWidth: '36px',
                minHeight: '36px',
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                cursor: 'pointer',
                color: theme.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {Icon && (
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              backgroundColor: theme.accentBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={22} style={{ color: theme.accent }} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {subtitle && (
              <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600', margin: 0 }}>
                {subtitle}
              </p>
            )}
            <h1 style={{
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: '700',
              color: theme.text,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {title}
            </h1>
          </div>
          {statusBadge && statusBadge}
        </div>

        {actions && (
          <div style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            {actions}
          </div>
        )}
      </div>

      {/* Sub-content (filters, tabs, etc.) */}
      {children}
    </div>
  )
}
