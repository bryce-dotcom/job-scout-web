// My Pay walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/MyPay.jsx — employee self-service pay view.
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { DollarSign, TrendingUp, Clock, ChevronLeft, ChevronRight, Eye, Zap } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/my-pay.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

export default function MyPayWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every rep sees exactly what they've earned." />}
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>My Pay</div>
          <div style={{ fontSize: '10px', color: T.textMuted }}>Pay period: Jun 1 – Jun 14, 2026</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={{ padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: T.textSecondary }}><ChevronLeft size={10} />Prev</button>
          <button style={{ padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bgCard, fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: T.textSecondary }}>Next<ChevronRight size={10} /></button>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' }}>
        {[
          { icon: DollarSign, label: 'Net Pay', value: '$5,100', sublabel: 'Gross: $6,200', color: '#22c55e' },
          { icon: TrendingUp, label: 'Commissions', value: '$3,200', sublabel: '3 deals', color: '#f59e0b' },
          { icon: Clock, label: 'Hours', value: '80.0h', sublabel: 'no OT', color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
              <s.icon size={12} style={{ color: s.color }} />
              <span style={{ fontSize: '9px', color: T.textMuted }}>{s.label}</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>{s.sublabel}</div>
          </div>
        ))}
      </div>

      {/* Won Jobs — pending commission source */}
      <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <TrendingUp size={12} style={{ color: '#22c55e' }} />Won Jobs (commission basis)
        </div>
        {[
          { est: 'EST-041', customer: 'Marcus Okafor',  amount: 24500, commission: 1960, status: 'Earned'  },
          { est: 'EST-038', customer: 'Sarah Chen',    amount: 18200, commission: 1456, status: 'Earned'  },
          { est: 'EST-035', customer: 'David Kim',     amount: 12000, commission: 960,  status: 'Pending' },
        ].map(job => (
          <div key={job.est} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '500', color: T.text }}>{job.customer}</div>
              <div style={{ fontSize: '9px', color: T.textMuted }}>{job.est} · ${job.amount.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>${job.commission.toLocaleString()}</div>
              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '6px', backgroundColor: job.status === 'Earned' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)', color: job.status === 'Earned' ? '#22c55e' : '#c28b38' }}>{job.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Efficiency bonus section */}
      <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Zap size={12} style={{ color: '#8b5cf6' }} />Efficiency Bonuses
          <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: '700', color: '#8b5cf6' }}>+$420</span>
        </div>
        <div style={{ fontSize: '10px', color: T.textSecondary }}>2 jobs finished under allotted hours · avg 1.2h saved</div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview:   '1 · My Pay — pay period, Net Pay, Commissions, Hours — every rep sees their own',
    commission: '2 · Won Jobs shows the deals this period and what commission each earned',
    pending:    '3 · Pending = deal won but customer hasn\'t paid yet — no commission until payment',
    bonus:      '4 · Efficiency Bonus — Zap section shows bonuses for finishing jobs under budget',
    history:    '5 · Navigate with Prev/Next to see past pay periods',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How My Pay works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
