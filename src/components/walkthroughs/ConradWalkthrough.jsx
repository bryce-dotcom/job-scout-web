// Conrad walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/conrad/ — email marketing agent.
// DO NOT import ZachShell — shows campaign builder with audience + templates.

import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Plus, Users, Send, BarChart3, Sparkles, CheckCircle, Eye, MousePointerClick, Filter, Clock } from 'lucide-react'
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

const MOCK_SEGMENTS = [
  { label: 'All Customers',          count: 247, icon: Users },
  { label: 'Service — Mar or Apr',   count: 86,  icon: Filter },
  { label: 'Won this quarter',        count: 34,  icon: CheckCircle },
  { label: 'Inactive 90+ days',       count: 61,  icon: Clock },
]

const MOCK_STATS = [
  { label: 'Summer LED Promo',   sent: 82,  opens: 47, clicks: 12 },
  { label: 'Fleet Wrap Deals',   sent: 64,  opens: 31, clicks: 8  },
]

function CampaignList({ highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {MOCK_CAMPAIGNS.map((camp, i) => {
        const statusColor = camp.status === 'Sent' ? '#22c55e' : camp.status === 'Scheduled' ? '#3b82f6' : '#6b7280'
        const isHighlight = highlight === camp.id
        return (
          <motion.div key={camp.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${isHighlight ? '#635bff' : T.border}`, borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', boxShadow: isHighlight ? '0 0 0 2px rgba(99,91,255,0.2)' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{camp.name}</span>
              <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: statusColor + '18', color: statusColor }}>{camp.status}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: T.textMuted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Users size={9} />{camp.recipients} contacts</span>
              {camp.opens > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Eye size={9} />{Math.round(camp.opens/camp.recipients*100)}% open</span>}
              {camp.clicks > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#22c55e' }}><MousePointerClick size={9} />{camp.clicks} clicks</span>}
              <span style={{ marginLeft: 'auto' }}>{camp.date}</span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

function Stage({ scene }) {
  const PURPLE = '#635bff'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mail size={15} style={{ color: PURPLE }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Conrad Connect</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>Email Marketing</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: PURPLE, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />New Campaign
        </button>
      </div>

      {/* scene: list — campaign list overview */}
      {scene === 'list' && (
        <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, overflowY: 'auto' }}>
          <CampaignList highlight={null} />
        </motion.div>
      )}

      {/* scene: write — AI drafting */}
      {scene === 'write' && (
        <motion.div key="write" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ backgroundColor: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '9px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Sparkles size={12} style={{ color: '#7c3aed' }} />
              <span style={{ fontSize: '10px', fontWeight: '600', color: '#7c3aed' }}>Conrad AI — drafting campaign copy…</span>
            </div>
            <div style={{ fontSize: '10px', color: T.textMuted, marginBottom: '6px' }}>
              Goal: <span style={{ color: T.text, fontStyle: 'italic' }}>"Tell our spring customers about the summer maintenance special"</span>
            </div>
            <div style={{ fontSize: '10px', color: '#4c1d95', lineHeight: 1.6, backgroundColor: '#ede9fe', borderRadius: '6px', padding: '8px' }}>
              <strong>Subject:</strong> "Cut your energy bill 40% this summer — here's how"<br />
              <em>Hi [First Name], summer is the highest-demand season for commercial lighting…</em>
            </div>
          </div>
          <CampaignList highlight={null} />
        </motion.div>
      )}

      {/* scene: segment — audience picker */}
      {scene === 'segment' && (
        <motion.div key="segment" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Users size={12} style={{ color: PURPLE }} />
              <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>Pick Audience</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {MOCK_SEGMENTS.map((seg, i) => {
                const Icon = seg.icon
                const isSelected = i === 1
                return (
                  <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '7px', backgroundColor: isSelected ? PURPLE + '15' : T.bg, border: `1px solid ${isSelected ? PURPLE : T.border}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icon size={11} style={{ color: isSelected ? PURPLE : T.textMuted }} />
                      <span style={{ fontSize: '10px', color: isSelected ? PURPLE : T.text, fontWeight: isSelected ? '600' : '400' }}>{seg.label}</span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: isSelected ? PURPLE : T.textMuted }}>{seg.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* scene: send — preview + send modal */}
      {scene === 'send' && (
        <motion.div key="send" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.text, marginBottom: '10px' }}>Preview &amp; Send</div>
            <div style={{ backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: '7px', padding: '10px', marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', color: T.textMuted, marginBottom: '3px' }}>Subject</div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, marginBottom: '8px' }}>Cut your energy bill 40% this summer — here's how</div>
              <div style={{ fontSize: '10px', color: T.textSecondary, lineHeight: 1.5 }}>
                Hi [First Name], summer is the highest-demand season for commercial lighting. Here's how our maintenance special can cut your energy costs…
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', fontSize: '10px', color: T.textSecondary }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={10} /><strong>86</strong> recipients — Service Mar–Apr</span>
              <span style={{ color: T.textMuted }}>via SendGrid</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ flex: 1, padding: '8px', borderRadius: '7px', border: `1px solid ${T.border}`, backgroundColor: T.bg, fontSize: '10px', cursor: 'pointer', color: T.text }}>
                <Clock size={10} style={{ marginRight: '4px' }} />Schedule
              </button>
              <button style={{ flex: 2, padding: '8px', borderRadius: '7px', border: 'none', backgroundColor: PURPLE, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Send size={10} />Send Now — 86 recipients
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* scene: stats — open + click tracking */}
      {scene === 'stats' && (
        <motion.div key="stats" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Summer LED Promo</span>
              <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: '#22c55e18', color: '#22c55e' }}>Sent</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {[
                { icon: Users,            label: 'Sent',    value: '86',  color: T.textSecondary },
                { icon: Eye,              label: 'Opened',  value: '38',  color: PURPLE },
                { icon: MousePointerClick,label: 'Clicked', value: '6',   color: '#22c55e' },
                { icon: BarChart3,        label: 'Open %',  value: '44%', color: PURPLE },
              ].map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} style={{ flex: 1, backgroundColor: T.bg, borderRadius: '7px', padding: '8px', textAlign: 'center', border: `1px solid ${T.border}` }}>
                    <Icon size={12} style={{ color: stat.color, marginBottom: '3px' }} />
                    <div style={{ fontSize: '13px', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{stat.label}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: '10px', fontWeight: '600', color: T.textSecondary, marginBottom: '5px' }}>Recent Activity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { name: 'Doug Anderson',  action: 'Opened + Clicked', time: '2m ago',  color: '#22c55e' },
                { name: 'Tracy Benson',   action: 'Opened',           time: '5m ago',  color: PURPLE },
                { name: 'Marcus Webb',    action: 'Opened',           time: '12m ago', color: PURPLE },
              ].map(r => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', padding: '4px 6px', borderRadius: '5px', backgroundColor: T.bg }}>
                  <span style={{ color: T.text }}>{r.name}</span>
                  <span style={{ color: r.color }}>{r.action}</span>
                  <span style={{ color: T.textMuted }}>{r.time}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
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
