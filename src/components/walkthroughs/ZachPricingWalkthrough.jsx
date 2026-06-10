// Zach Pricing walkthrough — rebuilt to Prospect Scout standard.
// Source: lawn-care Pricing page (Zach module).
// Rate card: $/sqft mowing, $/1k sqft treatments, live preview calculator.
// DO NOT import ZachShell.

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
import card from '../../lib/featureKnowledge/zach-pricing.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgInput: '#f7f5ef',
  border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e', successBg: 'rgba(34,197,94,0.10)', successDark: '#15803d',
  danger: '#ef4444', warning: '#eab308', warningBg: 'rgba(234,179,8,0.15)',
  purple: '#a855f7', purpleBg: 'rgba(168,85,247,0.10)',
}

// ─── Shared Zach page primitive (inlined — no ZachShell import) ───────────────

function ZachPageChrome({ title, subtitle, actionLabel, actionIcon: ActionIcon = Save, actionHighlight, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{title}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>{subtitle}</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <ActionIcon size={14} /> {actionLabel}
          </button>
          {actionHighlight && (
            <motion.div initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: -4, borderRadius: 12, border: `2px solid ${T.accent}`, pointerEvents: 'none' }}
            />
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ZachPricingWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every Zach quote uses these numbers." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ────────────────────────────────────────────────────────────────────

function Stage({ scene, sceneElapsed }) {
  const highlight  = scene === 'mow' ? 'mow' : scene === 'treat' ? 'treat' : scene === 'preview' ? 'preview' : null
  const showSaved  = scene === 'save' && sceneElapsed > 2500

  return (
    <ZachPageChrome
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
            ['Pre-emergent', '$12'],
            ['Fertilizer',   '$14'],
            ['Weed control', '$11'],
            ['Grub control', '$18'],
            ['Iron',          '$8'],
            ['Lime',          '$9'],
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

        {/* Live preview strip */}
        <motion.div
          animate={highlight === 'preview' ? { scale: [1, 1.015, 1] } : { scale: 1 }}
          transition={{ repeat: highlight === 'preview' ? Infinity : 0, duration: 1.6 }}
          style={{ background: T.accentBg, border: `1.5px solid ${highlight === 'preview' ? T.accent : `${T.accent}66`}`, borderRadius: 10, padding: '10px 12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Calculator size={13} style={{ color: T.accent }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Live preview · 6,000 sqft sample lawn</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <PreviewStat label="Per mow visit" value="$88.20" sub="39 min" />
            <PreviewStat label="26 mows/season" value="$2,293" />
            <PreviewStat label="Annual program" value="$3,742" sub="mow + treatments" />
          </div>
        </motion.div>
      </div>
    </ZachPageChrome>
  )
}

function SectionCard({ icon: Icon, title, children, highlight }) {
  return (
    <motion.div
      animate={highlight ? { borderColor: T.accent } : { borderColor: T.border }}
      transition={{ duration: 0.3 }}
      style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: '10px 12px' }}
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
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 6 }}>
      {items.map(([label, value], i) => (
        <motion.div key={label}
          initial={animateIn ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: animateIn ? i * 0.12 : 0, duration: 0.3 }}
          style={{ padding: '5px 7px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.bgInput }}
        >
          <div style={{ fontSize: 8, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 1 }}>{label}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{value}</div>
        </motion.div>
      ))}
    </div>
  )
}

function PreviewStat({ label, value, sub }) {
  return (
    <div style={{ background: T.bgCard, borderRadius: 7, padding: '7px 10px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    sections: '1 · Four sections — mowing, treatments, aeration & cleanup, tax & margin',
    mow:      '2 · $/sqft + minimum charge + minutes per 1,000 sqft for mowing',
    treat:    '3 · Treatment rates per 1,000 sqft — pre-emergent through lime',
    preview:  '4 · Live preview against a 6,000 sqft sample: $88.20/mow · $3,742/season',
    save:     '5 · Save — every Zach quote uses the updated numbers immediately',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Pricing works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
