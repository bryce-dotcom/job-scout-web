// Marketing walkthrough — narrated by Arnie himself (the card's voice is
// 'Arnie'; scripts/generate-walkthrough-audio.cjs knows his ElevenLabs id).
// Source: src/pages/Marketing.jsx. Shows the loop a crew and a marketer
// actually run: send from the phone, the AI drafts, make a video with music
// and a narrator, edit it, publish everywhere.

import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Play, Sparkles, Clapperboard, Music, Mic, Check, Send, Megaphone, ImageIcon } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/marketing.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  mkt: '#e11d48', mktBg: 'rgba(225,29,72,0.10)',
}

export default function MarketingWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Photos in, posts out, every network at once." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.3 } }

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Megaphone size={15} style={{ color: T.mkt }} />
        <span style={{ fontSize: '15px', fontWeight: 700 }}>Marketing</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Photos from the field become posts in your voice</span>
      </div>
      <AnimatePresence mode="wait">
        {scene === 'hero' && <Hero key="hero" />}
        {scene === 'capture' && <Capture key="capture" />}
        {scene === 'draft' && <Draft key="draft" />}
        {scene === 'video' && <Video key="video" />}
        {scene === 'edit' && <EditRow key="edit" />}
        {scene === 'publish' && <Publish key="publish" />}
      </AnimatePresence>
    </div>
  )
}

function Hero() {
  return (
    <motion.div {...fade} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>Shoot the work. I'll do the rest.</div>
      <div style={{ fontSize: '12px', color: T.textSecondary }}>Arnie, on marketing</div>
    </motion.div>
  )
}

function Capture() {
  return (
    <motion.div {...fade} style={{ display: 'flex', gap: 12, flex: 1 }}>
      <div style={{ width: 150, border: `1px solid ${T.border}`, borderRadius: 14, background: T.bgCard, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '10px', fontWeight: 700 }}>Send it to marketing</div>
        <div style={{ background: T.mkt, color: '#fff', borderRadius: 9, padding: '9px 10px', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><Camera size={12} /> Take a photo</div>
        <div style={{ background: '#2c3530', color: '#fff', borderRadius: 9, padding: '9px 10px', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><Play size={12} /> Record a video</div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10px', color: T.textSecondary, marginTop: 4 }}>
          <img src="/scout-walk.gif" alt="" width={22} height={22} style={{ borderRadius: 5 }} /> Sending 64%
        </motion.div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>From the phone, in the field</div>
        <div style={{ color: T.textSecondary, lineHeight: 1.5 }}>A tech shoots the before, the after, or the crew at work. One tap. The scout walks while it sends, and the office has it before the truck leaves.</div>
        <div style={{ color: T.textMuted }}>Also from Field Scout job photos, or by texting the company number.</div>
      </div>
    </motion.div>
  )
}

function Draft() {
  return (
    <motion.div {...fade} style={{ display: 'flex', gap: 12, flex: 1 }}>
      <div style={{ width: 92, height: 92, borderRadius: 10, background: 'linear-gradient(135deg,#9aa08a,#4d5a52)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><ImageIcon size={22} /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', background: T.mkt, color: '#fff', borderRadius: 8, padding: '7px 10px', fontWeight: 700 }}><Sparkles size={12} /> Draft with AI</div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 11px', lineHeight: 1.55, color: T.textSecondary }}>
          Granite pavers at a Temple entrance. Years of staining ground into the stone, then every pass in one direction, rinsed clean, and sealed. Same entrance, same stone.<br />
          <span style={{ color: T.textMuted }}>Call or text (801) 999-8430 for a free quote · #HHHServices #Utah</span>
        </motion.div>
        <div style={{ color: T.textMuted }}>In your brand's voice, from your EOS. Edit a line and the next draft learns it.</div>
      </div>
    </motion.div>
  )
}

function Video() {
  return (
    <motion.div {...fade} style={{ display: 'flex', gap: 12, flex: 1 }}>
      <div style={{ width: 86, height: 150, borderRadius: 10, background: 'linear-gradient(180deg,#5a6349,#3d4433)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center', fontWeight: 800, fontSize: '11px', lineHeight: 1.3 }}>
        Years of stain.<br />Gone.
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', background: '#2c3530', color: '#fff', borderRadius: 8, padding: '7px 10px', fontWeight: 700 }}><Clapperboard size={12} /> Make a video</div>
        <div style={{ color: T.textSecondary, lineHeight: 1.5 }}>The AI plans it: a before-and-after reveal, the crew clip, a card with the call. Then it picks a track and I read the script.</div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip icon={Music} label="Bold · Hard evidence" />
          <Chip icon={Mic} label="Arnie narrating" />
          <Chip icon={Sparkles} label="No photos? I'll paint one" muted />
        </motion.div>
      </div>
    </motion.div>
  )
}

function EditRow() {
  return (
    <motion.div {...fade} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', background: T.bgCard, display: 'flex', gap: 6, alignItems: 'center' }}><Play size={11} /> Preview</div>
        <div style={{ background: T.mkt, color: '#fff', borderRadius: 8, padding: '8px 10px', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><Clapperboard size={11} /> Edit video, music & voice</div>
      </div>
      <div style={{ color: T.textSecondary, display: 'flex', gap: 6, alignItems: 'center' }}><Music size={11} color={T.textMuted} /> Bold · Hard evidence <span style={{ color: T.textMuted }}>·</span> <Mic size={11} color={T.textMuted} /> narrated <span style={{ color: T.textMuted }}>· 3 scenes</span></div>
      <div style={{ color: T.textMuted }}>The plan stays with the video. Change a line, the track or the voice and make it again. Nothing starts over.</div>
    </motion.div>
  )
}

function Publish() {
  const nets = ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'Google Business']
  return (
    <motion.div {...fade} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {nets.map((n, i) => (
          <motion.div key={n} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.18 }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, border: `1px solid ${T.mkt}`, background: T.mktBg, color: T.mkt, fontWeight: 600 }}>
            <Check size={11} /> {n}
          </motion.div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', background: T.bgCard, display: 'flex', gap: 6, alignItems: 'center' }}><Check size={11} /> Approve</div>
        <div style={{ background: T.mkt, color: '#fff', borderRadius: 8, padding: '8px 10px', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><Send size={11} /> Publish now</div>
      </div>
      <div style={{ color: T.textMuted }}>One approval, every connected network. The tech who shot it hears that it went out.</div>
    </motion.div>
  )
}

function Chip({ icon: Icon, label, muted }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, border: `1px solid ${muted ? T.border : T.mkt}`, background: muted ? T.bgCard : T.mktBg, color: muted ? T.textSecondary : T.mkt, fontSize: '10px', fontWeight: 600 }}>
      <Icon size={10} /> {label}
    </span>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    hero:    'Marketing — step 1 of the Sales Flow',
    capture: '1 · Send it from the phone: photo, video, or a text to the company number',
    draft:   '2 · Draft with AI — a caption in your brand voice, learning from every edit',
    video:   '3 · Make a video: the AI plans scenes, composes a track, Arnie narrates',
    edit:    '4 · Edit video, music & voice — the plan stays with the video',
    publish: '5 · Approve once, publish to every connected network',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Marketing works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
