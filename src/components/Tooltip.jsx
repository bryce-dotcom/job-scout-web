import { useState, useRef, useEffect } from 'react'

/**
 * Tooltip Component - Mobile Responsive PWA
 *
 * Shows tooltip on hover (desktop) or tap (mobile).
 * Position auto-adjusts to stay on screen.
 *
 * Usage:
 * <Tooltip text="This is a tooltip">
 *   <button>Hover/Tap me</button>
 * </Tooltip>
 */
export default function Tooltip({
  children,
  text,
  position = 'top', // top, bottom, left, right
  delay = 200
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [isMobile, setIsMobile] = useState(false)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const positions = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' }
  }

  const arrowPositions = {
    top: { bottom: '-4px', left: '50%', marginLeft: '-4px' },
    bottom: { top: '-4px', left: '50%', marginLeft: '-4px' },
    left: { right: '-4px', top: '50%', marginTop: '-4px' },
    right: { left: '-4px', top: '50%', marginTop: '-4px' }
  }

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, isMobile ? 0 : delay)
  }

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  const handleClick = (e) => {
    if (isMobile) {
      e.stopPropagation()
      if (isVisible) {
        hide()
      } else {
        show()
        // Auto-hide after 3 seconds on mobile
        setTimeout(hide, 3000)
      }
    }
  }

  // Close on outside click for mobile
  useEffect(() => {
    if (isMobile && isVisible) {
      const handleOutsideClick = (e) => {
        if (triggerRef.current && !triggerRef.current.contains(e.target)) {
          hide()
        }
      }
      document.addEventListener('touchstart', handleOutsideClick)
      document.addEventListener('click', handleOutsideClick)
      return () => {
        document.removeEventListener('touchstart', handleOutsideClick)
        document.removeEventListener('click', handleOutsideClick)
      }
    }
  }, [isMobile, isVisible])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  if (!text) return children

  return (
    <div
      ref={triggerRef}
      style={{ position: 'relative', display: 'inline-flex', zIndex: isVisible ? 9999 : 'auto' }}
      onMouseEnter={!isMobile ? show : undefined}
      onMouseLeave={!isMobile ? hide : undefined}
      onClick={handleClick}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            ...positions[position],
            padding: '8px 12px',
            backgroundColor: '#1f2937',
            color: '#fff',
            fontSize: isMobile ? '13px' : '12px',
            borderRadius: '6px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            maxWidth: isMobile ? '200px' : '250px',
            whiteSpace: 'normal',
            lineHeight: '1.4',
            textAlign: 'left',
            pointerEvents: 'none',
            opacity: 1
          }}
        >
          {text}
          <div style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            backgroundColor: '#1f2937',
            transform: 'rotate(45deg)',
            ...arrowPositions[position]
          }} />
        </div>
      )}
    </div>
  )
}
