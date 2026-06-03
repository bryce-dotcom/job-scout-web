// Conrad Connect (email marketing) walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Sparkles, Users, Send, Repeat, Eye, MousePointer, ArrowRight,
  Calendar, Bot, MessageSquare,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/conrad.js'

export default function ConradWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro, elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist"><SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} /></CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="AI-drafted · smartly segmented · always-on automations." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <ZachShell title="Conrad Connect · Campaigns" subtitle="AI-drafted email · smart segments · drip automations" actionLabel="New Campaign" actionIcon={Mail} filterChips={[{ icon: Bot, label: 'Conrad active' }]}>
      {scene === 'idea' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 18, maxWidth: 380, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Bot size={18} style={{ color: T.accent }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>What's the campaign?</div>
            </div>
            <div style={{ padding: 12, background: T.bg, border: `1.5px solid ${T.accent}`, borderRadius: 8, fontSize: 13, color: T.text, fontStyle: 'italic', lineHeight: 1.5 }}>
              "Tell our spring customers about the summer maintenance special."
            </div>
            <button style={{ marginTop: 10, padding: '10px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>
              <Sparkles size={13} /> Let Conrad draft it
            </button>
          </motion.div>
        </div>
      )}

      {scene === 'draft' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Sparkles size={14} style={{ color: T.accent }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: 'uppercase' }}>Conrad drafted</div>
            <Chip color={T.successDark} bg={T.successBg}>~4s</Chip>
          </div>
          <div style={{ padding: 10, background: T.bg, borderRadius: 7, marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Subject</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Beat the summer heat — book maintenance before the rush</div>
          </div>
          <div style={{ padding: 12, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, color: T.text, lineHeight: 1.55 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              Hi {'{first_name}'},
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ marginTop: 6 }}>
              Spring was good to us — your HVAC system worked hard while we kept it tuned. Now summer's coming, and the units that get serviced now run cooler, quieter, and a lot longer.
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 6 }}>
              Book your summer maintenance by June 15 and we'll knock <strong style={{ color: T.accent }}>$25 off</strong>. Same crew, same care, smaller bill.
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} style={{ marginTop: 8 }}>
              <span style={{ padding: '6px 12px', background: T.accent, color: '#fff', borderRadius: 6, display: 'inline-block', fontWeight: 700 }}>Book now</span>
            </motion.div>
          </div>
        </div>
      )}

      {scene === 'segment' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Users size={16} style={{ color: T.purple }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Pick audience</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Service in March-April', count: 86, active: true },
              { label: 'Maintenance contracts',  count: 41, active: false },
              { label: 'Lapsed > 12 months',     count: 23, active: false },
              { label: 'All active customers',   count: 184, active: false },
            ].map((row, i) => (
              <motion.div key={row.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: row.active ? T.purpleBg : T.bg, border: `1.5px solid ${row.active ? T.purple : T.border}`, borderRadius: 7 }}>
                <input type="checkbox" checked={row.active} readOnly style={{ accentColor: T.purple }} />
                <div style={{ flex: 1, fontSize: 12, color: T.text, fontWeight: row.active ? 700 : 500 }}>{row.label}</div>
                <Chip color={row.active ? T.purple : T.textMuted} bg={row.active ? T.purpleBg : T.bg}>{row.count} contacts</Chip>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.purpleBg, borderRadius: 6, fontSize: 11, color: T.purple, fontWeight: 700, textAlign: 'center' }}>
            Sending to 86 contacts
          </motion.div>
        </div>
      )}

      {scene === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="Sent" value="86" color={T.text} icon={Send} />
          <Stat label="Delivered" value="84" color={T.successDark} icon={Send} />
          <Stat label="Opened" value="38 · 45%" color={T.accent} icon={Eye} highlight />
          <Stat label="Clicked" value="9 · 11%" color={T.purple} icon={MousePointer} />
          <div style={{ gridColumn: 'span 2', padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Open rate · last 24h</div>
            <div style={{ height: 36, background: T.bg, borderRadius: 6, padding: 4, display: 'flex', alignItems: 'end', gap: 2 }}>
              {[4, 8, 12, 14, 11, 9, 7, 5, 8, 14, 18, 22, 18, 14, 10, 8, 6, 4, 3, 5, 7, 12, 16, 14].map((v, i) => (
                <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${(v / 25) * 100}%` }} transition={{ delay: i * 0.025 }} style={{ flex: 1, background: T.accent, borderRadius: 1, opacity: 0.7 + (v / 50) }} />
              ))}
            </div>
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ gridColumn: 'span 2', padding: 8, background: T.successBg, borderRadius: 6, fontSize: 11, color: T.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MessageSquare size={12} /> 2 leads booked from click-throughs · added to pipeline
          </motion.div>
        </div>
      )}

      {scene === 'auto' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Repeat size={16} style={{ color: T.accent }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>New customer · drip automation</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { day: 0,  title: 'Welcome email',         desc: 'Brand intro · how to reach us',     icon: Mail,     color: T.accent },
              { day: 14, title: 'Maintenance reminder',  desc: 'Schedule the first checkup',         icon: Calendar, color: T.purple },
              { day: 30, title: 'Review ask',            desc: 'Google/Yelp review request',         icon: Sparkles, color: T.successDark },
              { day: 90, title: 'Quarterly nudge',       desc: 'Service interval reminder',          icon: Repeat,   color: T.warning },
            ].map((row, i) => (
              <motion.div key={row.day} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '50px 30px 1fr 80px', gap: 10, alignItems: 'center', padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7 }}>
                <Chip color={row.color} bg={row.color + '20'}>Day {row.day}</Chip>
                <row.icon size={14} style={{ color: row.color }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.title}</div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>{row.desc}</div>
                </div>
                <Chip color={T.successDark} bg={T.successBg}>active</Chip>
              </motion.div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
            Set once · runs forever · every new customer flows through
          </div>
        </div>
      )}
    </ZachShell>
  )
}

function Stat({ label, value, color, icon: Icon, highlight }) {
  return (
    <motion.div animate={{ borderColor: highlight ? T.accent : T.border }} style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {Icon && <Icon size={12} style={{ color }} />}
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{value}</div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    idea:    '1. New campaign · describe the goal in plain English',
    draft:   '2. Conrad writes subject + body in your tone',
    segment: '3. Pick the audience · 86 contacts from spring',
    send:    '4. Send · open + click tracking flows back live',
    auto:    '5. Build a drip · welcome → reminder → review · forever',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Authenticate sender · feed Conrad your tone'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
