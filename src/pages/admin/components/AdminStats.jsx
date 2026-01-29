import { adminTheme } from './adminTheme'

export default function AdminStats({ stats }) {
  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      marginBottom: '24px',
      flexWrap: 'wrap'
    }}>
      {stats.map((stat, i) => (
        <div
          key={i}
          onClick={stat.onClick}
          style={{
            backgroundColor: adminTheme.bgCard,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '10px',
            padding: '16px 20px',
            minWidth: '140px',
            cursor: stat.onClick ? 'pointer' : 'default',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (stat.onClick) {
              e.currentTarget.style.borderColor = adminTheme.accent
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = adminTheme.border
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {stat.icon && (
              <div style={{
                width: '36px',
                height: '36px',
                backgroundColor: stat.color ? `${stat.color}20` : adminTheme.accentBg,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <stat.icon size={18} style={{ color: stat.color || adminTheme.accent }} />
              </div>
            )}
            <div>
              <div style={{ color: adminTheme.textMuted, fontSize: '12px' }}>
                {stat.label}
              </div>
              <div style={{ color: adminTheme.text, fontSize: '20px', fontWeight: '600' }}>
                {stat.value}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Simple badge component
export function Badge({ children, color = 'default' }) {
  const colors = {
    default: { bg: adminTheme.bgHover, text: adminTheme.textMuted },
    success: { bg: adminTheme.successBg, text: adminTheme.success },
    warning: { bg: adminTheme.warningBg, text: adminTheme.warning },
    error: { bg: adminTheme.errorBg, text: adminTheme.error },
    accent: { bg: adminTheme.accentBg, text: adminTheme.accent }
  }
  const c = colors[color] || colors.default

  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      backgroundColor: c.bg,
      color: c.text,
      fontSize: '11px',
      fontWeight: '500',
      borderRadius: '4px'
    }}>
      {children}
    </span>
  )
}
