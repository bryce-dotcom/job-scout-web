// App-wide banner for JobScout-side billing state. Renders only when
// the tenant needs attention (trial running out, past due, canceled).
// Grandfathered + freshly-trialing tenants see nothing.
//
// Reads from public.companies directly via the authenticated client —
// the row is already in scope (it's the user's own company), no edge
// function call needed.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { AlertTriangle, Clock, X } from 'lucide-react'

const DISMISS_KEY = 'jobscout_trial_banner_dismissed_until'

export default function TrialBanner() {
  const companyId = useStore((s) => s.companyId)
  const [billing, setBilling] = useState(null)
  const [hidden, setHidden] = useState(() => {
    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
      return until > Date.now()
    } catch { return false }
  })

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('companies')
        .select('billing_status, subscription_tier, trial_ends_at')
        .eq('id', companyId)
        .maybeSingle()
      if (!cancelled) setBilling(data || null)
    })()
    return () => { cancelled = true }
  }, [companyId])

  if (hidden || !billing) return null

  const status = billing.billing_status
  // Skip everyone who doesn't need attention
  if (status === 'grandfathered' || status === 'active' || status === 'unbilled') return null

  let daysLeft = null
  if (billing.trial_ends_at) {
    daysLeft = Math.max(0, Math.ceil((new Date(billing.trial_ends_at).getTime() - Date.now()) / 86400000))
  }

  // Trial that's not yet at the warning threshold — also skip
  if (status === 'trialing' && (daysLeft == null || daysLeft > 7)) return null

  // Pick a tone + message
  let bg, fg, border, icon, title, body
  if (status === 'past_due') {
    bg = 'rgba(239,68,68,0.08)'; border = 'rgba(239,68,68,0.4)'; fg = '#b91c1c'
    icon = <AlertTriangle size={18} />
    title = 'Payment failed.'
    body = 'Update your card to keep using JobScout.'
  } else if (status === 'canceled') {
    bg = 'rgba(239,68,68,0.08)'; border = 'rgba(239,68,68,0.4)'; fg = '#b91c1c'
    icon = <AlertTriangle size={18} />
    title = 'Subscription canceled.'
    body = 'Re-subscribe to restore full access.'
  } else if (status === 'trialing' && daysLeft === 0) {
    bg = 'rgba(245,158,11,0.1)'; border = 'rgba(245,158,11,0.4)'; fg = '#b45309'
    icon = <Clock size={18} />
    title = 'Your trial ends today.'
    body = 'Add a card to keep your data and tools.'
  } else {
    bg = 'rgba(245,158,11,0.08)'; border = 'rgba(245,158,11,0.3)'; fg = '#b45309'
    icon = <Clock size={18} />
    title = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial.`
    body = 'Pick a plan and add a card before it ends.'
  }

  function dismissForToday() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 3600 * 1000))
    } catch {}
    setHidden(true)
  }

  return (
    <div style={{
      padding: '10px 16px', backgroundColor: bg, borderBottom: `1px solid ${border}`,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      fontSize: 13, color: fg, fontWeight: 500,
    }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{title}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{body}</span>
      <Link
        to="/settings?tab=billing"
        style={{
          padding: '5px 12px', borderRadius: 6,
          backgroundColor: fg, color: '#fff', textDecoration: 'none',
          fontSize: 12, fontWeight: 700,
        }}
      >
        {status === 'past_due' || status === 'canceled' ? 'Update Payment' : 'Pick a Plan'}
      </Link>
      {status !== 'past_due' && status !== 'canceled' && (
        <button
          onClick={dismissForToday}
          title="Hide for today"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: fg, padding: 4 }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
