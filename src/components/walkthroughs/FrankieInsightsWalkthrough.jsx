// Frankie Insights walkthrough — AI financial narrative, anomalies, margin trends, cashflow forecast.
// Source: src/lib/featureKnowledge/frankie-insights.js

import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, AlertTriangle, TrendingDown, TrendingUp, DollarSign, X, Search, ChevronRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/frankie-insights.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const A = '#22c55e'

const ANOMALIES = [
  { date: 'Jun 8', label: 'Job #041 labor cost 40% over estimate', severity: 'High',   icon: AlertTriangle },
  { date: 'Jun 7', label: 'Payroll run $2,800 higher than last month — 3 OT hours',    severity: 'Medium', icon: TrendingUp },
  { date: 'Jun 6', label: 'SRP invoice #181 not matched to payment',                   severity: 'Medium', icon: DollarSign },
  { date: 'Jun 5', label: 'Fuel cost spike — VEH-001',                                 severity: 'Low',    icon: AlertTriangle },
]

const SEVERITY = {
  High:   { bg: 'rgba(239,68,68,0.10)',    text: '#ef4444' },
  Medium: { bg: 'rgba(234,179,8,0.12)',    text: '#c28b38' },
  Low:    { bg: 'rgba(59,130,246,0.10)',   text: '#3b82f6' },
}

const MARGIN_WEEKS = [
  { week: 'Mar 24', pct: 36.2 },
  { week: 'Mar 31', pct: 34.8 },
  { week: 'Apr 7',  pct: 33.1, dip: true },
  { week: 'Apr 14', pct: 35.5 },
  { week: 'Apr 21', pct: 37.0 },
  { week: 'Apr 28', pct: 36.1 },
  { week: 'May 5',  pct: 28.4, dip: true, note: 'materials spike' },
  { week: 'May 12', pct: 30.2, dip: true },
  { week: 'May 19', pct: 34.7 },
  { week: 'May 26', pct: 33.8, dip: true },
  { week: 'Jun 2',  pct: 32.9, dip: true },
  { week: 'Jun 9',  pct: 31.0, dip: true },
]

const TARGET_MARGIN = 35

const CASHFLOW_WEEKS = [
  { label: 'Jun 9–15',  inflow: 62000, outflow: 48000 },
  { label: 'Jun 16–22', inflow: 38000, outflow: 31000 },
  { label: 'Jun 23–29', inflow: 44000, outflow: 52000, flag: true },
  { label: 'Jun 30–Jul 6', inflow: 55000, outflow: 39000 },
]

const CASH_POSITION = [48000, 62000, 69000, 61000, 77000]

export default function FrankieInsightsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="CFO-level insights." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      <Header scene={scene} />
      {scene === 'narrative' && <NarrativeScene />}
      {scene === 'anomalies' && <AnomaliesScene />}
      {scene === 'margins'   && <MarginsScene />}
      {scene === 'cashflow'  && <CashflowScene />}
    </div>
  )
}

function Header({ scene }) {
  const titles = {
    narrative: 'Frankie Insights',
    anomalies: 'Frankie Insights — Anomalies',
    margins:   'Frankie Insights — Margin Trend',
    cashflow:  'Frankie Insights — Cashflow Forecast',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '7px', backgroundColor: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={13} style={{ color: A }} />
        </div>
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>{titles[scene] || 'Frankie Insights'}</span>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {['Narrative', 'Anomalies', 'Margins', 'Cashflow'].map(tab => {
          const key = tab.toLowerCase()
          const active = scene === key
          return (
            <span key={tab} style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: '600', backgroundColor: active ? A : T.accentBg, color: active ? '#fff' : T.textMuted, cursor: 'pointer' }}>{tab}</span>
          )
        })}
      </div>
    </div>
  )
}

function NarrativeScene() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', flexShrink: 0 }}>
        {[
          { label: 'Revenue',      value: '$47,200', delta: '+18%', up: true },
          { label: 'Gross Margin', value: '31%',     delta: '-1.2pt', up: false },
          { label: 'AR 60+ Days',  value: '$14k',    delta: '+$14k', up: false },
          { label: 'Cash Position',value: '$48k',    delta: 'comfortable', neutral: true },
        ].map(k => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '3px' }}>{k.label}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>{k.value}</div>
            <div style={{ fontSize: '9px', fontWeight: '600', color: k.neutral ? T.textMuted : k.up ? A : '#ef4444', marginTop: '2px' }}>{k.delta}</div>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '2px' }}>Week of Jun 9 — Frankie Summary</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Generated Jun 10, 2026 · 6:02 AM</div>
          </div>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={15} style={{ color: A }} />
          </div>
        </div>
        <div style={{ fontSize: '11px', color: T.text, lineHeight: '1.65', flex: 1, overflow: 'hidden' }}>
          Revenue was <strong>$47,200</strong> — 18% above last week, driven by 3 completed LED projects. Gross margin held at <strong>31%</strong>. Watch: AR over 60 days grew <strong>$14k</strong> — the Costco account needs a call. Action: <strong>$28k in vendor bills due this week</strong>; cash position comfortable at $48k.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {[
            { color: '#ef4444', label: 'Watch', msg: 'Costco account — AR 60+ day balance grew to $14k. Call recommended.' },
            { color: '#c28b38', label: 'Action', msg: '$28k vendor bills due this week. Cash at $48k — comfortable but monitor.' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 10px', backgroundColor: `${item.color}08`, border: `1px solid ${item.color}30`, borderRadius: '7px' }}>
              <span style={{ fontSize: '8px', fontWeight: '700', color: item.color, marginTop: '1px', flexShrink: 0, textTransform: 'uppercase' }}>{item.label}</span>
              <span style={{ fontSize: '9px', color: T.textSecondary, lineHeight: '1.5' }}>{item.msg}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function AnomaliesScene() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', color: T.textMuted }}>4 flagged items this week — sorted by severity</div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {['All', 'High', 'Medium', 'Low'].map((f, i) => (
            <span key={f} style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: i === 0 ? A : T.accentBg, color: i === 0 ? '#fff' : T.textMuted, cursor: 'pointer' }}>{f}</span>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
        {ANOMALIES.map((item, i) => {
          const s = SEVERITY[item.severity]
          const Icon = item.icon
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '7px', backgroundColor: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={13} style={{ color: s.text }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '2px' }}>{item.date}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '8px', fontWeight: '700', backgroundColor: s.bg, color: s.text }}>{item.severity}</span>
                <button style={{ padding: '4px 8px', borderRadius: '5px', border: `1px solid ${T.border}`, backgroundColor: 'transparent', color: T.textSecondary, fontSize: '8px', cursor: 'pointer' }}>Investigate</button>
                <button style={{ padding: '4px', borderRadius: '5px', border: 'none', backgroundColor: 'transparent', color: T.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={10} /></button>
              </div>
            </motion.div>
          )
        })}
      </div>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        style={{ padding: '8px 12px', backgroundColor: 'rgba(34,197,94,0.06)', border: `1px solid rgba(34,197,94,0.2)`, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <Sparkles size={11} style={{ color: A }} />
        <span style={{ fontSize: '9px', color: T.textSecondary, lineHeight: '1.5' }}>Frankie monitors transactions daily. Anomalies are flagged based on your historical patterns, not static rules.</span>
      </motion.div>
    </div>
  )
}

function MarginsScene() {
  const maxPct = 42
  const chartH = 90
  const weeks = MARGIN_WEEKS
  const w = 100 / weeks.length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', flexShrink: 0 }}>
        {[
          { label: 'Current Margin', value: '31.0%', color: '#ef4444' },
          { label: 'Target',         value: '35.0%', color: A },
          { label: '12-week Avg',    value: '33.6%', color: T.textSecondary },
        ].map(k => (
          <div key={k.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '3px' }}>{k.label}</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Gross Margin % — Last 12 Weeks</div>
        <div style={{ position: 'relative', height: `${chartH}px`, flexShrink: 0 }}>
          <svg width="100%" height={chartH} style={{ overflow: 'visible' }}>
            {/* Target reference line */}
            <line
              x1="0" y1={chartH - (TARGET_MARGIN / maxPct) * chartH}
              x2="100%" y2={chartH - (TARGET_MARGIN / maxPct) * chartH}
              stroke={A} strokeWidth="1" strokeDasharray="4 3" opacity="0.6"
            />
            <text x="2" y={chartH - (TARGET_MARGIN / maxPct) * chartH - 3} fontSize="7" fill={A} opacity="0.8">Target 35%</text>
            {/* Bars */}
            {weeks.map((wk, i) => {
              const barH = (wk.pct / maxPct) * chartH
              const x = `${i * w}%`
              const barW = `${w * 0.72}%`
              const color = wk.pct >= TARGET_MARGIN ? A : '#ef4444'
              return (
                <g key={i}>
                  <rect x={x} y={chartH - barH} width={barW} height={barH} fill={color} opacity="0.75" rx="2" />
                  {wk.note && (
                    <text x={`${i * w + w * 0.36}%`} y={chartH - barH - 4} fontSize="6" fill="#ef4444" textAnchor="middle">!</text>
                  )}
                </g>
              )
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {weeks.filter((_, i) => i % 3 === 0).map(wk => (
              <span key={wk.week} style={{ fontSize: '7px', color: T.textMuted }}>{wk.week}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', fontSize: '8px', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '8px', backgroundColor: A, borderRadius: '2px', opacity: 0.75, display: 'inline-block' }} /> Above target</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '8px', backgroundColor: '#ef4444', borderRadius: '2px', opacity: 0.75, display: 'inline-block' }} /> Below target</span>
        </div>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{ padding: '8px 10px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={11} style={{ color: A }} />
          <span style={{ fontSize: '9px', color: T.textSecondary, lineHeight: '1.5' }}>
            <strong style={{ color: T.text }}>Frankie:</strong> 3 of last 4 weeks below target — review your material markup. Week of May 5 shows a materials cost spike tied to the SRP project.
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}

function CashflowScene() {
  const maxVal = 70000
  const barH = 72

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', flexShrink: 0 }}>
        {CASHFLOW_WEEKS.map((wk, i) => {
          const net = wk.inflow - wk.outflow
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${wk.flag ? '#ef444440' : T.border}`, borderRadius: '8px', padding: '8px 9px', position: 'relative' }}>
              {wk.flag && <div style={{ position: 'absolute', top: '5px', right: '5px' }}><AlertTriangle size={9} style={{ color: '#ef4444' }} /></div>}
              <div style={{ fontSize: '8px', color: T.textMuted, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wk.label}</div>
              <div style={{ fontSize: '9px', color: A, fontWeight: '600' }}>In: ${(wk.inflow / 1000).toFixed(0)}k</div>
              <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600' }}>Out: ${(wk.outflow / 1000).toFixed(0)}k</div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: net >= 0 ? A : '#ef4444', marginTop: '3px' }}>{net >= 0 ? '+' : ''}{(net / 1000).toFixed(0)}k</div>
            </motion.div>
          )
        })}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>4-Week Cashflow Projection</div>
        <div style={{ position: 'relative', height: `${barH}px`, flexShrink: 0 }}>
          <svg width="100%" height={barH} style={{ overflow: 'visible' }}>
            {CASHFLOW_WEEKS.map((wk, i) => {
              const groupW = 100 / CASHFLOW_WEEKS.length
              const inH = (wk.inflow / maxVal) * barH
              const outH = (wk.outflow / maxVal) * barH
              const bw = groupW * 0.3
              const inX = `${i * groupW + groupW * 0.1}%`
              const outX = `${i * groupW + groupW * 0.45}%`
              return (
                <g key={i}>
                  <rect x={inX} y={barH - inH} width={`${bw}%`} height={inH} fill={A} opacity="0.7" rx="2" />
                  <rect x={outX} y={barH - outH} width={`${bw}%`} height={outH} fill="#ef4444" opacity="0.7" rx="2" />
                </g>
              )
            })}
            {/* Cash position line */}
            {CASH_POSITION.slice(0, 4).map((pos, i) => {
              const groupW = 100 / CASHFLOW_WEEKS.length
              const cy = barH - (pos / (maxVal * 2)) * barH
              const cx = `${i * groupW + groupW * 0.5}%`
              return <circle key={i} cx={cx} cy={cy} r="3" fill="#3b82f6" opacity="0.85" />
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '4px' }}>
            {CASHFLOW_WEEKS.map(wk => (
              <span key={wk.label} style={{ fontSize: '7px', color: T.textMuted, textAlign: 'center' }}>{wk.label.split('–')[0]}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '8px', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '8px', backgroundColor: A, borderRadius: '2px', opacity: 0.7, display: 'inline-block' }} /> AR In</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '8px', backgroundColor: '#ef4444', borderRadius: '2px', opacity: 0.7, display: 'inline-block' }} /> Bills Out</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', opacity: 0.85, display: 'inline-block' }} /> Cash position</span>
        </div>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          style={{ padding: '8px 10px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Sparkles size={11} style={{ color: A }} />
          <span style={{ fontSize: '9px', color: T.textSecondary, lineHeight: '1.5' }}>
            <strong style={{ color: '#ef4444' }}>Frankie:</strong> Week of Jun 24 projects a net outflow of $8k. Make sure to collect the Northbridge balance before then.
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    narrative: '1 · Weekly AI narrative — revenue, margin, AR watch, and cash action in plain English',
    anomalies: '2 · Anomaly feed — Frankie flags labor overruns, OT spikes, unmatched invoices, fuel costs',
    margins:   '3 · Margin trend — 12-week chart, target line at 35%, Frankie annotates every dip',
    cashflow:  '4 · Cashflow forecast — 4-week projection with Frankie alert on Week 3 net outflow',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Frankie Insights works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
