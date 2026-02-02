import { useState, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import Tooltip from './Tooltip'

/**
 * HelpBadge Component - Mobile Responsive PWA
 *
 * Small question mark icon with tooltip.
 * Touch-friendly size (min 44px tap target on mobile).
 *
 * Usage:
 * <HelpBadge text="This explains something" />
 */
export default function HelpBadge({
  text,
  size = 16,
  position = 'top',
  color = '#7d8a7f' // theme.textMuted
}) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (!text) return null

  return (
    <Tooltip text={text} position={position}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Touch-friendly tap target on mobile (44px minimum)
          minWidth: isMobile ? '44px' : '28px',
          minHeight: isMobile ? '44px' : '28px',
          cursor: 'pointer',
          borderRadius: '50%',
          marginLeft: '4px',
          transition: 'background-color 0.15s ease'
        }}
      >
        <HelpCircle
          size={size}
          color={color}
          style={{
            opacity: 0.7,
            flexShrink: 0,
            cursor: 'help'
          }}
        />
      </div>
    </Tooltip>
  )
}
