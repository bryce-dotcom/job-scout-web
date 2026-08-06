import { useState, useEffect } from 'react'
import { useStore } from '../lib/store'
import { Sparkles, ArrowRight, X } from 'lucide-react'

// First-run nudge: when a brand-new admin lands in an empty workspace, invite
// them to let Arnie set the place up conversationally. It's dismissible — once
// turned off (or once they have real data) it never shows again, and they just
// use the "Ask Arnie" corner guy. See ArnieFloatingPanel ('arnie:open' event).
const C = {
  card: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  orange: '#c9812f',
  orangeHover: '#b0701f',
  orangeSoft: 'rgba(201,129,47,0.10)',
}

export default function ArnieOnboardingBanner() {
  const user = useStore(s => s.user)
  const company = useStore(s => s.company)
  const hasAgent = useStore(s => s.hasAgent)
  const customers = useStore(s => s.customers)
  const leads = useStore(s => s.leads)
  const jobs = useStore(s => s.jobs)

  const [manuallyDismissed, setManuallyDismissed] = useState(false)
  const [ready, setReady] = useState(false)

  // Per-company dismiss flag — read straight from localStorage during render
  // (synchronous + pure; no setState-in-effect needed).
  const persistedDismissed = (() => {
    if (!company?.id) return false
    try { return localStorage.getItem(`arnie_onboard_dismissed_${company.id}`) === '1' } catch { return false }
  })()
  const dismissed = manuallyDismissed || persistedDismissed

  // Small delay so an established company's data can load before we judge the
  // workspace "empty" — avoids a one-frame flash of the banner on every login.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(t)
  }, [])

  const isAdmin = (() => {
    if (!user) return false
    if (user.is_developer) return true
    const map = { User: 0, 'Team Lead': 1, Manager: 2, Admin: 3, 'Super Admin': 4, Developer: 5, Owner: 4 }
    return (map[user.user_role] ?? map[user.role] ?? 0) >= 3
  })()

  const emptyWorkspace =
    (customers?.length || 0) === 0 &&
    (leads?.length || 0) === 0 &&
    (jobs?.length || 0) === 0

  if (!ready || dismissed || !user || !isAdmin || !emptyWorkspace) return null
  if (!hasAgent || !hasAgent('arnie-og')) return null

  const dismiss = () => {
    if (company?.id) {
      try { localStorage.setItem(`arnie_onboard_dismissed_${company.id}`, '1') } catch { /* non-fatal */ }
    }
    setManuallyDismissed(true)
  }

  const openArnie = () => window.dispatchEvent(new Event('arnie:open'))

  return (
    <div style={{
      margin: '14px 16px 0',
      background: C.card,
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${C.orange}`,
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 1px 3px rgba(44,53,48,0.06)',
    }}>
      {/* Arnie avatar */}
      <div style={{
        width: 46, height: 46, flexShrink: 0,
        borderRadius: '50%',
        border: `2.5px solid ${C.orange}`,
        overflow: 'hidden',
        boxShadow: '0 0 10px rgba(201,129,47,0.25)',
        background: C.orangeSoft,
      }}>
        <img src="/og-arnie.png" alt="Arnie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      {/* Copy */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: C.text }}>
          <Sparkles size={15} color={C.orange} />
          New here? Let Arnie set the place up.
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 3, lineHeight: 1.5 }}>
          Just tell him in plain English &mdash; e.g. &ldquo;add a business unit called Government&rdquo; or
          &ldquo;add Referral as a lead source.&rdquo; He shows you the change, you approve it, done.
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={openArnie}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: C.orange, color: '#fff', border: 0,
            borderRadius: 9, padding: '9px 14px',
            fontSize: 13.5, fontWeight: 650, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = C.orangeHover)}
          onMouseLeave={e => (e.currentTarget.style.background = C.orange)}
        >
          Chat with Arnie
          <ArrowRight size={15} />
        </button>
        <button
          onClick={dismiss}
          title="Dismiss — you can always use the Ask Arnie button in the corner"
          style={{
            width: 34, height: 34, borderRadius: 8,
            border: `1px solid ${C.border}`, background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <X size={16} color={C.textSecondary} />
        </button>
      </div>
    </div>
  )
}
