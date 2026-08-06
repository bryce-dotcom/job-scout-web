// Public pricing / storefront page (route: /pricing, no auth required).
//
// The single source of truth for plans is lib/billingPlans.js (PLANS +
// COMPUTE) — the same data the signup flow and Settings → Billing use, so a
// price only ever changes in one place. A rep can walk a prospect through
// this and hit "Sign them up"; a prospect can self-serve. Signup is open
// (no invite code) — CTAs deep-link into the signup form with the plan
// preselected.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLANS } from '../lib/billingPlans'
import { Check, Compass, ArrowRight, Zap } from 'lucide-react'

// Compute-wallet display values. Kept local so the storefront doesn't depend
// on the wallet branch's billingPlans COMPUTE export (not yet on main). Keep
// in sync with supabase/functions/_shared/computeConfig.ts when that lands.
const COMPUTE = {
  agentIncludedCredits: 350,
  tierIncludedCredits: { field_crew: 250, field_pro: 750, field_boss: 2000 },
  packs: [
    { id: 'small', price: 10, credits: 140 },
    { id: 'medium', price: 25, credits: 350 },
    { id: 'large', price: 50, credits: 700 },
    { id: 'bulk', price: 100, credits: 1600 },
  ],
}

// Topo theme (matches the app's light theme; this page renders outside the
// authed Layout, so it carries its own palette rather than the theme context).
const t = {
  bg: '#f3efe4', card: '#ffffff', card2: '#f0ebdd', ink: '#22281d',
  sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8',
  accent: '#55613c', accentDark: '#3f4a2a', accentBg: 'rgba(85,97,60,0.10)',
  hivis: '#cf7a24',
}

// The AI crew — the differentiator. Roles are contractor-vernacular; ids map
// to real agents in the app.
const CREW = [
  { id: 'zach', in: 'ZA', name: 'Zach', role: 'The Yard Yeti', ds: 'Turns a satellite photo into an instant lawn quote.' },
  { id: 'lenard', in: 'LE', name: 'Lenard', role: 'The Lighting Pro', ds: 'Runs lighting audits and files the utility rebate paperwork.' },
  { id: 'conrad', in: 'CO', name: 'Conrad', role: 'The Closer', ds: 'Writes the follow-ups and campaigns that win the deal.' },
  { id: 'victor', in: 'VI', name: 'Victor', role: 'The Inspector', ds: 'Checks job photos so the work is done right the first time.' },
  { id: 'freddy', in: 'FR', name: 'Freddy', role: 'The Fleet Manager', ds: 'Keeps every truck maintained, tracked, and on the road.' },
  { id: 'frankie', in: 'FK', name: 'Frankie', role: 'The Collector', ds: 'Politely chases every invoice until you get paid.' },
]

// Marketing feature bullets per plan (kept here so billingPlans.js stays the
// billing source of truth; these are the storefront's copy).
const FEATURES = {
  field_crew: ['Leads, Pipeline & Quotes', 'Jobs, Job Board & Field Scout', 'Invoices, Payments & Books', 'Customer portal'],
  field_pro: ['Everything in Crew, plus:', 'Lighting audits + utility rebates', 'Fleet management', 'Email campaigns & quality checks', 'Routes + payment plans'],
  field_boss: ['Everything in Pro, plus:', 'Payroll runs + paystubs', 'Multi-business-unit support', 'White-label portal + custom domain', 'Priority phone support'],
}

export default function Pricing() {
  const navigate = useNavigate()
  const [hired, setHired] = useState({})
  const [period, setPeriod] = useState('mo')

  const n = CREW.filter((a) => hired[a.id]).length
  const rec = n <= 1 ? PLANS[0] : n <= 5 ? PLANS[1] : PLANS[2]
  const recCredits = (COMPUTE.tierIncludedCredits[rec.id] || 0) + COMPUTE.agentIncludedCredits * n
  const recWhy = n === 0 ? "Start solo — add teammates and we'll size it up."
    : n <= 1 ? 'One specialist fits the Crew plan just right.'
    : n <= 5 ? 'A full bench like this runs best on Field Pro.'
    : "That's the whole crew — Field Boss unlocks everyone."

  const goSignup = (planId) => navigate(`/login?signup=1&plan=${planId}`)

  const btn = (bg, fg) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 20px', minHeight: 44, borderRadius: 10, border: '1.5px solid transparent',
    background: bg, color: fg, fontSize: 14, fontWeight: 650, cursor: 'pointer', textDecoration: 'none',
  })
  const ghostBtn = { ...btn('transparent', t.ink), border: `1.5px solid ${t.line}` }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
      {/* top bar */}
      <header style={{ maxWidth: 1120, margin: '0 auto', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em' }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${t.accent}`, color: t.accent, display: 'grid', placeItems: 'center' }}><Compass size={16} /></span>
          JobScout
        </div>
        <button onClick={() => navigate('/login')} style={{ ...ghostBtn, padding: '8px 14px', minHeight: 38, fontSize: 13 }}>Sign in</button>
      </header>

      {/* hero */}
      <section style={{ maxWidth: 780, margin: '0 auto', padding: '44px 20px 20px' }}>
        <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.muted }}>
          The operating system for <span style={{ color: t.accentDark, fontWeight: 600 }}>field-service crews</span>
        </div>
        <h1 style={{ fontSize: 'clamp(34px, 6.5vw, 60px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.03, margin: '16px 0 0', textWrap: 'balance' }}>
          Hire a crew that works <span style={{ color: t.accentDark, boxShadow: `inset 0 -0.14em 0 ${t.hivis}55` }}>24/7</span> and never cashes a paycheck.
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2.2vw, 19px)', color: t.sub, margin: '20px 0 0', maxWidth: '58ch', lineHeight: 1.55 }}>
          JobScout runs the whole business — leads, quotes, jobs, invoices, payroll — and comes with a bench of AI teammates who quote lawns, file rebates, chase invoices, and check the work. Pick who's on your crew; we'll size the plan.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <a href="#crew" style={btn(t.hivis, '#fff')}>Build your crew</a>
          <a href="#plans" style={ghostBtn}>See the plans</a>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 24, flexWrap: 'wrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: t.muted }}>
          <span>● 30-day free trial</span><span>● No setup fee</span><span>● Cancel anytime</span>
        </div>
      </section>

      {/* crew builder */}
      <section id="crew" style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 20px' }}>
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Who's on your crew?</h2>
        <p style={{ color: t.sub, margin: '0 0 24px', maxWidth: '60ch' }}>Every teammate is an AI specialist included in your plan. Toggle the ones you'd use — the panel sizes your plan and monthly compute in real time.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="pricing-builder">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {CREW.map((a) => {
              const on = !!hired[a.id]
              return (
                <button key={a.id} onClick={() => setHired((h) => ({ ...h, [a.id]: !h[a.id] }))}
                  style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 15px', borderRadius: 12, cursor: 'pointer',
                    background: on ? t.accentBg : t.card, border: `1.5px solid ${on ? t.accent : t.line}`, minHeight: 44 }}>
                  <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center', fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14,
                    background: on ? t.accent : t.accentBg, color: on ? '#fff' : t.accentDark }}>{a.in}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>{a.name}</span>
                    <span style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.accentDark, marginTop: 2 }}>{a.role}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: t.muted, marginTop: 5, lineHeight: 1.35 }}>{a.ds}</span>
                  </span>
                  <span style={{ width: 20, height: 20, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center',
                    background: on ? t.accent : t.card, border: `1.5px solid ${on ? t.accent : t.line}`, color: '#fff' }}>{on && <Check size={13} />}</span>
                </button>
              )
            })}
          </div>
          {/* readout */}
          <aside style={{ background: t.ink, color: t.bg, borderRadius: 16, padding: 24, position: 'sticky', top: 16 }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.6 }}>Recommended plan</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 0' }}>{rec.name}</div>
            <div style={{ fontSize: 12.5, opacity: 0.72, marginTop: 4, minHeight: '2.6em', lineHeight: 1.35 }}>{recWhy}</div>
            <div style={{ height: 1, background: 'currentColor', opacity: 0.16, margin: '16px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: '4px 0' }}>
              <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Crew size</span><span>{n} hired</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: '4px 0' }}>
              <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seats</span><span>{rec.user_cap ? `${rec.user_cap} users` : 'Unlimited'}</span>
            </div>
            <div style={{ height: 1, background: 'currentColor', opacity: 0.16, margin: '16px 0' }} />
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.6 }}>Monthly compute included</div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 4 }}>{recCredits.toLocaleString()} <span style={{ fontSize: 14, opacity: 0.7 }}>credits</span></div>
            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>≈ {recCredits.toLocaleString()} quick AI actions a month. Buy more anytime.</div>
            <button onClick={() => goSignup(rec.id)} style={{ ...btn(t.hivis, '#fff'), width: '100%', marginTop: 18 }}>Start with {rec.name} <ArrowRight size={16} /></button>
          </aside>
        </div>
      </section>

      {/* plans */}
      <section id="plans" style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Plans that grow with the trucks.</h2>
          <div style={{ display: 'inline-flex', background: t.card2, border: `1.5px solid ${t.line}`, borderRadius: 11, padding: 4 }}>
            {['mo', 'yr'].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{ border: 0, background: period === p ? t.card : 'transparent', color: period === p ? t.ink : t.muted,
                padding: '7px 15px', borderRadius: 8, cursor: 'pointer', fontWeight: 650, fontSize: 13, minHeight: 38 }}>
                {p === 'mo' ? 'Monthly' : 'Annual · 2 months free'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'stretch' }}>
          {PLANS.map((p) => {
            const isRec = p.id === rec.id
            const monthly = period === 'yr' ? Math.round(p.annual_price / 12) : p.monthly_price
            return (
              <div key={p.id} style={{ background: t.card, border: `${p.popular ? 2 : 1.5}px solid ${isRec ? t.hivis : p.popular ? t.accent : t.line}`, borderRadius: 18, padding: 24,
                display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: isRec ? `0 0 0 3px ${t.accentBg}` : 'none' }}>
                {p.popular && <span style={{ position: 'absolute', top: -11, left: 24, fontFamily: 'ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, background: t.accent, color: '#fff', padding: '4px 10px', borderRadius: 6 }}>Most popular</span>}
                {isRec && <span style={{ position: 'absolute', top: -11, right: 24, fontFamily: 'ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, background: t.hivis, color: '#fff', padding: '4px 10px', borderRadius: 6 }}>Your pick</span>}
                <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0 0' }}>{p.name}</h3>
                <div style={{ color: t.muted, fontSize: 13, marginTop: 4, minHeight: '2.6em' }}>{p.tagline}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '16px 0 2px' }}>
                  <span style={{ fontWeight: 700, fontSize: 20, alignSelf: 'flex-start', marginTop: 6 }}>$</span>
                  <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{monthly}</span>
                  <span style={{ color: t.muted, fontSize: 14 }}>/mo</span>
                </div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: t.muted, minHeight: '1.2em' }}>{period === 'yr' ? `$${p.annual_price.toLocaleString()} billed yearly` : ' '}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <li style={liRow(t)}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span><b>{p.user_cap ? `Up to ${p.user_cap} users` : 'Unlimited users'}</b></span></li>
                  <li style={liRow(t)}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span><b>{p.agent_cap ? `${p.agent_cap} AI teammate${p.agent_cap > 1 ? 's' : ''}` : 'Every AI teammate'}</b> included</span></li>
                  <li style={liRow(t)}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span><b>{(COMPUTE.tierIncludedCredits[p.id] || 0).toLocaleString()}</b> compute credits / mo</span></li>
                  <li style={liRow(t)}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span>{p.storage_gb} GB storage</span></li>
                  {(FEATURES[p.id] || []).map((f, i) => f.startsWith('Everything')
                    ? <li key={i} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted, marginTop: 4 }}>{f}</li>
                    : <li key={i} style={liRow(t)}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span>{f}</span></li>)}
                </ul>
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <button onClick={() => goSignup(p.id)} style={{ ...btn(t.accent, '#fff'), width: '100%' }}>Start 30-day trial</button>
                  <button onClick={() => goSignup(p.id)} style={{ ...ghostBtn, width: '100%' }}>Subscribe now <ArrowRight size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* compute strip */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 20px 50px' }}>
        <div style={{ background: t.card, border: `1.5px solid ${t.line}`, borderRadius: 18, padding: '26px 28px', display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 28, alignItems: 'center' }} className="pricing-compute">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.accentDark }}><Zap size={13} /> Fair by design</div>
            <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', margin: '8px 0 0' }}>You only pay for the AI you actually use.</h3>
            <p style={{ color: t.sub, fontSize: 14, margin: '8px 0 0', maxWidth: '48ch' }}>Every plan includes a monthly compute allowance — enough for a normal month. Each teammate you activate adds <b>{COMPUTE.agentIncludedCredits} credits</b> to the pool. Heavy month? Top up in one tap. No surprise bills, ever.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {COMPUTE.packs.map((k) => (
              <div key={k.id} style={{ flex: '1 1 120px', minWidth: 120, background: t.card2, border: `1.5px solid ${t.line}`, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>${k.price}</div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: t.accentDark, marginTop: 2 }}><b style={{ color: t.ink }}>{k.credits.toLocaleString()}</b> credits</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ borderTop: `1.5px solid ${t.line}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 20px 44px', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', color: t.muted, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: t.ink }}><Compass size={18} color={t.accent} /> JobScout</div>
          <div style={{ display: 'flex', gap: 18 }}>
            <a href="/terms" style={{ color: t.muted, textDecoration: 'none' }}>Terms</a>
            <a href="/privacy" style={{ color: t.muted, textDecoration: 'none' }}>Privacy</a>
            <a href="/login" style={{ color: t.muted, textDecoration: 'none' }}>Sign in</a>
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 860px) {
          .pricing-builder { grid-template-columns: minmax(0,1fr) !important; }
          .pricing-compute { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
    </div>
  )
}

const liRow = (t) => ({ fontSize: 13.5, display: 'flex', gap: 9, alignItems: 'flex-start', color: t.ink })
