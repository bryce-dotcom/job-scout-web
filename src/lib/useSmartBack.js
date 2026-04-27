import { useNavigate } from 'react-router-dom'

/**
 * useSmartBack — returns a function that navigates back to the previous page
 * in history when possible, falling back to a sensible default route.
 *
 * This fixes back-button confusion when a user enters a detail page from
 * somewhere other than the canonical list (e.g. Pipeline -> LeadDetail,
 * CustomerDetail -> InvoiceDetail). Hard-coding navigate('/leads') always
 * dropped them on the wrong page.
 *
 * Usage:
 *   const goBack = useSmartBack('/customers')
 *   <button onClick={goBack}>Back</button>
 */
export default function useSmartBack(fallbackPath = '/') {
  const navigate = useNavigate()
  return () => {
    // window.history.length > 1 means there IS a prior entry in this tab.
    // We also guard against the user opening the detail page directly
    // (e.g. via a deep link / refresh) where history length is 1.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
    } else {
      navigate(fallbackPath)
    }
  }
}
