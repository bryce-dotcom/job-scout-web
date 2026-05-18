import { useNavigate, useLocation } from 'react-router-dom'

/**
 * useSmartBack — returns a function that navigates back to wherever the
 * user came from.
 *
 * Resolution order:
 *   1. location.state.from — set by the navigating page (most reliable;
 *      survives refresh + PWA cold-launch)
 *   2. window.history.length > 1 — browser back via navigate(-1)
 *   3. fallbackPath — last resort
 *
 * For (1) to work, the callsite that navigates TO the detail page must do:
 *   navigate(`/invoices/${id}`, { state: { from: location.pathname } })
 *
 * Usage:
 *   const goBack = useSmartBack('/customers')
 *   <button onClick={goBack}>Back</button>
 */
export default function useSmartBack(fallbackPath = '/') {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    const from = location.state?.from
    if (from && typeof from === 'string') {
      // Preserve any sub-state the caller set (selectedTab etc.) but drop
      // the from-marker so a further-back doesn't loop.
      const passState = { ...(location.state || {}) }
      delete passState.from
      navigate(from, { state: Object.keys(passState).length ? passState : undefined })
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(fallbackPath)
    }
  }
}
