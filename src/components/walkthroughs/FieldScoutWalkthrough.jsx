// Field Scout walkthrough — mobile tech home base.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass, Briefcase, Clock, Camera, PenLine, CheckCircle2,
  WifiOff, CloudUpload, MapPin,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/field-scout.js'

const TODAY = [
  { id: 'JOB-2147', cust: 'Northbridge', addr: 'Highland UT', time: '8:00 AM', status: 'next' },
  { id: 'JOB-2152', cust: 'Solera Mfg',  addr: 'Orem UT',     time: '1:00 PM', status: 'pending' },
  { id: 'JOB-2154', cust: 'Granite Foods', addr: 'Provo UT',  time: '3:30 PM', status: 'pending' },
]

export default function FieldScoutWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Phone-first field ops, works offline." />}
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
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', justifyContent: 'center' }}>
      {/* Phone frame */}
      <div style={{ width: '100%', maxWidth: 320, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 38px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '12px 16px', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Compass size={16} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Field Scout</div>
          </div>
          {scene === 'photo' && <WifiOff size={14} />}
          {(scene !== 'photo') && <div style={{ fontSize: 10, opacity: 0.85 }}>Cole · Today</div>}
        </div>

        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {scene === 'today' && TODAY.map((j, i) => (
            <motion.div key={j.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.18 }} style={{ padding: 12, border: `1.5px solid ${i === 0 ? T.accent : T.border}`, borderRadius: 10, background: i === 0 ? T.accentBg : T.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{j.id}</div>
                <Chip>{j.time}</Chip>
              </div>
              <div style={{ fontSize: 11, color: T.text }}>{j.cust}</div>
              <div style={{ fontSize: 10, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <MapPin size={9} /> {j.addr}
              </div>
            </motion.div>
          ))}

          {scene === 'clockin' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 14, background: T.successBg, border: `1.5px solid ${T.successDark}`, borderRadius: 10, textAlign: 'center' }}>
              <Clock size={28} style={{ color: T.successDark, margin: '0 auto 6px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T.successDark }}>Clocked in · 8:04 AM</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>JOB-2147 · Northbridge</div>
              <div style={{ fontSize: 9, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                <MapPin size={9} /> 40.4276°N · -111.7987°W
              </div>
            </motion.div>
          )}

          {scene === 'photo' && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 12, background: T.warningBg, border: `1.5px solid ${T.warning}`, borderRadius: 8, fontSize: 11, color: T.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <WifiOff size={13} style={{ color: T.warning }} />
                No signal · queued locally
              </motion.div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[0, 1, 2, 3].map(i => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.12 }} style={{ aspectRatio: '1', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={20} style={{ color: T.textMuted, opacity: 0.6 }} />
                  </motion.div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'center' }}>4 photos · 1.2 MB queued</div>
            </>
          )}

          {scene === 'sign' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Customer signature</div>
              <div style={{ height: 80, background: T.bg, border: `1px dashed ${T.border}`, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.svg width="160" height="40" viewBox="0 0 160 40" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8 }}>
                  <motion.path d="M 10 30 Q 30 5 50 25 T 90 18 T 130 28 L 150 12" fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8 }} />
                </motion.svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 9, color: T.textMuted }}>
                <PenLine size={9} style={{ color: T.successDark }} />
                IP · 24.116.x.x · 12:42 PM · audit logged
              </div>
            </motion.div>
          )}

          {scene === 'complete' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: 18, background: T.successBg, border: `1.5px solid ${T.successDark}`, borderRadius: 11, textAlign: 'center' }}>
              <CheckCircle2 size={40} style={{ color: T.successDark, margin: '0 auto 6px' }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: T.successDark }}>Job complete</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>Photos, signature, hours synced</div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} style={{ marginTop: 8, padding: 8, background: T.bgCard, borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <CloudUpload size={12} style={{ color: T.accent }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: T.text }}>Invoice sent</span>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    today:    "1. Today's jobs in order — time, customer, address",
    clockin:  '2. One-tap clock in · GPS stamp · job-linked',
    photo:    '3. Snap photos offline — queue handles the rest',
    sign:     '4. Signature on glass · ESIGN audit logged',
    complete: '5. Job complete → invoice goes out same day',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'One-tap setup per phone'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
