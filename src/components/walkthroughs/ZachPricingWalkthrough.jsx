// Zach Pricing walkthrough — the rate card.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, Sprout, Wrench, DollarSign, Calculator, Save, CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import {
  T, ZachShell,
} from './zach/ZachShell'
import card from '../../lib/featureKnowledge/zach-pricing.js'

export default function ZachPricingWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%',
      paddingBottom: '56.25%',
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />}

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
            <DonePanel key="done" onReplay={replay} subtitle="Every Zach quote uses these numbers." />
          )}
        </AnimatePresence>
      </div>

      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  const highlight = scene === 'mow' ? 'mow'
    : scene === 'treat' ? 'treat'
    : scene === 'preview' ? 'preview'
    : null
  const showSaved = scene === 'save' && sceneElapsed > 2500

  return (
    <ZachShell
      title="Pricing"
      subtitle="Your rate card. Zach uses these numbers to price every property."
      actionLabel={showSaved ? 'Saved!' : 'Save Pricing'}
      actionIcon={showSaved ? CheckCircle2 : Save}
      actionHighlight={scene === 'save' && !showSaved}
    >
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
        <SectionCard icon={Scissors} title="Mowing" highlight={highlight === 'mow'}>
          <RateGrid items={[
            ['$ per sqft', '0.0147'],
            ['Min charge', '$45'],
            ['Min / 1k sqft', '6.5'],
            ['Edge $/ft', '$0.85'],
            ['Travel/visit', '$8'],
          ]} animateIn={scene === 'mow'} />
        </SectionCard>

        <SectionCard icon={Sprout} title="Treatments — $/1,000 sqft" highlight={highlight === 'treat'}>
          <RateGrid items={[
            ['Pre-emergent', '12'],
            ['Fertilizer', '14'],
            ['Weed control', '11'],
            ['Grub control', '18'],
            ['Iron', '8'],
            ['Lime', '9'],
          ]} animateIn={scene === 'treat'} />
        </SectionCard>

        <SectionCard icon={Wrench} title="Aeration, overseed, cleanup">
          <RateGrid items={[
            ['Aeration /1k', '$22'],
            ['Aer minimum', '$85'],
            ['Overseed /1k', '$18'],
            ['Cleanup /hr', '$65'],
          ]} />
        </SectionCard>

        <SectionCard icon={DollarSign} title="Tax & margin">
          <RateGrid items={[
            ['Tax rate', '0.0825'],
            ['Margin ×', '1.08'],
          ]} />
        </SectionCard>

        {/* Live preview — full-width accent strip */}
        <motion.div
          animate={highlight === 'preview' ? { scale: [1, 1.015, 1] } : { scale: 1 }}
          transition={{ repeat: highlight === 'preview' ? Infinity : 0, duration: 1.6 }}
          style={{
            background: T.accentBg,
            border: `1.5px solid ${highlight === 'preview' ? T.accent : `${T.accent}66`}`,
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Calculator size={13} style={{ color: T.accent }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
              Live preview · 6,000 sqft sample lawn
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <PreviewStat label="Per mow visit" value="$88.20" sub="39 min" />
            <PreviewStat label="26 mows/season" value="$2,293" />
            <PreviewStat label="Annual program" value="$3,742" sub="mow + treatments" />
          </div>
        </motion.div>
      </div>
    </ZachShell>
  )
}

function SectionCard({ icon: Icon, title, children, highlight }) {
  return (
    <motion.div
      animate={highlight ? { borderColor: T.accent } : { borderColor: T.border }}
      transition={{ duration: 0.3 }}
      style={{
        background: T.bgCard,
        border: `1.5px solid ${T.border}`,
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} style={{ color: T.accent }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{title}</div>
      </div>
      {children}
    </motion.div>
  )
}

function RateGrid({ items, animateIn }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      gap: 6,
    }}>
      {items.map(([label, value], i) => (
        <motion.div
          key={label}
          initial={animateIn ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: animateIn ? i * 0.12 : 0, duration: 0.3 }}
          style={{
            padding: '5px 7px',
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            background: T.bgInput,
          }}
        >
          <div style={{ fontSize: 8, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 1 }}>
            {label}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{value}</div>
        </motion.div>
      ))}
    </div>
  )
}

function PreviewStat({ label, value, sub }) {
  return (
    <div style={{ background: T.bgCard, borderRadius: 7, padding: '7px 10px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    sections: '1. Four sections — mowing, treatments, aeration, tax & margin',
    mow:      '2. $/sqft + minimum + minutes per 1k sqft for mowing',
    treat:    '3. Treatment rates per 1,000 sqft',
    preview:  '4. Live preview against a 6,000 sqft sample',
    save:     '5. Save — every Zach quote uses the new numbers',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to dial in the numbers'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
