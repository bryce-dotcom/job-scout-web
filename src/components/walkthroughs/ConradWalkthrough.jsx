// Conrad walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/conrad/ — email marketing agent.
// DO NOT import ZachShell — shows campaign builder with audience + templates.

import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Plus, Users, Send, BarChart3, Sparkles, CheckCircle } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/conrad.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_CAMPAIGNS = [
  { id: 1, name: 'Summer LED Promo',          status: 'Sent',    opens: 47, clicks: 12, recipients: 82,  date: 'Jun 5' },
  { id: 2, name: 'Fleet Wrap Spring Deals',   status: 'Sent',    opens: 31, clicks: 8,  recipients: 64,  date: 'May 28' },
  { id: 3, name: 'Monthly Newsletter — Jun',  status: 'Draft',   opens: 0,  clicks: 0,  recipients: 0,   date: 'Jun 10' },
  { id: 4, name: 'Win-Back — Inactive 90d',   status: 'Scheduled',opens: 0, clicks: 0, recipients: 28, date: 'Jun 12' },
]

export default function ConradWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Campaigns running, leads coming in." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showAI = scene === 'write'
  const showStats = scene === 'stats'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mail size={15} style={{ color: '#635bff' }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Conrad Connect</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>Email Marketing</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: '#635bff', color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />New Campaign
        </button>
      </div>

      {/* AI writing prompt (scene: write) */}
      {showAI && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '9px', padding: '10px 12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <Sparkles size={12} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#7c3aed' }}>Conrad AI — drafting campaign copy…</span>
          </div>
          <div style={{ fontSize: '10px', color: '#4c1d95', lineHeight: 1.6 }}>
            <strong>Subject:</strong> "Cut your energy bill 40% this summer — here's how"<br />
            <em>Hi [First Name], summer is the highest-demand season for commercial lighting…</em>
          </div>
        </motion.div>
      )}

      {/* Campaign list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {MOCK_CAMPAIGNS.map((camp, i) => {
          const statusColor = camp.status === 'Sent' ? '#22c55e' : camp.status === 'Scheduled' ? '#3b82f6' : '#6b7280'
          return (
            <motion.div key={camp.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 12px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{camp.name}</span>
                <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: statusColor + '18', color: statusColor }}>{camp.status}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: T.textMuted }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Users size={9} />{camp.recipients} contacts</span>
                {camp.opens > 0 && <span><BarChart3 size={9} style={{ marginRight: '2px' }} />{Math.round(camp.opens/camp.recipients*100)}% open</span>}
                {camp.clicks > 0 && <span><CheckCircle size={9} style={{ marginRight: '2px', color: '#22c55e' }} />{camp.clicks} clicks</span>}
                <span style={{ marginLeft: 'auto' }}>{camp.date}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:     '1 · Conrad Connect — campaign list with status (Sent/Scheduled/Draft), open %, clicks',
    segment:  '2 · Segment contacts: All Customers, Won this quarter, Inactive 90d, by service type',
    write:    '3 · Conrad AI drafts the subject line and body from a one-sentence prompt',
    send:     '4 · Preview → Schedule or Send Now → SendGrid delivers, tracking pixel fires',
    stats:    '5 · Open rate and click tracking update live — Sent timestamp per recipient',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Conrad works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
