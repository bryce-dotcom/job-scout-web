import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

export default function ProposalSection({ children, delay = 0, style = {} }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={style}
    >
      {children}
    </motion.div>
  )
}

// Animated counter that counts up when visible
export function AnimatedNumber({ value, prefix = '', suffix = '', duration = 1.5, decimals = 0 }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <span ref={ref}>
      {isInView ? (
        <CountUp target={value} duration={duration} prefix={prefix} suffix={suffix} decimals={decimals} />
      ) : (
        <span>{prefix}0{suffix}</span>
      )}
    </span>
  )
}

function CountUp({ target, duration, prefix, suffix, decimals }) {
  const ref = useRef(null)
  const startTime = useRef(null)

  const formatNum = (n) => {
    if (decimals > 0) return n.toFixed(decimals)
    return Math.round(n).toLocaleString()
  }

  // Use requestAnimationFrame for smooth counting
  const animate = (timestamp) => {
    if (!startTime.current) startTime.current = timestamp
    const elapsed = (timestamp - startTime.current) / 1000
    const progress = Math.min(elapsed / duration, 1)
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3)
    const current = eased * target

    if (ref.current) {
      ref.current.textContent = prefix + formatNum(current) + suffix
    }

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  // Start animation on mount
  if (typeof window !== 'undefined') {
    requestAnimationFrame(animate)
  }

  return <span ref={ref}>{prefix}0{suffix}</span>
}
