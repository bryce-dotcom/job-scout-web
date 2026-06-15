import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PLANS } from '../lib/billingPlans'
import ComputeUsagePanel from './ComputeUsagePanel'
import { CheckCircle, AlertTriangle, CreditCard } from 'lucide-react'

// Settings → Subscription panel.
// Shows the tenant's current JobScout-side billing state, lets them
// pick a plan, capture a card, and convert from trial to paid.
//
// Card capture: uses Stripe Elements via @stripe/react-stripe-js. We
// load Stripe.js dynamically so the bundle stays slim for tenants who
// don't open this page. The publishable key comes from
// VITE_JOBSCOUT_MASTER_STRIPE_PUBLISHABLE_KEY (set in Vercel).

export default function BillingTab({ theme, companyId }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [interval, setInterval] = useState('month')
  const [selectedPlan, setSelectedPlan] = useState('field_pro')
  const [cardModalOpen, setCardModalOpen] = useState(false)

  useEffect(() => {
    if (!companyId) return
    fetchStatus()
  }, [companyId])

  async function fetchStatus() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('tenant-billing-status', { body: { company_id: companyId } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setStatus(data)
      if (data?.subscription_tier) setSelectedPlan(data.subscription_tier)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  if (loading) return <div style={{ color: theme.textMuted }}>Loading subscription…</div>
  if (error) return <div style={{ color: '#ef4444' }}>{error}</div>
  if (!status) return null

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US')}`

  // Grandfathered HHH / pre-launch tenants get a friendly "no charge" view.
  if (status.grandfathered) {
    return (
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 6 }}>Your Subscription</h3>
        <div style={{
          padding: 18, borderRadius: 12, marginTop: 12,
          background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(168,85,247,0.08) 100%)',
          border: '1px solid rgba(34,197,94,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <CheckCircle size={22} color="#15803d" />
            <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Field Boss · Free for Life</span>
          </div>
          <p style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6, margin: 0 }}>
            You're on the beta-period grandfather plan. Full Field Boss access,
            no charges, ever. Thanks for being early.
          </p>
        </div>
      </div>
    )
  }

  // Trial banner data
  const trialDays = status.days_left_in_trial
  const inTrial = status.billing_status === 'trialing' && trialDays != null
  const pastDue = status.billing_status === 'past_due'
  const canceled = status.billing_status === 'canceled'

  const sectionHeader = { fontSize: 16, fontWeight: 700, color: theme.text, marginTop: 24, marginBottom: 8 }
  const card = (selected) => ({
    padding: 16, borderRadius: 12, border: `2px solid ${selected ? theme.accent : theme.border}`,
    backgroundColor: selected ? theme.accentBg : theme.bg,
    cursor: 'pointer', flex: '1 1 240px', minWidth: 240,
  })

  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 4 }}>Your Subscription</h3>
      <p style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>
        Manage the JobScout plan, payment method, and trial status for {status.plan?.name || 'your tenant'}.
      </p>

      {/* Status card */}
      <div style={{
        padding: 16, borderRadius: 12, marginBottom: 20,
        backgroundColor: pastDue ? 'rgba(239,68,68,0.06)' : theme.bgCard,
        border: `1px solid ${pastDue ? 'rgba(239,68,68,0.3)' : theme.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Plan</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginTop: 4 }}>
              {status.plan?.name || 'No plan'}
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6 }}>
              Status: <span style={{
                fontWeight: 600,
                color: pastDue ? '#b91c1c' : canceled ? theme.textMuted : '#15803d',
                textTransform: 'capitalize',
              }}>{status.billing_status?.replace('_', ' ') || 'unbilled'}</span>
              {inTrial && <span style={{ marginLeft: 12, color: theme.textSecondary }}>· {trialDays} day{trialDays === 1 ? '' : 's'} left in trial</span>}
            </div>
          </div>
          {status.payment_method && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Method</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <CreditCard size={16} style={{ color: theme.textMuted }} />
                {(status.payment_method.brand || 'card')} ····{status.payment_method.last4}
              </div>
            </div>
          )}
        </div>

        {pastDue && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} color="#b91c1c" />
            <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 500 }}>
              Your last payment failed. Update your payment method below to keep access.
            </span>
          </div>
        )}
      </div>

      {/* Plan picker */}
      <div style={sectionHeader}>{status.subscription ? 'Change Plan' : 'Choose Your Plan'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        {['month', 'year'].map(iv => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            style={{
              padding: '6px 14px', borderRadius: 999,
              border: `1px solid ${interval === iv ? theme.accent : theme.border}`,
              backgroundColor: interval === iv ? theme.accentBg : 'transparent',
              color: interval === iv ? theme.accent : theme.textSecondary,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {iv === 'month' ? 'Monthly' : 'Annual (2 months free)'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {PLANS.map(plan => (
          <div key={plan.id} onClick={() => setSelectedPlan(plan.id)} style={card(selectedPlan === plan.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{plan.name}</span>
              {plan.popular && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, backgroundColor: theme.accent, color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}>POPULAR</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{plan.tagline}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.text, marginTop: 12 }}>
              {fmt(interval === 'year' ? plan.annual_price : plan.monthly_price)}
              <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted, marginLeft: 4 }}>
                /{interval}
              </span>
            </div>
            <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 12, color: theme.textSecondary, lineHeight: 1.6 }}>
              {plan.features.slice(0, 6).map((f, i) => <li key={i}>{f}</li>)}
              {plan.features.length > 6 && <li style={{ color: theme.textMuted, fontStyle: 'italic' }}>+{plan.features.length - 6} more</li>}
            </ul>
          </div>
        ))}
      </div>

      {/* Action button */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setCardModalOpen(true)}
          style={{
            padding: '12px 20px', borderRadius: 10,
            backgroundColor: theme.accent, color: '#fff',
            border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {status.has_payment_method
            ? (status.subscription ? `Change to ${PLANS.find(p => p.id === selectedPlan)?.name}` : 'Subscribe')
            : 'Add Card & Subscribe'}
        </button>
        {inTrial && (
          <span style={{ fontSize: 12, color: theme.textMuted }}>
            You won't be charged until your trial ends in {trialDays} day{trialDays === 1 ? '' : 's'}.
          </span>
        )}
      </div>

      {cardModalOpen && (
        <CardCaptureModal
          companyId={companyId}
          planId={selectedPlan}
          interval={interval}
          theme={theme}
          onClose={() => setCardModalOpen(false)}
          onSuccess={() => { setCardModalOpen(false); fetchStatus() }}
        />
      )}

      {/* AI Prospecting subscription — sub-section under main billing.
          Anchored at #subscription so the drawer's "Upgrade" button can
          deep-link straight to it. */}
      <div id="subscription" style={{ marginTop: 28 }}>
        <ProspectingPlanSection theme={theme} companyId={companyId} />
      </div>

      {/* AI compute usage meter (Phase 1 — read-only, shadow data). Self-contained
          and failure-safe: renders nothing if the ledger isn't available. */}
      <ComputeUsagePanel theme={theme} companyId={companyId} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// AI Prospecting plan card — shows current tier + monthly usage with
// progress bars + upgrade buttons. Stripe checkout for Pro/Unlimited
// wires up in a follow-on commit; for now the "Upgrade" buttons open
// a "contact sales" modal so we can manually flip companies.
// prospecting_tier while the Stripe products are being built.
function ProspectingPlanSection({ theme, companyId }) {
  const [tier, setTier] = useState('free')
  const [quota, setQuota] = useState(null)
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [billingInterval, setBillingInterval] = useState('month')  // 'month' | 'year'
  const [error, setError] = useState('')
  const [hasSub, setHasSub] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: session } = await supabase.auth.getSession()
        const tok = session?.session?.access_token
        const [usageRes, subRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prospect-research`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tok}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ action: 'usage_status', company_id: companyId }),
          }),
          // Quick subscription-presence check so we know whether to
          // show "Upgrade" or "Manage subscription".
          supabase.from('companies').select('prospecting_stripe_sub_id').eq('id', companyId).single(),
        ])
        const data = await usageRes.json()
        if (cancelled) return
        if (usageRes.ok) {
          setTier(data.tier)
          setQuota(data.quota)
          setUsage(data.usage)
        }
        setHasSub(!!subRes?.data?.prospecting_stripe_sub_id)
      } catch (_) { /* best-effort */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
    // re-fetch when URL hash changes (e.g. after Checkout success redirect
    // appends ?prospecting_upgraded=1#subscription)
  }, [companyId])

  // After a successful Checkout redirect back to /settings?prospecting_upgraded=1
  // the page may still show stale "free" tier until the webhook lands. Poll
  // briefly to surface the new state when the user lands here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('prospecting_upgraded')) return
    let attempts = 0
    const id = setInterval(async () => {
      attempts++
      try {
        const { data: session } = await supabase.auth.getSession()
        const tok = session?.session?.access_token
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prospect-research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ action: 'usage_status', company_id: companyId }),
        })
        const data = await res.json()
        if (res.ok && data.tier !== 'free') {
          setTier(data.tier); setQuota(data.quota); setUsage(data.usage); setHasSub(true)
          clearInterval(id)
        }
      } catch (_) { /* keep trying */ }
      if (attempts >= 12) clearInterval(id)  // ~36s max
    }, 3000)
    return () => clearInterval(id)
  }, [companyId])

  const requestUpgrade = async () => {
    if (upgrading) return
    setUpgrading(true); setError('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const tok = session?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-prospecting-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ company_id: companyId, interval: billingInterval }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`)
      if (data.url) { window.location.href = data.url; return }
      setError('Could not create checkout session — no URL returned.')
    } catch (err) {
      setError(err.message)
    } finally { setUpgrading(false) }
  }

  const openPortal = async () => {
    setError('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const tok = session?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-prospecting-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ company_id: companyId }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`)
      if (data.url) { window.location.href = data.url }
    } catch (err) {
      setError(err.message)
    }
  }

  const PLAN_DEFS = [
    { id: 'free', name: 'Free', price: '$0',     features: ['Built into every JobScout account', '3 searches + 10 enrichments per month', 'Tap-to-text mobile reveal', 'AI decision-maker discovery'] },
    { id: 'pro',  name: 'Prospecting Pro', price: '$49/mo', features: ['50 searches + 200 enrichments per month', 'All your seats share one pool', 'Tap-to-text mobile reveal', 'Imported leads auto-tag with source + notes', 'Save 20% with annual billing'] },
  ]

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: '0 0 4px' }}>
        AI Prospecting
      </h3>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 16px' }}>
        Claude-powered prospect search + decision-maker contact reveal from the Lead Setter page. Three-tier per-company pricing — all your seats share one pool.
      </p>

      {loading ? (
        <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Field Boss perk banner — visible only for FB subscribers */}
          {tier === 'field_boss' && (
            <div style={{
              padding: '14px 16px', marginBottom: 16,
              background: 'linear-gradient(135deg, rgba(234,179,8,0.10), rgba(234,179,8,0.04))',
              border: '1px solid rgba(234,179,8,0.35)',
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>⭐</span>
                <strong style={{ color: '#a16207', fontSize: 14 }}>You're on Field Boss</strong>
              </div>
              <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
                AI Prospecting is bundled in free for life on your plan. No upgrades, no monthly caps to worry about. Use it as much as you want.
              </div>
            </div>
          )}

          {/* Current usage card — hidden for Field Boss (no caps to show) */}
          {quota && usage && tier !== 'field_boss' && (
            <div style={{
              padding: 14, marginBottom: 16,
              backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current plan</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
                    {PLAN_DEFS.find(p => p.id === tier)?.name || tier}
                  </div>
                </div>
                <span style={{
                  padding: '4px 10px', borderRadius: 12,
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  backgroundColor: tier === 'free' ? 'rgba(156,163,175,0.18)' : 'rgba(124,58,237,0.15)',
                  color: tier === 'free' ? '#6b7280' : '#7c3aed',
                }}>{tier}</span>
              </div>
              <UsageBar label="Searches this month" used={usage.searches} limit={quota.searches} theme={theme} />
              <UsageBar label="Enrichments this month" used={usage.enrichments} limit={quota.enrichments} theme={theme} />
              <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>
                Resets on the 1st of next month (UTC).
              </div>
            </div>
          )}

          {/* Plan picker — hidden for Field Boss (they already get everything) */}
          {tier !== 'field_boss' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {PLAN_DEFS.map(plan => {
              const isCurrent = plan.id === tier
              return (
                <div key={plan.id} style={{
                  padding: 14,
                  backgroundColor: isCurrent ? 'rgba(124,58,237,0.06)' : theme.bgCard,
                  border: `2px solid ${isCurrent ? '#7c3aed' : theme.border}`,
                  borderRadius: 10,
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{plan.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#7c3aed' }}>{plan.price}</div>
                  </div>
                  <ul style={{ margin: '8px 0 12px', paddingLeft: 16, fontSize: 12, color: theme.textSecondary, flex: 1 }}>
                    {plan.features.map(f => <li key={f} style={{ marginBottom: 3 }}>{f}</li>)}
                  </ul>
                  {isCurrent && hasSub ? (
                    <button onClick={openPortal} style={{
                      padding: '10px', minHeight: 38,
                      backgroundColor: 'transparent', color: theme.accent,
                      border: `1px solid ${theme.accent}`, borderRadius: 6,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>Manage subscription</button>
                  ) : isCurrent ? (
                    <button disabled style={{
                      padding: '10px', minHeight: 38,
                      backgroundColor: 'transparent', color: theme.textMuted,
                      border: `1px solid ${theme.border}`, borderRadius: 6,
                      fontSize: 13, fontWeight: 600, cursor: 'default',
                    }}>Current plan</button>
                  ) : plan.id === 'free' ? (
                    <button disabled style={{
                      padding: '10px', minHeight: 38,
                      backgroundColor: 'transparent', color: theme.textMuted,
                      border: `1px solid ${theme.border}`, borderRadius: 6,
                      fontSize: 13, fontWeight: 600, cursor: 'default',
                    }}>Free tier</button>
                  ) : (
                    <>
                      {/* Billing interval toggle */}
                      <div style={{ display: 'flex', gap: 4, marginBottom: 6, padding: 3, backgroundColor: theme.bg, borderRadius: 6 }}>
                        {['month', 'year'].map(iv => (
                          <button
                            key={iv}
                            onClick={() => setBillingInterval(iv)}
                            style={{
                              flex: 1, padding: '5px 8px',
                              backgroundColor: billingInterval === iv ? '#fff' : 'transparent',
                              color: billingInterval === iv ? theme.text : theme.textMuted,
                              border: 'none', borderRadius: 4,
                              fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              boxShadow: billingInterval === iv ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            }}
                          >
                            {iv === 'month' ? 'Monthly · $49' : 'Annual · $470 (save 20%)'}
                          </button>
                        ))}
                      </div>
                      <button onClick={requestUpgrade} disabled={upgrading} style={{
                        padding: '10px', minHeight: 38,
                        backgroundColor: upgrading ? theme.border : '#7c3aed',
                        color: '#fff', border: 'none', borderRadius: 6,
                        fontSize: 13, fontWeight: 700,
                        cursor: upgrading ? 'not-allowed' : 'pointer',
                        opacity: upgrading ? 0.7 : 1,
                      }}>
                        {upgrading ? 'Opening Stripe…' : `Upgrade to ${plan.name.replace('Prospecting ', '')} →`}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          )}
          {tier !== 'field_boss' && (
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 10, textAlign: 'center' }}>
              Save 20% with annual billing · Cancel anytime · Per-company pricing (all your seats included)
            </div>
          )}
          {error && (
            <div style={{
              marginTop: 10, padding: 10,
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, fontSize: 12, color: '#dc2626',
            }}>{error}</div>
          )}
        </>
      )}
    </div>
  )
}

function UsageBar({ label, used, limit, theme }) {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const color = pct >= 100 ? '#dc2626' : pct >= 70 ? '#eab308' : '#7c3aed'
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
        <span>{label}</span>
        <strong>{used} / {limit}</strong>
      </div>
      <div style={{ width: '100%', height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Card capture modal — minimalist Stripe Elements integration.
//
// Loads Stripe.js dynamically from cdn (avoids @stripe/stripe-js as a
// hard dep on the Settings bundle). Uses confirmCardSetup with the
// SetupIntent client_secret returned by tenant-billing-setup-intent,
// then calls tenant-billing-create-subscription with the resulting
// payment_method.id.
function CardCaptureModal({ companyId, planId, interval, theme, onClose, onSuccess }) {
  const [stripeReady, setStripeReady] = useState(false)
  const [stripe, setStripe] = useState(null)
  const [elements, setElements] = useState(null)
  const [setupSecret, setSetupSecret] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const pubKey = import.meta.env.VITE_JOBSCOUT_MASTER_STRIPE_PUBLISHABLE_KEY

  useEffect(() => {
    let cardElement = null
    ;(async () => {
      try {
        if (!pubKey) {
          setError('VITE_JOBSCOUT_MASTER_STRIPE_PUBLISHABLE_KEY is not set in Vercel env vars.')
          return
        }

        // Get the SetupIntent first
        const { data, error: e1 } = await supabase.functions.invoke('tenant-billing-setup-intent', {
          body: { company_id: companyId },
        })
        if (e1) throw e1
        if (data?.error) throw new Error(data.error)
        setSetupSecret(data.client_secret)

        // Load Stripe.js
        if (!window.Stripe) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = 'https://js.stripe.com/v3/'
            s.onload = resolve
            s.onerror = reject
            document.head.appendChild(s)
          })
        }
        const stripeInstance = window.Stripe(pubKey)
        const elementsInstance = stripeInstance.elements({ clientSecret: data.client_secret })
        cardElement = elementsInstance.create('payment')
        cardElement.mount('#stripe-card-mount')
        setStripe(stripeInstance)
        setElements(elementsInstance)
        setStripeReady(true)
      } catch (e) { setError(e.message) }
    })()
    return () => { try { cardElement?.destroy?.() } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (confirmErr) throw new Error(confirmErr.message)
      if (!setupIntent?.payment_method) throw new Error('No payment method captured')

      const { data: subRes, error: subErr } = await supabase.functions.invoke('tenant-billing-create-subscription', {
        body: {
          company_id: companyId,
          plan_id: planId,
          interval,
          payment_method_id: setupIntent.payment_method,
        },
      })
      if (subErr) throw subErr
      if (subRes?.error) throw new Error(subRes.error)

      onSuccess()
    } catch (e) { setError(e.message) }
    setSubmitting(false)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: theme.bgCard, borderRadius: 14, padding: 24,
        maxWidth: 460, width: '100%',
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginTop: 0 }}>
          Add Payment Method
        </h3>
        <p style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
          Card is captured securely by Stripe. We never see or store the card number.
        </p>
        <form onSubmit={handleSubmit}>
          <div id="stripe-card-mount" style={{ minHeight: 60, marginBottom: 16 }} />
          {!stripeReady && !error && <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading secure card form…</div>}
          {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textSecondary, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!stripeReady || submitting}
              style={{
                padding: '10px 18px',
                backgroundColor: stripeReady ? theme.accent : theme.textMuted,
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
                cursor: stripeReady && !submitting ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Confirming…' : 'Save & Subscribe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
