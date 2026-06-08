// Reports walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Reports.jsx — report type selector + financial/jobs/sales reports.
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, DollarSign, Briefcase, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/reports.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Report types from Reports.jsx lines 81-82
const REPORT_TYPES = [
  { id: 'sales',     label: 'Sales Report',     icon: TrendingUp,  desc: 'Pipeline conversion, rep performance, close rates' },
  { id: 'jobs',      label: 'Jobs Report',       icon: Briefcase,   desc: 'Job status, revenue, time tracking'                },
  { id: 'financial', label: 'Financial Report',  icon: DollarSign,  desc: 'Invoices, payments, revenue, expenses'             },
]

// Financial report stat cards (renderFinancialReport lines 384-397)
const FINANCIAL_STATS = [
  { label: 'Total Invoiced',   value: '$142,400', color: null         },
  { label: 'Total Collected',  value: '$118,200', color: '#4a7c59'    },
  { label: 'Outstanding',      value: '$24,200',  color: '#c25a5a'    },
  { label: 'Total Expenses',   value: '$38,700',  color: '#c25a5a'    },
  { label: 'Net Income',       value: '$79,500',  color: '#4a7c59'    },
]

const MONTHLY_REVENUE = [
  { month: 'Jan', amount: 12400 }, { month: 'Feb', amount: 18200 },
  { month: 'Mar', amount: 24500 }, { month: 'Apr', amount: 31800 },
  { month: 'May', amount: 28600 }, { month: 'Jun', amount: 42700 },
]

export default function ReportsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your numbers are clear." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showReport = scene === 'financial' || scene === 'revenue' || scene === 'drill'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BarChart3 size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Reports</span>
      </div>

      {/* Date range pills */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {['MTD', 'QTD', 'YTD', 'Last 30d', 'Custom'].map((label, i) => (
          <button key={label} style={{ padding: '3px 9px', borderRadius: '14px', fontSize: '10px', border: `1px solid ${i === 2 ? T.accent : T.border}`, backgroundColor: i === 2 ? T.accentBg : 'transparent', color: i === 2 ? T.accent : T.textSecondary, fontWeight: i === 2 ? '600' : '400', cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {!showReport ? (
        /* Report type cards */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {REPORT_TYPES.map((rt, i) => (
            <motion.div key={rt.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, duration: 0.3 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <rt.icon size={16} style={{ color: T.accent }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{rt.label}</div>
                <div style={{ fontSize: '10px', color: T.textMuted }}>{rt.desc}</div>
              </div>
              <ChevronRight size={13} style={{ color: T.textMuted }} />
            </motion.div>
          ))}
        </div>
      ) : (
        /* Financial Report view */
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
            {FINANCIAL_STATS.map(s => (
              <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '8px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: s.color || T.text }}>{s.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Revenue by Month bar chart */}
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>Revenue by Month</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '6px', paddingBottom: '4px' }}>
              {MONTHLY_REVENUE.map((m, i) => {
                const maxAmt = Math.max(...MONTHLY_REVENUE.map(x => x.amount))
                const pct = (m.amount / maxAmt) * 100
                return (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <div style={{ fontSize: '8px', color: T.textMuted }}>${(m.amount/1000).toFixed(0)}k</div>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${pct}%` }}
                      transition={{ delay: i * 0.07, duration: 0.4 }}
                      style={{ width: '100%', maxWidth: '32px', backgroundColor: i === 5 ? T.accent : T.accent + '60', borderRadius: '3px 3px 0 0', minHeight: '2px' }}
                    />
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{m.month}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview:  '1 · Reports — Sales, Jobs, Financial report types · date range pills',
    sales:     '2 · Sales Report — pipeline conversion, close rate, rep performance',
    financial: '3 · Financial Report — stat cards: Invoiced, Collected, Outstanding, Expenses, Net Income',
    revenue:   '4 · Revenue by Month bar chart — click any bar to drill into individual payments',
    drill:     '5 · Click any stat → drill-in shows the individual records that sum to that number',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Reports work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
