// Public storefront + "Sign Up a Customer" page (route: /pricing, no auth).
//
// The live version of the marketing storefront we perfected: elevated hero
// ("AI workforce"), who-it's-for, the whole-job workflow, AI-prospecting
// spotlight, the real 8-agent crew, one-app consolidation, an honest no-swipe
// comparison, real plans, and a final CTA. Self-contained (own palette, its own
// <style> block for the animations/responsive polish, scout logo from /public)
// so it lifts cleanly onto the AppSannex site.
//
// Prices/caps come from lib/billingPlans.js (one source of truth); marketing
// copy is local. CTAs deep-link the signup form with the plan preselected.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { PLANS as BILLING_PLANS } from '../lib/billingPlans'

const CREW = [
  { ab: 'AR', name: 'OG Arnie', free: true, role: 'Your right hand',
    hook: 'Ask anything about your business in plain English. Arnie answers from your live numbers — then makes the change himself, the second you say go.',
    hi: ['Answers from live data — money, jobs, hours, customers', 'Takes action on your OK: move a job, add a note, reschedule, fix a setting', 'Reads the photos, bills & screenshots you send him', 'Rides shotgun in the field — talks a tech through the job, hands-free'],
    rep: ['a business analyst', 'an office manager', 'hours of admin busywork'],
    out: { kicker: 'answered + drafted', head: '“When’s the Drinkle job — can we push it to Friday?”', rows: ['JOB-2214 · Drinkle Insurance · Thu 8:00 AM', 'Found from your schedule — no ID, no digging'], done: 'Drafted: move it to Friday — nothing changes till you approve' } },
  { ab: 'ZA', name: 'Zach', role: 'Landscaping',
    hook: 'A prospect drops their address; Zach measures the yard from the sky and emails a price — before you roll a truck.',
    hi: ['AI turf detection from aerial imagery', 'Per-sq-ft pricing tiers', 'Auto-creates the lead in your pipeline', 'Public quote link — no login'],
    rep: ['GreenPal', 'on-site measuring', 'measuring wheels'],
    out: { kicker: 'measured from aerial', head: '1600 Elm St, Mesa AZ', rows: ['0.41 acre of turf detected', '$2,400 / season · Standard tier'], done: 'quote emailed + lead created ✓' } },
  { ab: 'LE', name: 'Lenard', role: 'Lighting & energy',
    hook: 'Photograph a warehouse; Lenard IDs every fixture, counts the bulbs, and prices the rebate into a signed proposal.',
    hi: ['AI fixture ID from a photo', 'Counts + tags every fixture', 'Utility rebate math baked in', 'Signed proposal on-site'],
    rep: ['Snugg Pro', 'Rifeline', 'energy consultants'],
    out: { kicker: 'audited a building', head: '60,000 sq ft warehouse', rows: ['214 fixtures · metal-halide → LED', '$18,000 rebate · 1.4-yr payback'], done: 'turnkey proposal generated ✓' } },
  { ab: 'FR', name: 'Frankie', role: 'The AI CFO',
    hook: 'Ask “why is cash tight this month?” and get the answer — receipts attached, collection reminders already drafted.',
    hi: ['Plain-English finance Q&A', 'AR/AP aging + auto-collections', 'Per-job profitability', 'Expense anomaly detection'],
    rep: ['Pilot.com', 'Bench', 'a fractional CFO'],
    out: { kicker: 'answered the owner', head: '“Why is cash tight this month?”', rows: ['3 customers 60+ days late · $9,100', 'Materials spend up 18% vs last month'], done: '3 reminders drafted — send them?' } },
  { ab: 'FD', name: 'Freddy', role: 'Fleet & equipment',
    hook: 'The whole fleet, watched by an AI that catches a fuel-card thief and a missed service before they cost you.',
    hi: ['Fuel-theft & leak detection', 'Predictive service reminders', 'Auto fuel-card reconciliation', 'Insurance-ready driver history'],
    rep: ['Fleetio', 'Samsara'],
    out: { kicker: 'swept the fleet', head: 'This morning’s fleet check', rows: ['⚠ Truck 12 · burning 2× fuel — leak or theft', 'Truck 7 · service due in 568 mi (~2 wks)'], done: 'both pushed to your inbox ✓' } },
  { ab: 'VI', name: 'Victor', role: 'Quality control',
    hook: 'Before you invoice, Victor grades the job from the photos — and catches the half-done work the customer would’ve caught.',
    hi: ['AI workmanship + completeness scoring', 'Missing-shot detection', 'Before / after pairing', 'Letter-grade report on the job'],
    rep: ['CompanyCam Insights', 'PM walk-throughs'],
    out: { kicker: 'graded a job', head: 'Job #4471 · Highbay retrofit', rows: ['Grade A · 94/100 · 8 of 8 bays shot', '2 missing after-photos flagged'], done: 'tech sent back before invoice ✓' } },
  { ab: 'CO', name: 'Conrad', role: 'Marketing',
    hook: 'Tell Conrad the offer; he writes the campaign, picks the audience, sends it, and shows you who booked.',
    hi: ['AI-drafted campaigns', 'Smart customer segments', 'Open + click tracking', 'Set-and-forget drip automations'],
    rep: ['Mailchimp', 'Klaviyo', 'HubSpot'],
    out: { kicker: 'ran a campaign', head: '“Spring maintenance special”', rows: ['86 spring customers segmented', '34% opened · 11 clicked'], done: '6 jobs booked from one email ✓' } },
  { ab: 'DG', name: 'Dougie', role: 'Document reading',
    hook: 'Drop in a bill, receipt, or rebate form; Dougie pulls the fields, learns your corrections, and the data entry stops.',
    hi: ['OCR + structured field extraction', 'Learns your corrections', 'Pre-fills rebate & audit forms', 'PDF or phone photo in'],
    rep: ['Veryfi', 'Mindee', 'manual data entry'],
    out: { kicker: 'read a document', head: 'SRP_utility_bill.pdf · 12 pages', rows: ['12 fields pulled · 48,200 kWh · $6,410', 'Demand peak 214 kW · period tagged'], done: 'rebate form pre-filled ✓' } },
]
const COMING = ['Plumbing', 'HVAC', 'Roofing', 'Electrical', 'Painting', 'Masonry', 'Flooring', 'Windows', 'Cleaning', 'Gutters', 'Excavation', 'Safety']

// Live "AI workforce, on the clock" hero feed — real work the crew does, cycling.
const ACTIVITY = [
  { ab: 'FR', name: 'Frankie', msg: 'flagged a 45-day overdue invoice', meta: '$3,200' },
  { ab: 'ZA', name: 'Zach', msg: 'measured a 0.41-acre yard → quote sent', meta: 'just now' },
  { ab: 'DG', name: 'Dougie', msg: 'read 12 utility bills, fields pulled', meta: '1m' },
  { ab: 'VI', name: 'Victor', msg: 'verified Job #4471 before invoice', meta: '✓' },
  { ab: 'CO', name: 'Conrad', msg: 'queued a win-back to 38 quiet customers', meta: '2m' },
  { ab: 'LE', name: 'Lenard', msg: 'counted 214 fixtures → rebate priced', meta: '3m' },
  { ab: 'AR', name: 'OG Arnie', free: true, msg: 'drafted a reschedule on the Drinkle job', meta: 'needs OK' },
  { ab: 'FD', name: 'Freddy', msg: 'logged PM due on Truck #3', meta: '5m' },
  { ab: 'FR', name: 'Frankie', msg: 'matched 6 bank deposits to invoices', meta: '6m' },
  { ab: 'ZA', name: 'Zach', msg: 'priced a spring cleanup bundle', meta: '8m' },
]

// Per-plan marketing copy, merged with real prices/caps from billingPlans.
const MARKETING = {
  field_crew: { tl: 'Owner-operator or a small crew', feats: ['Full sales-to-paid workflow', 'Invoicing, payments & books', 'Your-branded customer portal', 'Offline field app'] },
  field_pro: { tl: 'An established shop, 5–10 on payroll', pop: true, feats: ['grp:Everything in Crew, plus', 'AI prospecting & lead gen', 'Lighting audits, rebates & fleet', 'Recurring jobs & customer memberships', 'Routes, payment plans & marketing'] },
  field_boss: { tl: 'Multi-crew, multi-location operation', feats: ['grp:Everything in Pro, plus', 'Payroll + every tax form filled', 'Multiple business units & per-unit branding', 'Owner reporting + the EOS rhythm', 'Priority support & onboarding'] },
}
const PLANS = BILLING_PLANS.map((p) => ({
  id: p.id, name: p.name, mo: p.monthly_price, yr: p.annual_price,
  users: p.user_cap ? `Up to ${p.user_cap} users` : 'Unlimited users',
  agents: p.agent_cap ? `${p.agent_cap} AI specialist${p.agent_cap > 1 ? 's' : ''}` : 'Every AI specialist',
  ...MARKETING[p.id],
}))

// Honest capability matrix: 1 = included ●, 0.5 = partial/add-on ◐, 0 = not native —
const CMP_OTHERS = ['Field apps', 'Enterprise', 'DIY']
const CMP_ROWS = [
  ['Scheduling & dispatch', 1, 1, 1, 0.5],
  ['Invoicing & payments', 1, 1, 1, 1],
  ['Accounting & books (native)', 1, 0, 0, 1],
  ['Payroll, W-2s & 1099s', 1, 0, 0, 1],
  ['Fleet & vehicles', 1, 0, 0.5, 1],
  ['CRM & sales pipeline', 1, 0.5, 1, 1],
  ['AI prospecting (web research)', 1, 0, 0, 0.5],
  ['Autonomous AI workforce', 1, 0, 0, 0],
  ['Works offline in the field', 1, 0.5, 0.5, 0],
  ['One login · one bill', 1, 0, 0, 0],
]
const mk = (v) => (v === 1 ? 'y' : v === 0.5 ? 'p' : 'n')

// The stack a growing shop typically rents — canceled by one JobScout bill.
// Costs are typical small-business monthly pricing (approx).
const STACK = [
  { name: 'ServiceTitan dispatch', cost: 200 }, { name: 'QuickBooks', cost: 90 }, { name: 'Gusto / ADP payroll', cost: 120 },
  { name: 'Apollo / ZoomInfo', cost: 99 }, { name: 'HubSpot CRM', cost: 50 }, { name: 'Fleetio / Samsara', cost: 80 },
  { name: 'Mailchimp', cost: 50 }, { name: 'DocuSign', cost: 25 }, { name: 'CompanyCam', cost: 30 },
  { name: 'Expensify', cost: 20 }, { name: 'When I Work', cost: 40 }, { name: 'Ninety.io', cost: 20 },
]
const STACK_TOTAL = STACK.reduce((s, t) => s + t.cost, 0)
const STACK_SAVE = (STACK_TOTAL - 99) * 12

// Illustrative MRR climb for the recurring-revenue spotlight (bar heights, scaleY 0..1).
const MRR_BARS = [0.16, 0.26, 0.34, 0.46, 0.56, 0.68, 0.8, 0.9, 1]

const CSS = `
  .pr{--paper:#f4efe3;--paper2:#ece3d1;--card:#fffdf7;--ink:#191d15;--sub:#4f5a4a;--muted:#848a79;--line:#d9cfb6;--line2:#cabf9f;
    --grn:#54613a;--grnDk:#3a4526;--grnBg:rgba(84,97,58,0.10);--viz:#f26a12;--vizDk:#c9530a;--vizBg:rgba(242,106,18,0.12);
    --night:#161b12;--nightGrn:#212819;--sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;min-height:100vh;-webkit-font-smoothing:antialiased}
  .pr *{box-sizing:border-box}
  .pr a{color:inherit;text-decoration:none}
  .pr .wrap{max-width:1140px;margin:0 auto;padding:0 20px}
  .pr .btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-weight:750;font-size:16px;padding:15px 24px;min-height:52px;border-radius:13px;border:2px solid transparent;cursor:pointer;letter-spacing:.01em;transition:transform .12s ease,box-shadow .2s ease,background .2s ease;white-space:nowrap;font-family:inherit}
  .pr .btn:active{transform:translateY(1px) scale(.99)}
  .pr .btn-viz{background:var(--viz);color:#fff;box-shadow:0 6px 20px -6px rgba(242,106,18,.6)}
  .pr .btn-viz:hover{background:var(--vizDk)}
  .pr .btn-grn{background:var(--grn);color:#fff}
  .pr .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line2)}
  .pr .btn-ghost.on-dark{color:#f4efe3;border-color:rgba(255,255,255,.28)}
  .pr .ic{width:1em;height:1em;stroke:currentColor;stroke-width:2.1;fill:none;stroke-linecap:round;stroke-linejoin:round;flex:none}
  .pr header{position:sticky;top:0;z-index:50;backdrop-filter:saturate(1.4) blur(8px);background:rgba(244,239,227,.82);border-bottom:1px solid var(--line)}
  .pr .bar{display:flex;align-items:center;justify-content:space-between;height:60px;gap:10px}
  .pr .logo{display:flex;align-items:center;gap:9px;font-weight:850;font-size:19px;letter-spacing:-.02em}
  .pr .hd-right{display:flex;align-items:center;gap:10px}
  .pr .hd-link{font-size:14px;font-weight:650;color:var(--sub);cursor:pointer;padding:8px 6px}
  .pr .hd-cta{font-size:14px;padding:9px 16px;min-height:40px;border-radius:10px}
  .pr .eb{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--vizDk);background:var(--vizBg);padding:6px 11px;border-radius:7px}
  .pr .eb.on-dark{color:#ffb27a;background:rgba(242,106,18,.16)}
  .pr h1,.pr h2,.pr h3{margin:0;letter-spacing:-.03em;text-wrap:balance}
  .pr .kicker{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
  .pr .hero{background:var(--night);color:#f4efe3;border-radius:0 0 30px 30px;overflow:hidden;position:relative}
  .pr .hero::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;background:radial-gradient(120% 80% at 100% 0%,rgba(242,106,18,.15),transparent 55%),radial-gradient(rgba(255,255,255,.05) .6px,transparent .6px);background-size:auto,20px 20px}
  .pr .hero .wrap{padding:44px 20px 40px;position:relative}
  .pr .hero h1{font-size:clamp(37px,9.6vw,72px);font-weight:870;line-height:1.02;margin:20px 0 0}
  .pr .hero h1 .hl{position:relative;z-index:0;color:#fff;white-space:nowrap}
  .pr .hero h1 .hl::after{content:"";position:absolute;left:-2px;right:-2px;bottom:.02em;height:.4em;background:var(--viz);z-index:-1;border-radius:4px;transform:skewX(-9deg) scaleX(var(--draw,0));transform-origin:left;transition:transform .7s .2s cubic-bezier(.2,.7,.2,1)}
  .pr .hero.lit h1 .hl::after{--draw:1}
  .pr .hero p.lede{font-size:clamp(16.5px,4.2vw,20px);color:#d7d3c4;margin:20px 0 0;max-width:40ch;line-height:1.5}
  .pr .hero .cta-row{display:flex;flex-direction:column;gap:12px;margin-top:26px}
  .pr .hero .cta-row .btn{width:100%}
  .pr .trust{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:20px;font-size:13.5px;color:#bcc0ad}
  .pr .trust span{display:inline-flex;align-items:center;gap:6px}
  .pr .trust .ic{font-size:14px;color:#8fbf6a}
  .pr .crewstrip{display:flex;align-items:center;gap:8px;margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,.12);flex-wrap:wrap}
  .pr .crewstrip .lbl{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#9aa08c}
  .pr .chip{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-family:var(--mono);font-weight:700;font-size:13px;background:var(--nightGrn);border:1px solid rgba(255,255,255,.14);color:#e9e5d6;opacity:0;transform:translateY(8px);animation:prpop .5s forwards}
  @keyframes prpop{to{opacity:1;transform:none}}
  .pr .hero-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:26px}
  .pr .hero-left{min-width:0}
  .pr .hero-panel{display:none;background:var(--nightGrn);border:1px solid rgba(255,255,255,.13);border-radius:18px;padding:15px 15px 9px;position:relative;overflow:hidden}
  .pr .hero-panel::after{content:"";position:absolute;inset:0;opacity:.35;pointer-events:none;background:radial-gradient(rgba(255,255,255,.05) .6px,transparent .6px);background-size:16px 16px}
  .pr .hp-head{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:#9aa08c;padding:2px 4px 13px;position:relative}
  .pr .hp-dot{width:8px;height:8px;border-radius:50%;background:#8fbf6a;flex:none;animation:hppulse 2.2s infinite}
  @keyframes hppulse{0%{box-shadow:0 0 0 0 rgba(143,191,106,.5)}70%{box-shadow:0 0 0 7px rgba(143,191,106,0)}100%{box-shadow:0 0 0 0 rgba(143,191,106,0)}}
  .pr .hp-feed{display:flex;flex-direction:column;gap:8px;position:relative;-webkit-mask-image:linear-gradient(to bottom,#000 76%,transparent);mask-image:linear-gradient(to bottom,#000 76%,transparent)}
  .pr .hp-row{display:flex;align-items:center;gap:11px;padding:10px 11px;background:#151a10;border:1px solid rgba(255,255,255,.07);border-radius:11px;animation:hpin .55s cubic-bezier(.2,.7,.2,1)}
  @keyframes hpin{from{opacity:0;transform:translateY(-9px)}to{opacity:1;transform:none}}
  .pr .hp-av{width:32px;height:32px;flex:none;border-radius:9px;display:grid;place-items:center;font-family:var(--mono);font-weight:750;font-size:12px;background:var(--grn);color:#fff}
  .pr .hp-av.free{background:var(--viz)}
  .pr .hp-txt{font-size:13px;color:#d6d2c2;line-height:1.35;min-width:0}
  .pr .hp-txt b{color:#fff;font-weight:750}
  .pr .hp-meta{margin-left:auto;font-family:var(--mono);font-size:11px;color:#7fae5c;flex:none;white-space:nowrap;align-self:flex-start;padding-top:3px}
  .pr section{padding:52px 0 8px}
  .pr .sechead h2{font-size:clamp(27px,6.4vw,42px);font-weight:850;line-height:1.05;margin-top:10px}
  .pr .sechead p{color:var(--sub);font-size:16px;margin:12px 0 0;max-width:54ch}
  .pr .forwho{margin-top:22px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .pr .forwho .who{font-size:14px;color:var(--sub);padding:8px 14px;border-radius:10px;background:var(--card);border:1px solid var(--line);display:inline-flex;gap:8px;align-items:center}
  .pr .forwho .who b{color:var(--ink)}
  .pr .forwho .who .ic{font-size:16px;color:var(--grn)}
  .pr .flow{display:grid;grid-template-columns:1fr;gap:12px;margin-top:24px;counter-reset:step}
  .pr .step{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;position:relative;overflow:hidden}
  .pr .step::before{counter-increment:step;content:"0" counter(step);position:absolute;top:8px;right:14px;font-family:var(--mono);font-size:44px;font-weight:800;color:var(--paper2);letter-spacing:-.04em}
  .pr .step .ic{font-size:25px;color:var(--viz)}
  .pr .step h3{font-size:20px;font-weight:800;margin-top:12px}
  .pr .step p{color:var(--sub);font-size:15px;margin:6px 0 0;max-width:40ch}
  .pr .step .was{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-top:12px}
  .pr .step .was b{color:var(--vizDk)}
  .pr .prospect{margin-top:24px;background:var(--nightGrn);color:#eae6d7;border-radius:22px;padding:26px 22px;position:relative;overflow:hidden}
  .pr .prospect::after{content:"";position:absolute;inset:0;opacity:.4;pointer-events:none;background:radial-gradient(rgba(255,255,255,.05) .6px,transparent .6px);background-size:18px 18px}
  .pr .prospect .eb{margin-bottom:14px}
  .pr .prospect h3{font-size:clamp(22px,5.4vw,30px);font-weight:840;line-height:1.08;color:#fff;position:relative}
  .pr .prospect .say{color:#cfcbba;font-size:15px;margin:12px 0 0;max-width:44ch;position:relative}
  .pr .term{margin-top:18px;background:#0f130c;border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;position:relative;font-family:var(--mono);font-size:12.5px}
  .pr .term .top{display:flex;gap:6px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.08);align-items:center}
  .pr .term .top i{width:10px;height:10px;border-radius:50%;background:#3a4030;display:block}
  .pr .term .q{padding:14px;color:#9fe08a}
  .pr .term .q .cur{display:inline-block;width:8px;height:15px;background:#f26a12;vertical-align:-2px;margin-left:3px;animation:prblink 1.1s steps(1) infinite}
  @keyframes prblink{50%{opacity:0}}
  .pr .term .res{padding:0 14px 14px;display:flex;flex-direction:column;gap:8px}
  .pr .term .row{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;background:#151a10;border:1px solid rgba(255,255,255,.07);border-radius:9px;color:#d6d2c2}
  .pr .term .row .cited{color:#7fae5c;font-size:10.5px;display:inline-flex;align-items:center;gap:4px}
  .pr .prospect .repl{font-family:var(--mono);font-size:11.5px;color:#9aa08c;margin-top:14px;position:relative}
  .pr .prospect .repl b{color:#ffb27a}
  .pr .recur{margin-top:24px;background:var(--nightGrn);color:#eae6d7;border-radius:22px;padding:26px 22px;position:relative;overflow:hidden}
  .pr .recur::after{content:"";position:absolute;inset:0;opacity:.4;pointer-events:none;background:radial-gradient(rgba(255,255,255,.05) .6px,transparent .6px);background-size:18px 18px}
  .pr .recur .eb{color:#cbb8ff;background:rgba(139,92,246,.18)}
  .pr .recur h3{font-size:clamp(22px,5.4vw,30px);font-weight:840;line-height:1.08;color:#fff;position:relative;margin-top:14px}
  .pr .recur .say{color:#cfcbba;font-size:15px;margin:12px 0 0;max-width:47ch;position:relative;line-height:1.5}
  .pr .recur-grid{display:grid;grid-template-columns:1fr;gap:14px;margin-top:20px;position:relative}
  .pr .planc{background:#12160d;border:1px solid rgba(139,92,246,.35);border-radius:16px;padding:18px;display:flex;flex-direction:column}
  .pr .planc-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:13px}
  .pr .planc-top .nm{font-size:17px;font-weight:800;color:#fff}
  .pr .planc-top .mo{font-family:var(--mono);font-size:12.5px;color:#cbb8ff;white-space:nowrap}
  .pr .planc-top .mo b{font-size:23px;color:#fff;font-weight:850}
  .pr .planc ul{list-style:none;padding:0;margin:14px 0 0;display:flex;flex-direction:column;gap:10px}
  .pr .planc li{display:flex;gap:9px;font-size:13.5px;color:#d6d2c2;align-items:center}
  .pr .planc li .ic{font-size:15px;color:#a78bfa;flex:none}
  .pr .planc .memb{margin-top:15px;padding-top:13px;border-top:1px solid rgba(255,255,255,.1);font-family:var(--mono);font-size:11.5px;color:#9aa08c;display:flex;align-items:center;gap:7px}
  .pr .planc .memb .ic{font-size:13px;color:#a78bfa}
  .pr .planc .memb b{color:#cbb8ff}
  .pr .mrr{background:#0f130c;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px;display:flex;flex-direction:column}
  .pr .mrr .mlbl{font-family:var(--mono);font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:#9aa08c}
  .pr .mrr .mval{font-size:31px;font-weight:850;color:#fff;letter-spacing:-.02em;margin-top:5px;font-variant-numeric:tabular-nums;line-height:1}
  .pr .mrr .mval .u{font-size:14px;color:#a78bfa;font-weight:750}
  .pr .mrr-bars{display:flex;align-items:flex-end;gap:6px;height:94px;margin-top:16px}
  .pr .mrr-bar{flex:1;min-width:0;height:100%;background:linear-gradient(180deg,#a78bfa,#7c3aed);border-radius:4px 4px 2px 2px;transform-origin:bottom;transform:scaleY(var(--h,1));animation:mgrow .7s cubic-bezier(.2,.7,.2,1) both}
  @keyframes mgrow{from{transform:scaleY(0)}}
  .pr .mrr .mcap{font-family:var(--mono);font-size:11px;color:#7fae5c;margin-top:13px;display:flex;align-items:center;gap:7px}
  .pr .mrr .mcap .ic{font-size:12px;flex:none}
  .pr .recur .repl{font-family:var(--mono);font-size:11.5px;color:#9aa08c;margin-top:16px;position:relative}
  .pr .recur .repl b{color:#cbb8ff}
  @media(min-width:640px){ .pr .recur-grid{grid-template-columns:1fr 1fr} }
  .pr .crewgrid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:24px}
  .pr .agent{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;gap:14px;align-items:flex-start}
  .pr .agent .av{width:50px;height:50px;flex:none;border-radius:14px;display:grid;place-items:center;font-family:var(--mono);font-weight:750;font-size:16px;background:var(--grn);color:#fff}
  .pr .agent.free .av{background:var(--viz)}
  .pr .agent h3{font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .pr .tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;padding:3px 7px;border-radius:6px;background:var(--vizBg);color:var(--vizDk)}
  .pr .agent .role{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--grnDk);margin-top:3px}
  .pr .agent p{color:var(--sub);font-size:14.5px;margin:8px 0 0;line-height:1.45}
  .pr .agshow{margin-top:22px}
  .pr .agrail{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none}
  .pr .agrail::-webkit-scrollbar{display:none}
  .pr .agpick{flex:none;display:inline-flex;align-items:center;gap:8px;padding:7px 13px 7px 7px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s}
  .pr .agpick .ab{width:29px;height:29px;flex:none;border-radius:8px;display:grid;place-items:center;font-family:var(--mono);font-weight:750;font-size:11px;background:var(--grn);color:#fff}
  .pr .agpick.free .ab{background:var(--viz)}
  .pr .agpick .pn{font-size:13.5px;font-weight:700;color:var(--sub);white-space:nowrap}
  .pr .agpick.on{border-color:var(--grn);background:var(--grnBg)}
  .pr .agpick.on .pn{color:var(--ink)}
  .pr .agpick.on.free{border-color:var(--viz);background:var(--vizBg)}
  .pr .agstage{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-top:6px;animation:agfade .45s cubic-bezier(.2,.7,.2,1)}
  @keyframes agfade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .pr .agid{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;display:flex;flex-direction:column}
  .pr .agtop{display:flex;align-items:center;gap:13px}
  .pr .agav{width:52px;height:52px;flex:none;border-radius:14px;display:grid;place-items:center;font-family:var(--mono);font-weight:750;font-size:17px;background:var(--grn);color:#fff}
  .pr .agav.free{background:var(--viz)}
  .pr .agid h3{font-size:20px;font-weight:850;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .pr .agid .role{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--grnDk);margin-top:4px}
  .pr .aghook{font-size:16px;color:var(--ink);line-height:1.45;margin:15px 0 0;font-weight:550}
  .pr .aghi{list-style:none;padding:0;margin:14px 0 0;display:grid;grid-template-columns:1fr;gap:9px}
  .pr .aghi li{display:flex;gap:9px;font-size:14px;color:var(--sub);align-items:flex-start}
  .pr .aghi li .ic{font-size:15px;color:var(--grn);flex:none;margin-top:2px}
  .pr .agrep{margin-top:16px;padding-top:14px;border-top:1px dashed var(--line);font-family:var(--mono);font-size:12px;color:var(--muted)}
  .pr .agrep .rl{color:var(--vizDk);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:10.5px;margin-right:7px}
  .pr .agout{background:#0f130c;border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;position:relative;font-family:var(--mono);display:flex;flex-direction:column}
  .pr .agout-top{display:flex;gap:6px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.08);align-items:center}
  .pr .agout-top i{width:10px;height:10px;border-radius:50%;background:#3a4030;display:block}
  .pr .agout-top .ot{color:#6b7160;font-size:11px;margin-left:6px}
  .pr .agout-body{padding:15px 15px 16px;display:flex;flex-direction:column;gap:9px;flex:1}
  .pr .agout-kick{display:flex;align-items:center;gap:9px;font-family:var(--sans);font-size:12px;color:#9aa08c}
  .pr .agout-av{width:24px;height:24px;flex:none;border-radius:7px;display:grid;place-items:center;font-weight:750;font-size:10px;background:var(--grn);color:#fff}
  .pr .agout-av.free{background:var(--viz)}
  .pr .agout-head{font-size:15px;color:#f3efe2;font-weight:600;font-family:var(--sans);margin-top:2px}
  .pr .agout-row{font-size:12.5px;color:#cdd0c2;background:#151a10;border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:9px 11px;line-height:1.4}
  .pr .agout-done{margin-top:auto;font-family:var(--sans);font-size:12.5px;font-weight:650;color:#ffcf8f;background:rgba(242,106,18,.12);border:1px solid rgba(242,106,18,.25);border-radius:9px;padding:10px 11px}
  .pr .coming{margin-top:16px;padding:16px 18px;border:1.5px dashed var(--line2);border-radius:16px;background:var(--card)}
  .pr .coming .lbl{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--grnDk)}
  .pr .coming .pills{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
  .pr .coming .pills span{font-size:13px;color:var(--sub);padding:5px 11px;border-radius:20px;background:var(--paper2);border:1px solid var(--line)}
  .pr .oneapp{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;margin-top:24px}
  .pr .jobrow{display:flex;gap:13px;padding:15px 0;border-top:1px solid var(--line)}
  .pr .jobrow:first-child{border-top:0;padding-top:2px}
  .pr .jobrow .ic{font-size:22px;color:var(--grn);flex:none;margin-top:2px}
  .pr .jobrow h3{font-size:16.5px;font-weight:800}
  .pr .jobrow p{color:var(--sub);font-size:14px;margin:3px 0 0}
  .pr .jobrow .bye{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:5px}
  .pr .jobrow .bye b{color:var(--grnDk)}
  .pr .savings{margin-top:16px;text-align:center;font-size:14.5px;color:var(--sub)}
  .pr .savings b{color:var(--vizDk)}
  .pr .hd-share{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:13.5px;font-weight:700;color:var(--sub);background:transparent;border:1px solid var(--line2);border-radius:10px;padding:8px 12px;min-height:40px;cursor:pointer;transition:border-color .15s,color .15s}
  .pr .hd-share:hover{border-color:var(--grn);color:var(--grn)}
  .pr .hd-share.done{color:var(--grn);border-color:var(--grn)}
  .pr .hd-share .ic{font-size:15px}
  .pr .fshare{margin-top:18px;background:none;border:0;font-family:inherit;font-size:14px;font-weight:650;color:#bcc0ad;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
  .pr .fshare:hover{color:#fff}
  .pr .stack{margin-top:20px;background:var(--night);color:#e9e5d6;border-radius:22px;padding:26px 22px;position:relative;overflow:hidden}
  .pr .stack::after{content:"";position:absolute;inset:0;opacity:.4;pointer-events:none;background:radial-gradient(rgba(255,255,255,.05) .6px,transparent .6px);background-size:18px 18px}
  .pr .stack .kicker{position:relative;color:#9aa08c}
  .pr .stack-h{font-size:clamp(21px,5vw,28px);font-weight:840;color:#fff;margin-top:8px;position:relative}
  .pr .stack-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px;position:relative}
  .pr .stk{display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:9px 11px}
  .pr .stk-n{font-size:12px;color:#a8ac9c;text-decoration:line-through;text-decoration-color:rgba(242,106,18,.55);line-height:1.25}
  .pr .stk-c{font-family:var(--mono);font-size:11px;color:#767b69;white-space:nowrap}
  .pr .stack-total{margin-top:20px;text-align:center;position:relative}
  .pr .stack-total .tot{font-size:15px;color:#cfcbba}
  .pr .stack-total .tot b{color:#fff;font-size:18px;font-variant-numeric:tabular-nums}
  .pr .stack-arrow{color:var(--viz);margin:4px 0;display:flex;justify-content:center}
  .pr .stack-js{font-size:clamp(18px,4.6vw,25px);font-weight:850;color:#fff;letter-spacing:-.02em}
  .pr .stack-js b{color:#ffb27a}
  .pr .stack-save{margin-top:10px;display:inline-block;font-family:var(--mono);font-size:13px;font-weight:700;color:#8fbf6a;background:rgba(143,191,106,.12);border:1px solid rgba(143,191,106,.3);border-radius:8px;padding:6px 12px}
  .pr .stack-note{font-size:11px;color:#767b69;text-align:center;margin-top:14px;position:relative}
  .pr .onlyus{display:grid;grid-template-columns:1fr;gap:12px;margin-top:18px}
  .pr .ou{background:var(--card);border:1.5px solid var(--grn);border-radius:16px;padding:20px;box-shadow:0 12px 34px -20px rgba(84,97,58,.55)}
  .pr .ou h3{font-size:19px;font-weight:850;margin-top:10px}
  .pr .ou p{color:var(--sub);font-size:14px;margin:8px 0 0;line-height:1.45}
  .pr .ou-tag{display:inline-block;margin-top:12px;font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--grn);padding:4px 9px;border-radius:6px}
  .pr .leg{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
  .pr .leg span{font-size:12px;color:var(--sub);background:var(--paper2);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
  .pr .leg b{color:var(--ink)}
  .pr .cmp-frame{font-size:14.5px;color:var(--sub);margin-top:14px}
  .pr .cmp-frame b{color:var(--grnDk)}
  .pr .cmpgrid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px}
  .pr .cmpcard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 16px}
  .pr .cmpcard .cap{display:flex;gap:10px;align-items:center;font-weight:750;font-size:15px;line-height:1.25}
  .pr .cmpcard .ck{width:26px;height:26px;flex:none;border-radius:8px;background:var(--grnBg);color:var(--grn);display:grid;place-items:center}
  .pr .cmpcard .ck .ic{font-size:16px}
  .pr .cmpcard .others{display:flex;flex-wrap:wrap;align-items:center;gap:8px 15px;margin-top:11px;padding-top:11px;border-top:1px dashed var(--line)}
  .pr .cmpcard .olbl{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--muted)}
  .pr .cmpcard .o{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--sub)}
  .pr .mk{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block}
  .pr .mk.y{background:var(--grn)}.pr .mk.p{background:#d39a2e}.pr .mk.n{background:var(--line2)}
  .pr .cmp-note{font-size:11.5px;color:var(--muted);margin-top:14px;max-width:66ch;display:flex;flex-wrap:wrap;align-items:center;gap:4px 5px}
  .pr .edge{margin-top:16px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--viz);border-radius:14px;padding:16px 18px}
  .pr .edge-h{display:flex;align-items:center;gap:9px;font-weight:750;font-size:14.5px;color:var(--ink)}
  .pr .edge-h .ic{font-size:17px;color:var(--vizDk);flex:none}
  .pr .edge p{color:var(--sub);font-size:13.5px;margin:9px 0 0;line-height:1.5;max-width:68ch}
  .pr .edge b{color:var(--vizDk)}
  .pr .stats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-top:24px}
  .pr .stats div{background:var(--card);padding:20px}
  .pr .stats .n{font-size:33px;font-weight:850;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  .pr .stats .n .u{font-size:15px;color:var(--viz)}
  .pr .stats .l{font-size:12.5px;color:var(--muted);margin-top:2px}
  .pr .toggle{display:inline-flex;background:var(--paper2);border:1px solid var(--line);border-radius:12px;padding:4px;margin-top:16px}
  .pr .toggle button{border:0;background:transparent;color:var(--muted);font-weight:700;font-size:14px;padding:10px 16px;border-radius:9px;cursor:pointer;min-height:44px;font-family:inherit}
  .pr .toggle button.sel{background:var(--card);color:var(--ink);box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .pr .plans{display:grid;grid-template-columns:1fr;gap:14px;margin-top:22px}
  .pr .plan{background:var(--card);border:1.5px solid var(--line);border-radius:20px;padding:24px;position:relative;display:flex;flex-direction:column}
  .pr .plan.pop{border-color:var(--grn);border-width:2px;box-shadow:0 14px 40px -18px rgba(84,97,58,.45)}
  .pr .plan .flag{position:absolute;top:-12px;left:22px;font-family:var(--mono);font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#fff;background:var(--grn);padding:5px 11px;border-radius:7px;display:inline-flex;gap:5px;align-items:center}
  .pr .plan h3{font-size:23px;font-weight:850}
  .pr .plan .tl{color:var(--muted);font-size:13.5px;margin-top:3px;min-height:2.6em}
  .pr .price{display:flex;align-items:baseline;gap:3px;margin:14px 0 2px}
  .pr .price .d{font-size:22px;font-weight:750;align-self:flex-start;margin-top:8px}
  .pr .price .v{font-size:52px;font-weight:850;letter-spacing:-.035em;line-height:1;font-variant-numeric:tabular-nums}
  .pr .price .per{color:var(--muted);font-size:15px}
  .pr .yr{font-family:var(--mono);font-size:12px;color:var(--muted);min-height:1.3em}
  .pr .plan ul{list-style:none;padding:0;margin:18px 0 22px;display:flex;flex-direction:column;gap:11px}
  .pr .plan li{display:flex;gap:10px;font-size:14.5px;align-items:flex-start}
  .pr .plan li .ic{font-size:17px;color:var(--grn);flex:none;margin-top:2px}
  .pr .plan li.grp{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:4px}
  .pr .plan .btn{width:100%;margin-top:auto}
  .pr .import{text-align:center;margin-top:16px;font-size:14px;color:var(--muted)}
  .pr .import b{color:var(--grnDk)}
  .pr .final{background:var(--night);color:#f4efe3;border-radius:26px;padding:44px 24px;text-align:center;position:relative;overflow:hidden;margin-top:20px}
  .pr .final::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;background:radial-gradient(120% 90% at 50% 0%,rgba(242,106,18,.16),transparent 55%),radial-gradient(rgba(255,255,255,.05) .6px,transparent .6px);background-size:auto,20px 20px}
  .pr .final h2{font-size:clamp(28px,6.6vw,46px);font-weight:850;line-height:1.05;max-width:18ch;margin:14px auto 0}
  .pr .final p{color:#d7d3c4;font-size:16px;margin:14px auto 0;max-width:42ch}
  .pr .final .cta-row{display:flex;flex-direction:column;gap:12px;margin-top:26px}
  .pr .final .cta-row .btn{width:100%}
  .pr footer{border-top:1px solid var(--line);margin-top:44px}
  .pr footer .bar{height:auto;padding:22px 0 44px;flex-wrap:wrap;gap:14px;color:var(--muted);font-size:13px}
  .pr footer .links{display:flex;gap:18px}
  .pr .sticky{position:fixed;left:0;right:0;bottom:0;z-index:60;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(244,239,227,.9);backdrop-filter:blur(10px);border-top:1px solid var(--line);transform:translateY(120%);transition:transform .3s ease}
  .pr .sticky.show{transform:none}
  .pr .sticky .btn{width:100%}
  .pr .spacer{height:78px}
  .pr .rv{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
  .pr .rv.in{opacity:1;transform:none}
  @media(min-width:720px){
    .pr .hero .cta-row{flex-direction:row}.pr .hero .cta-row .btn{width:auto}
    .pr .flow{grid-template-columns:1fr 1fr}
    .pr .crewgrid{grid-template-columns:1fr 1fr}
    .pr .cmpgrid{grid-template-columns:1fr 1fr}
    .pr .stats{grid-template-columns:repeat(4,1fr)}
    .pr .plans{grid-template-columns:repeat(3,1fr);align-items:stretch}
    .pr .final .cta-row{flex-direction:row;justify-content:center}.pr .final .cta-row .btn{width:auto}
    .pr .sticky{display:none}.pr .spacer{display:none}
    .pr .term .res{flex-direction:row;flex-wrap:wrap}.pr .term .row{flex:1 1 260px}
  }
  @media(min-width:900px){
    .pr .hero-grid{grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:38px;align-items:center}
    .pr .hero-panel{display:block}
    .pr .crewstrip{display:none}
  }
  @media(min-width:820px){ .pr .agstage{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch} }
  @media(min-width:620px){ .pr .stack-grid{grid-template-columns:repeat(3,1fr)} .pr .onlyus{grid-template-columns:1fr 1fr} }
  @media(max-width:560px){ .pr .hd-share .shl{display:none} .pr .hd-share{padding:8px 10px} }
  @media(min-width:980px){ .pr .hero .wrap{padding:64px 20px 54px} .pr .flow{grid-template-columns:repeat(4,1fr)} }
  @media(prefers-reduced-motion:reduce){ .pr .rv,.pr .chip,.pr .hp-dot,.pr .hp-row,.pr .agstage,.pr .hero h1 .hl::after,.pr .term .q .cur{transition:none;animation:none;opacity:1;transform:none}.pr .hero h1 .hl::after{--draw:1}.pr .mrr-bar{animation:none} }
`

function Icon({ id, style }) {
  return <svg className="ic" style={style}><use href={`#${id}`} /></svg>
}

export default function Pricing() {
  const navigate = useNavigate()
  const company = useStore((s) => s.company)
  const rootRef = useRef(null)
  const heroRef = useRef(null)
  const [per, setPer] = useState('mo')
  const [lit, setLit] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [feed, setFeed] = useState(() => ACTIVITY.slice(0, 5).map((a, i) => ({ ...a, _k: i })))
  const [ag, setAg] = useState(0)
  const [agLock, setAgLock] = useState(false)
  const [shared, setShared] = useState(false)

  const goSignup = (planId) => navigate(`/login?signup=1&plan=${planId}`)
  const toPlans = () => document.getElementById('pr-plans')?.scrollIntoView({ behavior: 'smooth' })
  const shareNow = async () => {
    const url = (typeof window !== 'undefined' ? window.location.origin : 'https://jobscout.appsannex.com') + '/pricing'
    try {
      if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ title: 'JobScout — the business operating system', text: 'One system for the whole operation, running on AI. Take a look:', url }); return }
    } catch { /* user cancelled the share sheet — fall through to copy */ }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000) } catch { /* clipboard blocked */ }
  }

  // Reveal-on-scroll + hero underline draw + mobile sticky CTA.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches
    const rvs = rootRef.current ? Array.from(rootRef.current.querySelectorAll('.rv')) : []
    let io
    if ('IntersectionObserver' in window && !reduce) {
      io = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      }), { threshold: 0.12 })
      rvs.forEach((el) => io.observe(el))
    } else {
      rvs.forEach((el) => el.classList.add('in'))
    }
    const raf = requestAnimationFrame(() => setLit(true))
    let hio
    if ('IntersectionObserver' in window && heroRef.current) {
      hio = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { threshold: 0 })
      hio.observe(heroRef.current)
    }
    return () => { io && io.disconnect(); hio && hio.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  // Live hero feed — a new bit of "work" slides in on top every few seconds.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return
    let i = 5
    const t = setInterval(() => {
      setFeed((prev) => [{ ...ACTIVITY[i % ACTIVITY.length], _k: i++ }, ...prev.slice(0, 4)])
    }, 2800)
    return () => clearInterval(t)
  }, [])

  // Agent showcase — auto-advances until the visitor takes the wheel.
  useEffect(() => {
    if (agLock || window.matchMedia('(prefers-reduced-motion:reduce)').matches) return
    const t = setInterval(() => setAg((a) => (a + 1) % CREW.length), 4200)
    return () => clearInterval(t)
  }, [agLock])

  return (
    <div className="pr" ref={rootRef}>
      <style>{CSS}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></symbol>
        <symbol id="i-quote" viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></symbol>
        <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></symbol>
        <symbol id="i-wrench" viewBox="0 0 24 24"><path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 13l-8 8-2-2 1.9-6.9a3.5 3.5 0 0 1 1.6-1.6z" /><path d="M5 21l4-4" /></symbol>
        <symbol id="i-dollar" viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></symbol>
        <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></symbol>
        <symbol id="i-truck" viewBox="0 0 24 24"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M15 20a6 6 0 0 1 6-2" /></symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z" /><path d="M4 5v14" /></symbol>
        <symbol id="i-building" viewBox="0 0 24 24"><path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M8 7h3M8 11h3M8 15h3" /></symbol>
        <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" /></symbol>
        <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.8 6.6 20l1-6.1L3.2 9.5l6.1-.9z" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
        <symbol id="i-share" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></symbol>
        <symbol id="i-repeat" viewBox="0 0 24 24"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></symbol>
        <symbol id="i-box" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7L12 12l8.7-5" /><path d="M12 22V12" /></symbol>
      </defs></svg>

      <header>
        <div className="wrap bar">
          <div className="logo"><img alt="JobScout" style={{ height: 34, width: 'auto', display: 'block' }} src="/Scout_LOGO_GUY.png" />JobScout</div>
          <div className="hd-right">
            {company
              ? <span className="hd-link" onClick={() => navigate('/')}>Back to app</span>
              : <span className="hd-link" onClick={() => navigate('/login')}>Sign in</span>}
            <button className={`hd-share${shared ? ' done' : ''}`} onClick={shareNow} aria-label="Share this page">
              <Icon id={shared ? 'i-check' : 'i-share'} /><span className="shl">{shared ? 'Copied!' : 'Share'}</span>
            </button>
            <button className="btn btn-viz hd-cta" onClick={toPlans}>Start free</button>
          </div>
        </div>
      </header>

      <main>
        <section className={`hero${lit ? ' lit' : ''}`} ref={heroRef} style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="hero-grid">
              <div className="hero-left">
                <span className="eb on-dark"><Icon id="i-bolt" style={{ fontSize: 13 }} /> The business operating system, built by the people who do the work</span>
                <h1>Burn the status quo. Welcome to <span className="hl">the AI age</span>.</h1>
                <p className="lede">One system for the entire operation — sales, jobs, invoicing, books, payroll — running on AI with enough compute to handle your whole back office while you’re out doing the work. Not a CRM. Not another app to babysit. A business operating system so far ahead it makes whatever you’re running now look like a museum piece — and it’s going to blow your freaking mind.</p>
                <div className="cta-row">
                  <button className="btn btn-viz" onClick={toPlans}>Start free — 30 days <Icon id="i-arrow" /></button>
                  <button className="btn btn-ghost on-dark" onClick={() => navigate('/login?demo=1')}>Try the live demo <Icon id="i-arrow" /></button>
                </div>
                <a href="#pr-compare" style={{ display: 'inline-block', marginTop: 14, fontSize: 14, color: '#bcc0ad', textDecoration: 'underline', textUnderlineOffset: 3 }}>or see how it compares →</a>
                <div className="trust">
                  <span><Icon id="i-check" /> Live in an afternoon</span>
                  <span><Icon id="i-check" /> No consultants, no six-month rollout</span>
                  <span><Icon id="i-check" /> Runs offline in the field</span>
                </div>
              </div>
              <aside className="hero-panel" aria-hidden="true">
                <div className="hp-head"><span className="hp-dot" /> Live · your crew on the clock</div>
                <div className="hp-feed">
                  {feed.map((a) => (
                    <div key={a._k} className="hp-row">
                      <span className={`hp-av${a.free ? ' free' : ''}`}>{a.ab}</span>
                      <span className="hp-txt"><b>{a.name}</b> {a.msg}</span>
                      {a.meta && <span className="hp-meta">{a.meta}</span>}
                    </div>
                  ))}
                </div>
              </aside>
            </div>
            <div className="crewstrip">
              <span className="lbl">Your AI workforce, on the clock →</span>
              {CREW.map((a, i) => <span key={a.ab} className="chip" style={{ animationDelay: `${120 + i * 90}ms` }}>{a.ab}</span>)}
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">One truck or a hundred</span>
              <h2>It scales without turning into Salesforce.</h2>
              <p>The same platform runs a solo operator and a multi-location company — sophisticated where you need it, simple where you don’t. Landscaping, lighting &amp; energy, cleaning, pest control, HVAC, security, home services, and the trades.</p>
            </div>
            <div className="forwho rv">
              <span className="who"><Icon id="i-users" /> <b>Owner-operators</b> &amp; small crews</span>
              <span className="who"><Icon id="i-building" /> <b>Established shops</b>, 5–50 on payroll</span>
              <span className="who"><Icon id="i-layers" /> <b>Multi-crew, multi-location</b> operations</span>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">One flow, from first touch to paid in full</span>
              <h2>The whole job, start to finish.</h2>
              <p>Not five apps stitched together — one system that follows the work.</p>
            </div>
            <div className="flow">
              <div className="step rv"><Icon id="i-quote" /><h3>Quote it</h3><p>Build a priced proposal on site, send a link, capture an e-signature from their phone.</p><div className="was">replaces <b>DocuSign, Jobber estimates</b></div></div>
              <div className="step rv"><Icon id="i-cal" /><h3>Schedule it</h3><p>Dispatch crews to jobs and days, optimize routes, and track a GPS time clock.</p><div className="was">replaces <b>Calendly, When I Work</b></div></div>
              <div className="step rv"><Icon id="i-wrench" /><h3>Run the work</h3><p>Photos, checklists, and signatures from the field — fully offline, synced when you’re back on signal.</p><div className="was">replaces <b>CompanyCam</b></div></div>
              <div className="step rv"><Icon id="i-dollar" /><h3>Get paid</h3><p>Invoice with a pay link, take card or ACH, and reconcile it against the bank automatically.</p><div className="was">replaces <b>QuickBooks invoicing</b></div></div>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="prospect rv">
              <span className="eb on-dark"><Icon id="i-search" style={{ fontSize: 13 }} /> AI lead generation, built in</span>
              <h3>Describe your next customer. The AI goes and finds them.</h3>
              <p className="say">Your setters type a plain-English target. JobScout researches the live web, returns real companies with cited sources, reveals contacts, and bulk-imports them straight to the pipeline — no data broker, no spreadsheet.</p>
              <div className="term">
                <div className="top"><i /><i /><i /><span style={{ color: '#6b7160', marginLeft: 6 }}>prospect-scout</span></div>
                <div className="q">&gt; find HOA-managed communities over 150 units in Maricopa County<span className="cur" /></div>
                <div className="res">
                  <div className="row"><span>Sunland Village HOA · 220 units · Mesa AZ</span><span className="cited"><Icon id="i-check" style={{ fontSize: 11 }} /> sourced</span></div>
                  <div className="row"><span>Ironwood Community Assn · 340 units · Gilbert AZ</span><span className="cited"><Icon id="i-check" style={{ fontSize: 11 }} /> sourced</span></div>
                </div>
              </div>
              <div className="repl">replaces <b>Apollo.io, ZoomInfo, Lusha</b> — and the prospecting agency.</div>
              <div className="repl" style={{ marginTop: 6 }}>Free on every plan to start. <b>Prospecting Pro</b> scales it to 50 searches + 200 enrichments a month — $49/mo, shared across your team.</div>
            </div>
          </div>
        </section>

        <section id="pr-crew">
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">The part the others don’t have</span>
              <h2>An AI workforce, not another dashboard.</h2>
              <p>Eight specialists, each owning a real job — included in your plan, not billed by the seat. Tap one and watch it work.</p>
            </div>
            <div className="agshow rv">
              <div className="agrail" role="tablist" aria-label="AI specialists">
                {CREW.map((a, i) => (
                  <button key={a.ab} type="button" role="tab" aria-selected={i === ag}
                    className={`agpick${i === ag ? ' on' : ''}${a.free ? ' free' : ''}`}
                    onClick={() => { setAg(i); setAgLock(true) }}>
                    <span className="ab">{a.ab}</span>
                    <span className="pn">{a.name.replace('OG ', '')}</span>
                  </button>
                ))}
              </div>
              {(() => {
                const a = CREW[ag]
                return (
                  <div className="agstage" key={a.ab} onMouseEnter={() => setAgLock(true)}>
                    <div className="agid">
                      <div className="agtop">
                        <div className={`agav${a.free ? ' free' : ''}`}>{a.ab}</div>
                        <div>
                          <h3>{a.name}{a.free && <span className="tag">Free · every plan</span>}</h3>
                          <div className="role">{a.role}</div>
                        </div>
                      </div>
                      <p className="aghook">{a.hook}</p>
                      <ul className="aghi">
                        {a.hi.map((h, i) => <li key={i}><Icon id="i-check" />{h}</li>)}
                      </ul>
                      <div className="agrep"><span className="rl">Cancel</span>{a.rep.join(' · ')}</div>
                    </div>
                    <div className="agout">
                      <div className="agout-top"><i /><i /><i /><span className="ot">{a.name.replace('OG ', '').toLowerCase()} · working</span></div>
                      <div className="agout-body">
                        <div className="agout-kick"><span className={`agout-av${a.free ? ' free' : ''}`}>{a.ab}</span>{a.name.replace('OG ', '')} {a.out.kicker}</div>
                        <div className="agout-head">{a.out.head}</div>
                        {a.out.rows.map((r, i) => <div key={i} className="agout-row">{r}</div>)}
                        <div className="agout-done">{a.out.done}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="coming rv">
              <span className="lbl">12 more trade specialists rolling out</span>
              <div className="pills">{COMING.map((c) => <span key={c}>{c}</span>)}</div>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="recur rv">
              <span className="eb"><Icon id="i-repeat" style={{ fontSize: 13 }} /> Recurring revenue, built in</span>
              <h3>Sell it once. Get paid every month.</h3>
              <p className="say">Build membership plans, enroll your customers, and JobScout auto-schedules the visits and bills the card on repeat — monthly, quarterly, or yearly. Predictable income you never re-sell, and the number that makes your business worth more the day you decide to sell it.</p>
              <div className="recur-grid">
                <div className="planc">
                  <div className="planc-top"><span className="nm">Comfort Club</span><span className="mo"><b>$39</b>/mo</span></div>
                  <ul>
                    <li><Icon id="i-check" /> Two seasonal tune-ups</li>
                    <li><Icon id="i-check" /> Priority scheduling</li>
                    <li><Icon id="i-check" /> 15% off every repair</li>
                    <li><Icon id="i-check" /> Waived trip fee</li>
                  </ul>
                  <div className="memb"><Icon id="i-users" /> <b>72 members</b> enrolled · auto-renews</div>
                </div>
                <div className="mrr">
                  <div className="mlbl">Monthly recurring revenue</div>
                  <div className="mval">$3,100<span className="u"> /mo</span></div>
                  <div className="mrr-bars" aria-hidden="true">
                    {MRR_BARS.map((h, i) => <span key={i} className="mrr-bar" style={{ '--h': h, animationDelay: `${i * 70}ms` }} />)}
                  </div>
                  <div className="mcap"><Icon id="i-check" /> bills again next month — on its own</div>
                </div>
              </div>
              <div className="repl">replaces <b>ServiceTitan memberships, Jobber recurring</b> — and the feast-or-famine month.</div>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">One system, not a stack of subscriptions</span>
              <h2>Everything the office needs. In your pocket.</h2>
              <p>The sophisticated back office a growing company actually runs on — native, in one login.</p>
            </div>
            <div className="oneapp rv">
              <div className="jobrow"><Icon id="i-search" /><div><h3>Source &amp; win the work</h3><p>AI prospecting, leads, pipeline, instant quotes, e-signatures, a customer portal.</p><div className="bye">replaces <b>Apollo, ZoomInfo, HubSpot, DocuSign</b></div></div></div>
              <div className="jobrow"><Icon id="i-repeat" /><div><h3>Recurring revenue on autopilot</h3><p>Sell service plans &amp; memberships — members get priority scheduling and member pricing, the visits schedule themselves, and the card bills monthly, quarterly, or yearly. The recurring revenue that makes a business worth buying.</p><div className="bye">replaces <b>ServiceTitan memberships, Jobber recurring</b></div></div></div>
              <div className="jobrow"><Icon id="i-cal" /><div><h3>Run the operation</h3><p>Scheduling, dispatch board, route optimization, GPS time clock.</p><div className="bye">replaces <b>ServiceTitan dispatch, When I Work</b></div></div></div>
              <div className="jobrow"><Icon id="i-dollar" /><div><h3>Bill, collect &amp; keep the books</h3><p>Invoices with pay links, card + ACH, bank sync, expenses, a real P&amp;L and job costing.</p><div className="bye">replaces <b>QuickBooks, Expensify</b></div></div></div>
              <div className="jobrow"><Icon id="i-box" /><div><h3>Order materials &amp; pay vendors</h3><p>Turn a job’s parts list into purchase orders, send them to your suppliers, receive against them, and track the vendor bills — the whole accounts-payable side, not just the money coming in.</p><div className="bye">replaces <b>QuickBooks A/P, ServiceTitan procurement</b></div></div></div>
              <div className="jobrow"><Icon id="i-book" /><div><h3>Real payroll — not a hand-off</h3><p>The field-service apps stop at invoicing and pass payroll to Gusto. JobScout runs it: every paycheck &amp; tax to the penny (IRS Pub 15-T), your 941s, W-2s and 1099s filed, direct deposit, plus mobile onboarding with W-4s and I-9s.</p><div className="bye">replaces <b>Gusto, ADP, BambooHR</b></div></div></div>
              <div className="jobrow"><Icon id="i-truck" /><div><h3>Fleet &amp; assets</h3><p>Real-time vehicle tracking (WatchDog GPS), fuel logs, and maintenance — one place.</p><div className="bye">replaces <b>Fleetio, Samsara</b></div></div></div>
              <div className="jobrow"><Icon id="i-layers" /><div><h3>Run the company</h3><p>Owner dashboards and reporting, plus a built-in operating rhythm — quarterly priorities, a weekly scorecard, and structured leadership meetings (the EOS / “Traction” system, no extra app).</p><div className="bye">replaces <b>Ninety.io, Tableau</b></div></div></div>
            </div>
            <div className="stack rv">
              <span className="kicker">Do the math</span>
              <h3 className="stack-h">The stack you’re renting — canceled.</h3>
              <div className="stack-grid">
                {STACK.map((t) => (
                  <div key={t.name} className="stk"><span className="stk-n">{t.name}</span><span className="stk-c">~${t.cost}/mo</span></div>
                ))}
              </div>
              <div className="stack-total">
                <div className="tot">≈ <b>${STACK_TOTAL}/mo</b> across {STACK.length} tools &amp; {STACK.length} logins</div>
                <div className="stack-arrow"><Icon id="i-arrow" style={{ transform: 'rotate(90deg)', fontSize: 22 }} /></div>
                <div className="stack-js">JobScout — <b>one login, one bill</b>, from $99/mo</div>
                <div className="stack-save">≈ ${STACK_SAVE.toLocaleString()} saved a year</div>
              </div>
              <p className="stack-note">Typical small-business pricing — your stack is probably longer. Names are trademarks of their owners.</p>
            </div>
          </div>
        </section>

        <section id="pr-compare">
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">The honest comparison</span>
              <h2>Where JobScout fits.</h2>
              <p>Field-service apps schedule and invoice — then you bolt on accounting, payroll, a CRM, fleet, and marketing. Enterprise suites <b>match the breadth</b>, but at enterprise prices and a months-long rollout with a consultant on the payroll. JobScout hands you the whole operation — plus an AI workforce and AI prospecting the others don’t have — live in an afternoon, priced for a company that’s still growing.</p>
            </div>
            <div className="onlyus rv">
              <div className="ou">
                <Icon id="i-bolt" style={{ fontSize: 26, color: 'var(--viz)' }} />
                <h3>An AI workforce</h3>
                <p>Eight specialists doing real work — prospecting, quoting, verifying, collecting. The part no field app or enterprise suite hands you.</p>
                <span className="ou-tag">Only in JobScout</span>
              </div>
              <div className="ou">
                <Icon id="i-layers" style={{ fontSize: 26, color: 'var(--viz)' }} />
                <h3>One login · one bill</h3>
                <p>The whole operation in one system — not a dozen tools duct-taped together with integrations you babysit.</p>
                <span className="ou-tag">Only in JobScout</span>
              </div>
            </div>
            <div className="leg rv">
              <span><b>Field-service apps</b> · Jobber, HousecallPro</span>
              <span><b>Enterprise suites</b> · ServiceTitan, Salesforce</span>
              <span><b>DIY stack</b> · QuickBooks + Gusto + …</span>
            </div>
            <p className="cmp-frame rv">Every capability below ships <b>inside JobScout</b>. Here’s how the alternatives stack up.</p>
            <div className="cmpgrid">
              {CMP_ROWS.map((r, ri) => (
                <div key={ri} className="cmpcard rv">
                  <div className="cap"><span className="ck"><Icon id="i-check" /></span><span>{r[0]}</span></div>
                  <div className="others"><span className="olbl">OTHERS</span>
                    {r.slice(2).map((v, i) => <span key={i} className="o"><i className={`mk ${mk(v)}`} />{CMP_OTHERS[i]}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="edge rv">
              <div className="edge-h"><Icon id="i-bolt" /> Straight talk — where the big suites still edge us</div>
              <p>A short list of things the enterprise platforms have that we don’t <b>yet</b>: consumer financing at checkout, built-in call recording &amp; IVR telephony, and a third-party app marketplace. All on the roadmap. What none of them hands you is the AI workforce — and that’s the part that’s hard to copy.</p>
            </div>
            <p className="cmp-note"><i className="mk y" /> included &nbsp;<i className="mk p" /> partial / add-on &nbsp;<i className="mk n" /> not native &nbsp;— reflects one subscription vs. integrations or higher tiers. Names are trademarks of their owners.</p>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="stats rv">
              <div><div className="n">134</div><div className="l">features, shipped</div></div>
              <div><div className="n">8<span className="u">+12</span></div><div className="l">AI specialists</div></div>
              <div><div className="n">14</div><div className="l">systems, one login</div></div>
              <div><div className="n">0<span className="u">bars</span></div><div className="l">and it still runs</div></div>
            </div>
          </div>
        </section>

        <section id="pr-plans">
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">Straight pricing, no per-seat games</span>
              <h2>Plans that scale with the operation.</h2>
              <div className="toggle" role="tablist">
                <button className={per === 'mo' ? 'sel' : ''} onClick={() => setPer('mo')}>Monthly</button>
                <button className={per === 'yr' ? 'sel' : ''} onClick={() => setPer('yr')}>Annual · 2 months free</button>
              </div>
            </div>
            <div className="plans">
              {PLANS.map((p) => {
                const m = per === 'yr' ? Math.round(p.yr / 12) : p.mo
                return (
                  <div key={p.id} className={`plan rv${p.pop ? ' pop' : ''}`}>
                    {p.pop && <span className="flag"><Icon id="i-star" style={{ fontSize: 11 }} /> Most popular</span>}
                    <h3>{p.name}</h3>
                    <div className="tl">{p.tl}</div>
                    <div className="price"><span className="d">$</span><span className="v">{m}</span><span className="per">/mo</span></div>
                    <div className="yr">{per === 'yr' ? `$${p.yr.toLocaleString()} billed yearly` : ' '}</div>
                    <ul>
                      <li><Icon id="i-check" /><b>{p.users}</b></li>
                      <li><Icon id="i-check" /><b>{p.agents}</b> + Arnie free</li>
                      {p.feats.map((f, i) => f.startsWith('grp:')
                        ? <li key={i} className="grp">{f.slice(4)}</li>
                        : <li key={i}><Icon id="i-check" />{f}</li>)}
                    </ul>
                    <button className={`btn ${p.pop ? 'btn-viz' : 'btn-grn'}`} onClick={() => goSignup(p.id)}>Start 30-day trial</button>
                  </div>
                )
              })}
            </div>
            <p className="import rv" style={{ marginTop: 10 }}>Every plan includes free AI prospecting. Need volume? <b>Prospecting Pro</b> — 50 searches + 200 enrichments a month, shared across your team — <b>$49/mo</b>.</p>
            <p className="import rv">Migrating from HousecallPro? <b>One-click import</b> brings customers, jobs, and invoices across with full history.</p>
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="final rv">
              <span className="eb on-dark">Free for 30 days · No card · Cancel anytime</span>
              <h2>Get the paperwork off your plate. Keep the parts you love.</h2>
              <p>Set it up this afternoon, import your customers in one click, and let the robots take the busywork. Cancel anytime — though something tells me you won’t miss the data entry.</p>
              <div className="cta-row">
                <button className="btn btn-viz" onClick={toPlans}>Start your free trial <Icon id="i-arrow" /></button>
                <button className="btn btn-ghost on-dark" onClick={() => navigate('/login?demo=1')}>Try the live demo <Icon id="i-arrow" /></button>
              </div>
              <button className="fshare" onClick={shareNow}>{shared ? '✓ Link copied to your clipboard' : 'Know someone buried in software? Send them this →'}</button>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap bar">
          <div className="logo" style={{ fontSize: 17 }}><img alt="JobScout" style={{ height: 28, width: 'auto', display: 'block' }} src="/Scout_LOGO_GUY.png" />JobScout</div>
          <div className="links">
            <a href="#pr-compare">Compare</a>
            <a href="#pr-plans">Plans</a>
            <a href="#pr-crew">AI</a>
            <span style={{ cursor: 'pointer' }} onClick={() => navigate('/login')}>Sign in</span>
          </div>
        </div>
      </footer>

      <div className="spacer" />
      <div className={`sticky${showSticky ? ' show' : ''}`}>
        <button className="btn btn-viz" onClick={toPlans}>Start free — 30 days <Icon id="i-arrow" /></button>
      </div>
    </div>
  )
}
