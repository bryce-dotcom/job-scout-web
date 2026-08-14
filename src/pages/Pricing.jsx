// Public storefront + "Sign Up a Customer" page (route: /pricing, no auth).
//
// The live version of the marketing storefront we perfected: elevated hero
// ("AI workforce"), who-it's-for, the whole-job workflow, AI-prospecting
// spotlight, the real 7-agent crew, one-app consolidation, an honest no-swipe
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
  { ab: 'AR', name: 'OG Arnie', free: true, role: 'Your right hand', ds: 'Ask anything about your business in plain English. Admins can also have him configure settings and fix data — he proposes each change for approval and logs it, so nothing changes without an admin’s green light.' },
  { ab: 'ZA', name: 'Zach', role: 'Landscaping', ds: 'Measures a property from aerial imagery and returns a priced quote to the customer — before a truck rolls.' },
  { ab: 'LE', name: 'Lenard', role: 'Lighting & energy', ds: 'Identifies fixtures from a photo, counts them, and calculates the exact utility rebate for a turnkey LED proposal.' },
  { ab: 'FR', name: 'Frankie', role: 'The AI CFO', ds: 'Tracks AR/AP aging, flags expense anomalies, runs job profitability, and automates collections — the CFO you don’t have to hire.' },
  { ab: 'FD', name: 'Freddy', role: 'Fleet ops', ds: 'Tracks vehicles in real time through your WatchDog GPS, schedules maintenance, logs fuel, and scores drivers — the whole fleet in one place.' },
  { ab: 'VI', name: 'Victor', role: 'Quality control', ds: 'Scores completed work against the checklist from job-site photos and issues a verification report before you invoice.' },
  { ab: 'CO', name: 'Conrad', role: 'Marketing', ds: 'Writes and schedules the campaigns and win-back sequences that keep the pipeline full, synced to your email platform.' },
]
const COMING = ['Plumbing', 'HVAC', 'Roofing', 'Electrical', 'Painting', 'Masonry', 'Flooring', 'Windows', 'Cleaning', 'Gutters', 'Excavation', 'Safety']

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
  .pr .hero h1 .hl{position:relative;color:#fff;white-space:nowrap}
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
  .pr .crewgrid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:24px}
  .pr .agent{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;gap:14px;align-items:flex-start}
  .pr .agent .av{width:50px;height:50px;flex:none;border-radius:14px;display:grid;place-items:center;font-family:var(--mono);font-weight:750;font-size:16px;background:var(--grn);color:#fff}
  .pr .agent.free .av{background:var(--viz)}
  .pr .agent h3{font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .pr .tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;padding:3px 7px;border-radius:6px;background:var(--vizBg);color:var(--vizDk)}
  .pr .agent .role{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--grnDk);margin-top:3px}
  .pr .agent p{color:var(--sub);font-size:14.5px;margin:8px 0 0;line-height:1.45}
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
  @media(min-width:980px){ .pr .hero .wrap{padding:64px 20px 54px} .pr .flow{grid-template-columns:repeat(4,1fr)} }
  @media(prefers-reduced-motion:reduce){ .pr .rv,.pr .chip,.pr .hero h1 .hl::after,.pr .term .q .cur{transition:none;animation:none;opacity:1;transform:none}.pr .hero h1 .hl::after{--draw:1} }
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

  const goSignup = (planId) => navigate(`/login?signup=1&plan=${planId}`)
  const toPlans = () => document.getElementById('pr-plans')?.scrollIntoView({ behavior: 'smooth' })

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
      </defs></svg>

      <header>
        <div className="wrap bar">
          <div className="logo"><img alt="JobScout" style={{ height: 34, width: 'auto', display: 'block' }} src="/Scout_LOGO_GUY.png" />JobScout</div>
          <div className="hd-right">
            {company
              ? <span className="hd-link" onClick={() => navigate('/')}>Back to app</span>
              : <span className="hd-link" onClick={() => navigate('/login')}>Sign in</span>}
            <button className="btn btn-viz hd-cta" onClick={toPlans}>Start free</button>
          </div>
        </div>
      </header>

      <main>
        <section className={`hero${lit ? ' lit' : ''}`} ref={heroRef} style={{ paddingTop: 0 }}>
          <div className="wrap">
            <span className="eb on-dark"><Icon id="i-bolt" style={{ fontSize: 13 }} /> The business operating system, built by the people who do the work</span>
            <h1>F**k the status quo. Welcome to <span className="hl">the AI age</span>.</h1>
            <p className="lede">One system for the entire operation — sales, jobs, invoicing, books, payroll — running on AI with enough compute to handle your whole back office while you’re out doing the work. Not a CRM. Not another app to babysit. A business operating system so far ahead it makes whatever you’re running now look like a museum piece — and it’s going to blow your freaking mind.</p>
            <div className="cta-row">
              <button className="btn btn-viz" onClick={toPlans}>Start free — 30 days <Icon id="i-arrow" /></button>
              <a className="btn btn-ghost on-dark" href="#pr-compare">See how it compares</a>
            </div>
            <div className="trust">
              <span><Icon id="i-check" /> Live in an afternoon</span>
              <span><Icon id="i-check" /> No consultants, no six-month rollout</span>
              <span><Icon id="i-check" /> Runs offline in the field</span>
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
            </div>
          </div>
        </section>

        <section id="pr-crew">
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">The part the others don’t have</span>
              <h2>An AI workforce, not another dashboard.</h2>
              <p>Each specialist owns a real job and does it autonomously — included in your plan, not billed by the seat. Plain-language in, finished work out.</p>
            </div>
            <div className="crewgrid">
              {CREW.map((a) => (
                <div key={a.ab} className={`agent rv${a.free ? ' free' : ''}`}>
                  <div className="av">{a.ab}</div>
                  <div>
                    <h3>{a.name}{a.free && <span className="tag">Free · every plan</span>}</h3>
                    <div className="role">{a.role}</div>
                    <p>{a.ds}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="coming rv">
              <span className="lbl">12 more trade specialists rolling out</span>
              <div className="pills">{COMING.map((c) => <span key={c}>{c}</span>)}</div>
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
              <div className="jobrow"><Icon id="i-cal" /><div><h3>Run the operation</h3><p>Scheduling, dispatch board, route optimization, GPS time clock.</p><div className="bye">replaces <b>ServiceTitan dispatch, When I Work</b></div></div></div>
              <div className="jobrow"><Icon id="i-dollar" /><div><h3>Bill, collect &amp; keep the books</h3><p>Invoices with pay links, card + ACH, bank sync, expenses, a real P&amp;L and job costing.</p><div className="bye">replaces <b>QuickBooks, Expensify</b></div></div></div>
              <div className="jobrow"><Icon id="i-book" /><div><h3>Payroll, HR &amp; compliance</h3><p>Calculates every paycheck and tax to the penny (IRS Pub 15-T), fills your 941s, W-2s and 1099s, and flags every deposit deadline — plus onboarding and I-9s.</p><div className="bye">replaces <b>Gusto, ADP, BambooHR</b></div></div></div>
              <div className="jobrow"><Icon id="i-truck" /><div><h3>Fleet &amp; assets</h3><p>Real-time vehicle tracking (WatchDog GPS), fuel logs, and maintenance — one place.</p><div className="bye">replaces <b>Fleetio, Samsara</b></div></div></div>
              <div className="jobrow"><Icon id="i-layers" /><div><h3>Run the company</h3><p>Owner dashboards and reporting, plus a built-in operating rhythm — quarterly priorities, a weekly scorecard, and structured leadership meetings (the EOS / “Traction” system, no extra app).</p><div className="bye">replaces <b>Ninety.io, Tableau</b></div></div></div>
            </div>
            <p className="savings rv"><b>134 features across 14 systems</b> — the stack it stands in for runs past <b>30 subscriptions</b>.</p>
          </div>
        </section>

        <section id="pr-compare">
          <div className="wrap">
            <div className="sechead rv">
              <span className="kicker">The honest comparison</span>
              <h2>Where JobScout fits.</h2>
              <p>Field-service apps schedule and invoice — then you bolt on accounting, payroll, a CRM, fleet, and marketing. Enterprise suites <b>match the breadth</b>, but at enterprise prices and a months-long rollout with a consultant on the payroll. JobScout hands you the whole operation — plus an AI workforce and AI prospecting the others don’t have — live in an afternoon, priced for a company that’s still growing.</p>
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
              <div><div className="n">7<span className="u">+12</span></div><div className="l">AI specialists</div></div>
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
                <a className="btn btn-ghost on-dark" href="#pr-compare">Compare the platforms</a>
              </div>
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
