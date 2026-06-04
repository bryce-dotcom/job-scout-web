// Quote Follow-ups walkthrough — rebuilt to Prospect Scout standard.
// Source: supabase/functions/estimate-followup/index.ts
// No dedicated page UI — this is an automated email drip (cron job).
// Walkthrough shows the actual email subjects + timeline from the Edge Function.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Send, Mail, Clock, CheckCircle2, X, ExternalLink, Sparkles,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/quote-followups.js'

// ─── Theme ─────────────────────────────────────────────────────────────────
const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
}

// ─── Actual email subjects from estimate-followup/index.ts FOLLOWUP_SUBJECTS ──
const FOLLOWUP_EMAILS = [
  {
    day: 3,
    subject: 'Just checking in — Estimate EST-041 from Acme Solar',
    preview: "Hi there! We wanted to follow up on Estimate EST-041 that we sent over a few days ago. We know things get busy...",
    cta: 'View & Approve Estimate',
    color: '#3b82f6',
  },
  {
    day: 7,
    subject: 'Following up on your estimate EST-041 — Acme Solar',
    preview: "We're following up one more time on Estimate EST-041. Our team is ready to get started as soon as you give the green light...",
    cta: 'Review Your Estimate',
    color: '#f59e0b',
  },
  {
    day: 14,
    subject: 'Last chance to lock in your pricing — Estimate EST-041',
    preview: "This is our final follow-up regarding Estimate EST-041. Pricing and material availability can shift, so we'd love to lock things in...",
    cta: 'Approve Before Pricing Changes',
    color: '#f97316',
  },
]

// ─── Root ──────────────────────────────────────────────────────────────────
export default function QuoteFollowupsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: T.bg, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist
                title={`Set it up in ${card.setup.steps.length} steps`}
                steps={card.setup.steps}
                currentIdx={setupIdx}
              />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="Never lose a quote to radio silence." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ─────────────────────────────────────────────────────────────────
function Stage({ scene }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      fontSize: '12px', fontFamily: 'system-ui, sans-serif',
      color: T.text, backgroundColor: T.bg, padding: '16px',
      gap: '12px',
    }}>
      {/* Sent estimate card — always visible */}
      <SentEstimateCard scene={scene} />

      {/* Timeline of followups */}
      <TimelineArea scene={scene} />
    </div>
  )
}

// ─── The sent estimate card ────────────────────────────────────────────────
function SentEstimateCard({ scene }) {
  const isSigned = scene === 'signed'
  const sentColor = { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' }
  const approvedColor = { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' }
  const sc = isSigned ? approvedColor : sentColor

  return (
    <motion.div
      style={{
        backgroundColor: T.bgCard, borderRadius: '10px',
        border: `1px solid ${T.border}`, padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(44,53,48,0.07)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', backgroundColor: T.accentBg, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={18} style={{ color: T.accent }} />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>LED Retrofit — Northbridge</div>
          <div style={{ fontSize: '11px', color: T.accent }}>EST-041 · Marcus Okafor</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>$24,500</div>
        <motion.span
          key={isSigned ? 'approved' : 'sent'}
          initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}
          style={{
            padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
            backgroundColor: sc.bg, color: sc.text,
          }}
        >
          {isSigned ? 'Approved' : 'Sent'}
        </motion.span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: T.textMuted }}>
          <Clock size={12} />
          {isSigned ? 'Signed Jun 11' : 'Sent Jun 5'}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Timeline area ─────────────────────────────────────────────────────────
function TimelineArea({ scene }) {
  const visibleEmailIdx = {
    sent:   -1,
    nudge1:  0,
    nudge2:  1,
    nudge3:  2,
    signed:  1,  // show day-7 email with customer "opening" it
  }[scene] ?? -1

  const isSigned = scene === 'signed'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto',
    }}>
      {/* Header label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
        <Send size={13} style={{ color: T.accent }} />
        <span style={{ fontSize: '12px', fontWeight: '600', color: T.textSecondary }}>Automated follow-up schedule</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>· stops when signed</span>
      </div>

      {/* Timeline entries */}
      {FOLLOWUP_EMAILS.map((email, idx) => {
        const visible = idx <= visibleEmailIdx
        const isOpen = isSigned && idx === 1  // day-7 email "opened"
        const cancelled = isSigned && idx === 2 // day-14 cancelled

        if (!visible && scene !== 'signed' && idx > visibleEmailIdx) {
          // Show upcoming placeholder
          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 12px', backgroundColor: T.bg,
              borderRadius: '8px', border: `1px dashed ${T.border}`,
              opacity: 0.5,
            }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: email.color + '18', border: `1px dashed ${email.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: '700', color: email.color }}>D+{email.day}</span>
              </div>
              <div style={{ fontSize: '11px', color: T.textMuted }}>Follow-up {idx + 1} · Day {email.day}</div>
            </div>
          )
        }

        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: cancelled ? 0.4 : 1, x: 0 }}
            transition={{ delay: visible ? idx * 0.1 : 0, duration: 0.35 }}
          >
            <EmailCard email={email} index={idx} isOpen={isOpen} cancelled={cancelled} />
          </motion.div>
        )
      })}

      {/* "Signed" confirmation */}
      {isSigned && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', backgroundColor: '#dcfce7',
            borderRadius: '8px', border: '1px solid #86efac',
          }}
        >
          <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#15803d' }}>EST-041 Approved — Jun 11 · 3:47 PM</div>
            <div style={{ fontSize: '10px', color: '#16a34a', marginTop: '1px' }}>Follow-up D+14 cancelled · Job JOB-044 created</div>
          </div>
        </motion.div>
      )}

      {/* Scene intro when sent */}
      {scene === 'sent' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px', textAlign: 'center' }}>
          <Clock size={28} style={{ color: T.textMuted, opacity: 0.5 }} />
          <div style={{ fontSize: '13px', color: T.textSecondary }}>Estimate sent June 5 · no response yet</div>
          <div style={{ fontSize: '11px', color: T.textMuted }}>Job Scout cron runs nightly — first nudge fires Day 3</div>
        </div>
      )}
    </div>
  )
}

// ─── Email card ─────────────────────────────────────────────────────────────
function EmailCard({ email, index, isOpen, cancelled }) {
  return (
    <div style={{
      backgroundColor: T.bgCard, borderRadius: '8px',
      border: `1px solid ${isOpen ? email.color : T.border}`,
      overflow: 'hidden',
      boxShadow: isOpen ? `0 0 0 2px ${email.color}22` : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* Email header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 12px', borderBottom: `1px solid ${T.border}`,
        backgroundColor: cancelled ? T.bg : T.bgCard,
      }}>
        {/* Day badge */}
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
          backgroundColor: email.color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {cancelled
            ? <X size={12} style={{ color: T.textMuted }} />
            : <span style={{ fontSize: '9px', fontWeight: '700', color: email.color }}>D+{email.day}</span>}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: cancelled ? T.textMuted : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cancelled ? `[Cancelled] ${email.subject}` : email.subject}
          </div>
          <div style={{ fontSize: '10px', color: T.textMuted }}>
            {cancelled ? 'Cancelled — estimate was approved' : `Auto-sent Jun ${5 + email.day} · estimate-followup Edge Function`}
          </div>
        </div>
        {isOpen && (
          <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: email.color + '18', color: email.color, fontWeight: '600', flexShrink: 0 }}>
            Opened
          </span>
        )}
        <Mail size={12} style={{ color: T.textMuted, flexShrink: 0 }} />
      </div>

      {/* Email body preview (only when open or nudge1) */}
      {(isOpen || index === 0) && !cancelled && (
        <div style={{ padding: '10px 12px', backgroundColor: '#fafafa' }}>
          <p style={{ fontSize: '10px', color: T.textSecondary, lineHeight: 1.6, margin: '0 0 8px 0' }}>
            {email.preview}
          </p>
          <div style={{ textAlign: 'center' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '6px 14px', backgroundColor: T.accent, color: '#fff',
              borderRadius: '6px', fontSize: '10px', fontWeight: '600',
            }}>
              <ExternalLink size={9} />{email.cta}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    sent:   '1 · Estimate sent — no response by Day 3, cron fires the first nudge',
    nudge1: '2 · Day 3 — "Just checking in" email with portal link button',
    nudge2: '3 · Day 7 — second nudge, different subject and urgency level',
    nudge3: '4 · Day 14 — final touch: "Last chance to lock in your pricing"',
    signed: '5 · Customer clicks → signs → Approved · Day 14 nudge auto-cancelled',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to turn on quote follow-ups'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
