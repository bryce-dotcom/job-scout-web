import { useState, useRef, useEffect } from 'react'

/**
 * Tooltip Component - Mobile Responsive PWA
 *
 * Shows tooltip on hover (desktop) or tap (mobile).
 * Uses position: fixed to escape overflow clipping.
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
  const [isMobile, setIsMobile] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState({})
  const [arrowStyle, setArrowStyle] = useState({})
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Calculate fixed position based on trigger element
  const calculatePosition = () => {
    if (!triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = 250
    const tooltipHeight = 60 // Approximate
    const offset = 8

    let style = {}
    let arrow = {}

    switch (position) {
      case 'top':
        style = {
          left: rect.left + rect.width / 2,
          top: rect.top - offset,
          transform: 'translate(-50%, -100%)'
        }
        arrow = { bottom: '-4px', left: '50%', marginLeft: '-4px' }
        break
      case 'bottom':
        style = {
          left: rect.left + rect.width / 2,
          top: rect.bottom + offset,
          transform: 'translateX(-50%)'
        }
        arrow = { top: '-4px', left: '50%', marginLeft: '-4px' }
        break
      case 'left':
        style = {
          left: rect.left - offset,
          top: rect.top + rect.height / 2,
          transform: 'translate(-100%, -50%)'
        }
        arrow = { right: '-4px', top: '50%', marginTop: '-4px' }
        break
      case 'right':
        style = {
          left: rect.right + offset,
          top: rect.top + rect.height / 2,
          transform: 'translateY(-50%)'
        }
        arrow = { left: '-4px', top: '50%', marginTop: '-4px' }
        break
    }

    setTooltipStyle(style)
    setArrowStyle(arrow)
  }

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      calculatePosition()
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

  // Recalculate on scroll/resize while visible
  useEffect(() => {
    if (isVisible) {
      const handleReposition = () => calculatePosition()
      window.addEventListener('scroll', handleReposition, true)
      window.addEventListener('resize', handleReposition)
      return () => {
        window.removeEventListener('scroll', handleReposition, true)
        window.removeEventListener('resize', handleReposition)
      }
    }
  }, [isVisible])

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
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={!isMobile ? show : undefined}
      onMouseLeave={!isMobile ? hide : undefined}
      onClick={handleClick}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            ...tooltipStyle,
            padding: '8px 12px',
            backgroundColor: '#1f2937',
            color: '#fff',
            fontSize: isMobile ? '13px' : '12px',
            borderRadius: '6px',
            zIndex: 99999,
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
            ...arrowStyle
          }} />
        </div>
      )}
    </div>
  )
}
