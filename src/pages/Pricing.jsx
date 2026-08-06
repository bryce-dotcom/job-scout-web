// Public storefront + "Sign Up a Customer" page (route: /pricing, no auth).
//
// Doubles as the marketing page embedded on the AppSannex site. Everything on
// it is REAL and pulled from the same sources the app uses:
//   - Plans/prices  → lib/billingPlans.js (PLANS)  — one source of truth
//   - Platform depth → lib/featureCatalog.js (134 features / 14 systems, and
//     the market tools each one replaces) — auto-updates as the catalog grows
//   - AI crew        → the 7 agents currently `active` in the agents table
//     (Base Camp), with 12 more trades marked coming_soon
// Signup is open (no invite code). CTAs deep-link the signup form with the plan
// preselected: a rep can sign a customer up on the spot, or a prospect selfserve.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLANS } from '../lib/billingPlans'
import { FEATURE_CATALOG } from '../lib/featureCatalog'
import { useStore } from '../lib/store'
import {
  Compass, Check, ArrowRight, ArrowLeft, Zap, Star, WifiOff, Bot,
  Users, Briefcase, Lightbulb, Truck, Sprout, Package, BookOpen,
  Wallet, Target, Shield, Plug, BarChart3, Sparkles,
} from 'lucide-react'

// Topo field-ops palette — the app's own identity (earthy green + warm paper +
// hi-vis safety orange). Carried locally because this page renders outside the
// authed Layout, and so it can be lifted onto the marketing site untouched.
const t = {
  bg: '#f3efe4', bg2: '#ece4d2', card: '#ffffff', card2: '#f1ecde',
  ink: '#20261c', sub: '#4c5850', muted: '#7d8a7f', line: '#d7cdb6', line2: '#c7bca1',
  accent: '#55613c', accentDk: '#3d4829', accentBg: 'rgba(85,97,60,0.10)',
  hivis: '#cf7a1f', hivisDk: '#b0651a', hivisBg: 'rgba(207,122,31,0.12)',
  night: '#20261c',
}
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// The live crew — the 7 agents currently `active` in Base Camp. Names, roles,
// and "replaces" all pulled from the real agent records + feature catalog.
const CREW = [
  { id: 'arnie',   ab: 'AR', name: 'OG Arnie', role: 'The Right Hand',      free: true,
    ds: 'Ask anything about your business in plain English — then have him set up the account, fix data, and run the busywork.', repl: 'ChatGPT Team, Copilot' },
  { id: 'zach',    ab: 'ZA', name: 'Zach',     role: 'The Yard Yeti',
    ds: 'Measures a lawn from the sky and drops an instant quote in the prospect’s inbox — then runs the routes and treatments.', repl: 'Service Autopilot, GreenPal' },
  { id: 'lenard',  ab: 'LE', name: 'Lenard',   role: 'The Lighting Auditor',
    ds: 'Snaps a photo, IDs every fixture, and calculates the exact utility rebate — turnkey LED proposals in minutes.', repl: 'Snugg Pro, Rifeline' },
  { id: 'frankie', ab: 'FR', name: 'Frankie',  role: 'The AI CFO',
    ds: '“Why is cash tight this month?” He tracks AR/AP, flags expense anomalies, runs job profitability, and chases collections.', repl: 'Pilot.com, Bench' },
  { id: 'freddy',  ab: 'FD', name: 'Freddy',   role: 'The Fleet Manager',
    ds: 'Tracks every truck on phone GPS, schedules maintenance, logs fuel, and scores drivers — no $40/truck hardware.', repl: 'Fleetio, Samsara' },
  { id: 'victor',  ab: 'VI', name: 'Victor',   role: 'The Inspector',
    ds: 'Scores finished work against the checklist from job-site photos, flags problems, and issues a verification report.', repl: 'CompanyCam QA' },
  { id: 'conrad',  ab: 'CO', name: 'Conrad',   role: 'The Closer',
    ds: 'Writes and sends the campaigns and follow-ups that bring customers back — synced straight to Constant Contact.', repl: 'Mailchimp, Klaviyo' },
]
// 12 trade specialists in the pipeline (agents marked coming_soon).
const COMING = ['Plumbing', 'HVAC', 'Roofing', 'Electrical', 'Painting', 'Masonry', 'Flooring', 'Windows', 'Cleaning', 'Gutters', 'Excavation', 'Safety']

// Curated wall of recognizable tools JobScout replaces (all sourced from the
// feature catalog's `replaces` fields — the honest, brand-name subset).
const REPLACES = [
  'QuickBooks', 'Gusto', 'ADP', 'Jobber', 'HousecallPro', 'ServiceTitan', 'DocuSign',
  'Calendly', 'Mailchimp', 'Apollo.io', 'ZoomInfo', 'Fleetio', 'Samsara', 'Expensify',
  'BambooHR', 'Rippling', 'Xero', 'Pipedrive', 'HubSpot', 'CompanyCam', 'Constant Contact',
  'Service Autopilot', 'Snugg Pro', 'Pilot.com', 'Ninety.io', 'When I Work', 'Track1099',
  'MileIQ', 'Fishbowl', 'Trainual', 'Checkr', 'Square',
]

// Compute-wallet display values (kept in sync with _shared/computeConfig.ts).
const COMPUTE = {
  agentIncludedCredits: 350,
  tierIncludedCredits: { field_crew: 250, field_pro: 750, field_boss: 2000 },
  packs: [
    { price: 10, credits: 140 }, { price: 25, credits: 350 },
    { price: 50, credits: 700 }, { price: 100, credits: 1600 },
  ],
}

const CAT_ICON = {
  'Sales & CRM': Users, 'Project & Job Management': Briefcase, 'Lighting & Energy': Lightbulb,
  'Fleet & Vehicles': Truck, 'Lawn Care': Sprout, 'Inventory & Catalog': Package,
  'Books & Accounting': BookOpen, 'Payroll, HR & Onboarding': Wallet, 'AI Crew': Bot,
  'EOS & Business Operations': Target, 'PWA, Offline & Mobile': WifiOff,
  'Admin & Multi-tenant': Shield, 'Integrations': Plug, 'Reports & Insights': BarChart3,
}

export default function Pricing() {
  const navigate = useNavigate()
  const company = useStore((s) => s.company) // set when a logged-in rep opens this
  const [hired, setHired] = useState({})
  const [period, setPeriod] = useState('mo')

  const featureCount = FEATURE_CATALOG.reduce((s, c) => s + (c.features?.length || 0), 0)

  // Plan-sizer: count paid specialists hired (Arnie is free, always included).
  const n = CREW.filter((a) => hired[a.id] && !a.free).length
  const rec = n <= 1 ? PLANS[0] : n <= 5 ? PLANS[1] : PLANS[2]
  const recCredits = (COMPUTE.tierIncludedCredits[rec.id] || 0) + COMPUTE.agentIncludedCredits * n
  const recWhy = n === 0 ? 'Start solo — Arnie’s free with every plan. Add specialists and we’ll size it up.'
    : n <= 1 ? 'One paid specialist fits the Field Crew plan just right.'
    : n <= 5 ? 'A full bench like this runs best on Field Pro.'
    : 'That’s the whole crew — Field Boss unlocks every agent, live and future.'

  const goSignup = (planId) => navigate(`/login?signup=1&plan=${planId}`)

  const btn = (bg, fg) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '13px 22px', minHeight: 46, borderRadius: 11, border: '1.5px solid transparent',
    background: bg, color: fg, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
    textDecoration: 'none', letterSpacing: '0.01em',
  })
  const ghost = { ...btn('transparent', t.ink), border: `1.5px solid ${t.line2}` }
  const eyebrow = { fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.muted }
  const h2 = { fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.025em', margin: 0, textWrap: 'balance' }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, fontFamily: SANS }}>
      {/* topo contour texture, very faint */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.5, zIndex: 0,
        backgroundImage: `radial-gradient(${t.line} 0.5px, transparent 0.5px)`, backgroundSize: '22px 22px' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* top bar */}
        <header style={{ maxWidth: 1140, margin: '0 auto', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${t.accent}`, color: t.accent, display: 'grid', placeItems: 'center' }}><Compass size={17} /></span>
            JobScout
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href="#plans" style={{ ...ghost, padding: '8px 15px', minHeight: 40, fontSize: 13, fontWeight: 650 }}>See plans</a>
            {company
              ? <button onClick={() => navigate('/')} style={{ ...ghost, padding: '8px 14px', minHeight: 40, fontSize: 13, fontWeight: 650 }}><ArrowLeft size={15} /> Back to app</button>
              : <button onClick={() => navigate('/login')} style={{ ...btn(t.accent, '#fff'), padding: '8px 16px', minHeight: 40, fontSize: 13 }}>Sign in</button>}
          </div>
        </header>

        {/* ─────────────── HERO ─────────────── */}
        <section style={{ maxWidth: 980, margin: '0 auto', padding: '48px 22px 8px' }}>
          <div style={eyebrow}>The operating system for field-service crews</div>
          <h1 style={{ fontSize: 'clamp(36px, 7vw, 68px)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '18px 0 0', textWrap: 'balance' }}>
            Run the whole operation from one app —<br />
            <span style={{ color: t.accentDk }}>with an AI crew that </span>
            <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>never clocks out
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: '0.04em', height: '0.16em', background: t.hivis, opacity: 0.55, borderRadius: 2 }} />
            </span>.
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.1vw, 20px)', color: t.sub, margin: '22px 0 0', maxWidth: '62ch', lineHeight: 1.55 }}>
            Leads, quotes, jobs, invoices, books, payroll, fleet — JobScout replaces the pile of apps
            you’re duct-taping together, and comes with a bench of AI specialists who quote lawns, audit
            lighting, chase invoices, and check the work. <b style={{ color: t.ink }}>Pick your crew. We’ll size the plan.</b>
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 30, flexWrap: 'wrap' }}>
            <button onClick={() => goSignup(rec.id)} style={btn(t.hivis, '#fff')}>
              {company ? 'Sign this customer up' : 'Start free — 30 days'} <ArrowRight size={17} />
            </button>
            <a href="#crew" style={ghost}>Meet the crew</a>
          </div>
          {/* live stat strip */}
          <div style={{ display: 'flex', gap: 0, marginTop: 40, flexWrap: 'wrap', border: `1.5px solid ${t.line}`, borderRadius: 14, overflow: 'hidden', background: t.card }}>
            {[
              [`${featureCount}`, 'features, shipped'],
              ['14', 'systems in one login'],
              ['7', 'AI specialists live'],
              ['100%', 'works offline in the field'],
            ].map(([big, small], i) => (
              <div key={i} style={{ flex: '1 1 160px', minWidth: 140, padding: '18px 20px', borderLeft: i ? `1.5px solid ${t.line}` : 'none' }}>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{big}</div>
                <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{small}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─────────────── REPLACE YOUR STACK ─────────────── */}
        <section style={{ maxWidth: 1140, margin: '0 auto', padding: '56px 22px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1.1fr)', gap: 34, alignItems: 'center' }} className="pr-split">
            <div>
              <div style={{ ...eyebrow, color: t.hivisDk }}>One subscription, not twelve</div>
              <h2 style={{ ...h2, margin: '10px 0 0' }}>Cancel the stack you’re already paying for.</h2>
              <p style={{ color: t.sub, fontSize: 15.5, margin: '14px 0 0', maxWidth: '46ch', lineHeight: 1.55 }}>
                Every feature was built to retire a tool you’re bleeding money on each month. Here’s a sample of
                what one JobScout login stands in for — the whole list runs past <b>{REPLACES.length}+</b> apps.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20, padding: '10px 15px', borderRadius: 10, background: t.hivisBg, color: t.hivisDk, fontWeight: 700, fontSize: 13.5 }}>
                <Zap size={15} /> One bill. One login. One source of truth.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {REPLACES.map((tool) => (
                <span key={tool} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9, background: t.card, border: `1.5px solid ${t.line}`, fontSize: 13, color: t.muted, fontWeight: 600 }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: 2, background: t.hivis, transform: 'rotate(45deg)' }} />
                  <span style={{ textDecoration: 'line-through', textDecorationColor: t.line2 }}>{tool}</span>
                </span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 12px', borderRadius: 9, background: t.accentBg, border: `1.5px solid ${t.accent}`, fontSize: 13, color: t.accentDk, fontWeight: 700 }}>+ many more</span>
            </div>
          </div>
        </section>

        {/* ─────────────── AI CREW + PLAN SIZER ─────────────── */}
        <section id="crew" style={{ maxWidth: 1140, margin: '0 auto', padding: '56px 22px 12px' }}>
          <div style={eyebrow}>The differentiator</div>
          <h2 style={{ ...h2, margin: '10px 0 6px' }}>Build the crew. We’ll size the plan.</h2>
          <p style={{ color: t.sub, margin: '0 0 26px', maxWidth: '64ch', fontSize: 15.5 }}>
            Every teammate is an AI specialist that replaces a whole category of software — included in your plan,
            not billed by the seat. Toggle who you’d put to work; the panel sizes your plan and monthly compute live.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }} className="pr-builder">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
              {CREW.map((a) => {
                const on = a.free || !!hired[a.id]
                return (
                  <button key={a.id} onClick={() => !a.free && setHired((h) => ({ ...h, [a.id]: !h[a.id] }))}
                    style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '15px 16px', borderRadius: 13,
                      cursor: a.free ? 'default' : 'pointer', background: on ? t.accentBg : t.card,
                      border: `1.5px solid ${on ? t.accent : t.line}`, minHeight: 44, position: 'relative' }}>
                    <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 14,
                      background: on ? t.accent : t.card2, color: on ? '#fff' : t.accentDk }}>{a.ab}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <b style={{ fontSize: 15 }}>{a.name}</b>
                        {a.free && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.hivisDk, background: t.hivisBg, padding: '2px 6px', borderRadius: 5, fontWeight: 700 }}>Free</span>}
                      </span>
                      <span style={{ display: 'block', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.accentDk, marginTop: 3 }}>{a.role}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: t.sub, marginTop: 6, lineHeight: 1.4 }}>{a.ds}</span>
                      <span style={{ display: 'block', fontFamily: MONO, fontSize: 10.5, color: t.muted, marginTop: 7 }}>replaces <span style={{ color: t.hivisDk }}>{a.repl}</span></span>
                    </span>
                    {!a.free && (
                      <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center',
                        background: on ? t.accent : t.card, border: `1.5px solid ${on ? t.accent : t.line2}`, color: '#fff' }}>{on && <Check size={14} />}</span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* sizer readout */}
            <aside style={{ background: t.night, color: t.bg, borderRadius: 18, padding: 26, position: 'sticky', top: 16,
              backgroundImage: `radial-gradient(rgba(255,255,255,0.05) 0.5px, transparent 0.5px)`, backgroundSize: '18px 18px' }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.6 }}>Recommended plan</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', margin: '5px 0 0' }}>{rec.name}</div>
              <div style={{ fontSize: 12.5, opacity: 0.72, marginTop: 5, minHeight: '3.6em', lineHeight: 1.4 }}>{recWhy}</div>
              <div style={{ height: 1, background: 'currentColor', opacity: 0.16, margin: '16px 0' }} />
              {[['Crew hired', `${n + 1} on the bench`], ['Seats', rec.user_cap ? `${rec.user_cap} users` : 'Unlimited'], ['Price', `$${rec.monthly_price}/mo`]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 12, padding: '5px 0' }}>
                  <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: 'currentColor', opacity: 0.16, margin: '16px 0' }} />
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.6 }}>Monthly compute included</div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 5 }}>{recCredits.toLocaleString()} <span style={{ fontSize: 14, opacity: 0.7 }}>credits</span></div>
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>Enough for a normal month. Top up anytime.</div>
              <button onClick={() => goSignup(rec.id)} style={{ ...btn(t.hivis, '#fff'), width: '100%', marginTop: 20 }}>Start with {rec.name} <ArrowRight size={16} /></button>
            </aside>
          </div>
          {/* coming soon strip */}
          <div style={{ marginTop: 20, padding: '16px 18px', borderRadius: 14, border: `1.5px dashed ${t.line2}`, background: t.card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.accentDk, fontWeight: 700 }}>12 more trades rolling in</span>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {COMING.map((c) => (
                <span key={c} style={{ fontSize: 12.5, color: t.muted, padding: '4px 10px', borderRadius: 20, background: t.card2, border: `1px solid ${t.line}` }}>{c}</span>
              ))}
            </div>
            <span style={{ fontSize: 12.5, color: t.muted, marginLeft: 'auto' }}>Field Boss gets every new agent first.</span>
          </div>
        </section>

        {/* ─────────────── PLATFORM BREADTH ─────────────── */}
        <section style={{ maxWidth: 1140, margin: '0 auto', padding: '56px 22px 12px' }}>
          <div style={eyebrow}>Not an AI wrapper — the whole business</div>
          <h2 style={{ ...h2, margin: '10px 0 6px' }}>{featureCount} features. 14 systems. One app.</h2>
          <p style={{ color: t.sub, margin: '0 0 26px', maxWidth: '62ch', fontSize: 15.5 }}>
            The AI crew rides on top of a full operations platform — the same one that runs real lighting, lawn,
            and fleet companies today, from the first cold lead to the W-2 at year end.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
            {FEATURE_CATALOG.map((cat) => {
              const Icon = CAT_ICON[cat.category] || Sparkles
              return (
                <div key={cat.category} style={{ background: t.card, border: `1.5px solid ${t.line}`, borderRadius: 14, padding: '18px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 10, background: t.accentBg, color: t.accent, display: 'grid', placeItems: 'center' }}><Icon size={19} /></span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{(cat.features || []).length} features</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15.5, marginTop: 12 }}>{cat.category}</div>
                  <div style={{ fontSize: 12.5, color: t.sub, marginTop: 5, lineHeight: 1.45 }}>{cat.summary}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ─────────────── PLANS ─────────────── */}
        <section id="plans" style={{ maxWidth: 1140, margin: '0 auto', padding: '56px 22px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div>
              <div style={eyebrow}>Straightforward pricing</div>
              <h2 style={{ ...h2, margin: '10px 0 0' }}>Plans that grow with the trucks.</h2>
            </div>
            <div style={{ display: 'inline-flex', background: t.card2, border: `1.5px solid ${t.line}`, borderRadius: 11, padding: 4 }}>
              {['mo', 'yr'].map((p) => (
                <button key={p} onClick={() => setPeriod(p)} style={{ border: 0, background: period === p ? t.card : 'transparent', color: period === p ? t.ink : t.muted,
                  padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, minHeight: 40 }}>
                  {p === 'mo' ? 'Monthly' : 'Annual · 2 months free'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16, alignItems: 'stretch' }}>
            {PLANS.map((p) => {
              const isRec = p.id === rec.id
              const monthly = period === 'yr' ? Math.round(p.annual_price / 12) : p.monthly_price
              return (
                <div key={p.id} style={{ background: t.card, border: `${p.popular ? 2 : 1.5}px solid ${isRec ? t.hivis : p.popular ? t.accent : t.line}`, borderRadius: 18, padding: 26,
                  display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: isRec ? `0 0 0 4px ${t.hivisBg}` : 'none' }}>
                  {p.popular && <span style={badge(t.accent)}><Star size={11} /> Most popular</span>}
                  {isRec && !p.popular && <span style={badge(t.hivis)}>Your pick</span>}
                  <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0 0' }}>{p.name}</h3>
                  <div style={{ color: t.muted, fontSize: 13, marginTop: 4, minHeight: '2.6em' }}>{p.tagline}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, margin: '16px 0 2px' }}>
                    <span style={{ fontWeight: 700, fontSize: 20, alignSelf: 'flex-start', marginTop: 8 }}>$</span>
                    <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{monthly}</span>
                    <span style={{ color: t.muted, fontSize: 14 }}>/mo</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: t.muted, minHeight: '1.3em' }}>{period === 'yr' ? `$${p.annual_price.toLocaleString()} billed yearly` : ' '}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <li style={li}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span><b>{p.user_cap ? `Up to ${p.user_cap} users` : 'Unlimited users'}</b></span></li>
                    <li style={li}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span><b>{p.agent_cap ? `${p.agent_cap} AI specialist${p.agent_cap > 1 ? 's' : ''}` : 'Every AI specialist'}</b>{p.agent_cap ? ' of your choice' : ' + new ones first'}</span></li>
                    <li style={li}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span>Arnie, your AI assistant — <b>free</b></span></li>
                    <li style={li}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span><b>{(COMPUTE.tierIncludedCredits[p.id] || 0).toLocaleString()}</b> compute credits / mo</span></li>
                    {(p.features || []).slice(2).map((f, i) => f.startsWith('Everything')
                      ? <li key={i} style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted, marginTop: 5 }}>{f}</li>
                      : <li key={i} style={li}><Check size={16} color={t.accent} style={{ flex: 'none', marginTop: 2 }} /><span>{f}</span></li>)}
                  </ul>
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <button onClick={() => goSignup(p.id)} style={{ ...btn(isRec ? t.hivis : t.accent, '#fff'), width: '100%' }}>Start 30-day trial</button>
                    <button onClick={() => goSignup(p.id)} style={{ ...ghost, width: '100%' }}>Subscribe now <ArrowRight size={15} /></button>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: t.muted }}>
            Switching from HousecallPro? <b style={{ color: t.accentDk }}>One-click import</b> brings your customers, jobs, and invoices over.
          </div>
        </section>

        {/* ─────────────── COMPUTE ─────────────── */}
        <section style={{ maxWidth: 1140, margin: '0 auto', padding: '40px 22px' }}>
          <div style={{ background: t.card, border: `1.5px solid ${t.line}`, borderRadius: 18, padding: '28px 30px', display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 30, alignItems: 'center' }} className="pr-split">
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...eyebrow, color: t.accentDk }}><Zap size={13} /> Fair by design</div>
              <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', margin: '10px 0 0' }}>You only pay for the AI you actually use.</h3>
              <p style={{ color: t.sub, fontSize: 14.5, margin: '10px 0 0', maxWidth: '48ch', lineHeight: 1.5 }}>
                Every plan includes a monthly compute allowance sized for a normal month, and each specialist you
                activate adds <b>{COMPUTE.agentIncludedCredits} credits</b> to the pool. Big month? Top up in one tap — no surprise bills, ever.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {COMPUTE.packs.map((k) => (
                <div key={k.price} style={{ flex: '1 1 120px', minWidth: 118, background: t.card2, border: `1.5px solid ${t.line}`, borderRadius: 12, padding: '13px 15px' }}>
                  <div style={{ fontSize: 21, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>${k.price}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: t.accentDk, marginTop: 2 }}><b style={{ color: t.ink }}>{k.credits.toLocaleString()}</b> credits</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────── FINAL CTA ─────────────── */}
        <section style={{ maxWidth: 1140, margin: '0 auto', padding: '20px 22px 60px' }}>
          <div style={{ background: t.night, color: t.bg, borderRadius: 22, padding: 'clamp(32px, 6vw, 56px)', textAlign: 'center', position: 'relative', overflow: 'hidden',
            backgroundImage: `radial-gradient(rgba(255,255,255,0.05) 0.5px, transparent 0.5px)`, backgroundSize: '20px 20px' }}>
            <div style={{ ...eyebrow, opacity: 0.6 }}>Free for 30 days · No card to start · Cancel anytime</div>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '14px auto 0', maxWidth: '18ch', textWrap: 'balance', lineHeight: 1.05 }}>
              Put the whole crew to work this week.
            </h2>
            <p style={{ opacity: 0.75, fontSize: 16, margin: '16px auto 0', maxWidth: '46ch', lineHeight: 1.5 }}>
              Set up in an afternoon, import your customers in a click, and let the AI crew handle the busywork while you run the trucks.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
              <button onClick={() => goSignup(rec.id)} style={btn(t.hivis, '#fff')}>{company ? 'Sign this customer up' : 'Start your free trial'} <ArrowRight size={17} /></button>
              <a href="#crew" style={{ ...btn('transparent', t.bg), border: `1.5px solid rgba(255,255,255,0.25)` }}>Meet the crew again</a>
            </div>
          </div>
        </section>

        <footer style={{ borderTop: `1.5px solid ${t.line}` }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '24px 22px 46px', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', color: t.muted, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: t.ink }}><Compass size={18} color={t.accent} /> JobScout</div>
            <div style={{ display: 'flex', gap: 18 }}>
              <a href="/terms" style={{ color: t.muted, textDecoration: 'none' }}>Terms</a>
              <a href="/privacy" style={{ color: t.muted, textDecoration: 'none' }}>Privacy</a>
              <a href="/login" style={{ color: t.muted, textDecoration: 'none' }}>Sign in</a>
            </div>
          </div>
        </footer>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .pr-split { grid-template-columns: minmax(0,1fr) !important; }
          .pr-builder { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
    </div>
  )
}

const li = { fontSize: 13.5, display: 'flex', gap: 9, alignItems: 'flex-start', color: '#20261c' }
const badge = (bg) => ({
  position: 'absolute', top: -11, left: 24, display: 'inline-flex', alignItems: 'center', gap: 5,
  fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
  background: bg, color: '#fff', padding: '4px 10px', borderRadius: 6,
})
