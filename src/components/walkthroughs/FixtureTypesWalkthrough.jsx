// Fixture Types walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Lamp, FileBadge, Zap, GitCompareArrows, DollarSign, CheckCircle2,
  XCircle, ArrowRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/fixture-types.js'

const FIXTURES = [
  { sku: 'LED-2X4-40W',   name: '2x4 LED panel · 40W',  watts: 40,  lumens: 4800, cost: 4.80,  retail: 14,   dlc: true },
  { sku: 'TUBE-LED-T8',   name: 'T8 LED tube · 4ft',    watts: 14,  lumens: 1800, cost: 4.20,  retail: 12,   dlc: true },
  { sku: 'HB-LED-150W',   name: 'LED highbay · 150W',   watts: 150, lumens: 22000, cost: 78,   retail: 220,  dlc: true },
  { sku: 'WP-LED-80W',    name: 'LED wallpack · 80W',   watts: 80,  lumens: 9800, cost: 62,   retail: 180,  dlc: true },
  { sku: 'STRIP-LED-2FT', name: 'LED strip · 2ft',      watts: 20,  lumens: 2200, cost: 28,   retail: 78,   dlc: false },
]

export default function FixtureTypesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="The fixture spine — audits + rebate math feed from here." />}
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
    <ZachShell title="Fixture Types · 314 LEDs" subtitle="DLC + replaces + per-utility eligibility" actionLabel="Add Fixture" actionIcon={Lamp} filterChips={[{ icon: FileBadge, label: 'DLC · 286 / 314' }]}>
      {scene === 'catalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {FIXTURES.map((f, i) => (
            <motion.div key={f.sku} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 70px 70px 70px 60px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lamp size={14} />
              </div>
              <div>
                <div style={{ color: T.text, fontWeight: 700 }}>{f.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted, fontFamily: 'monospace' }}>{f.sku}</div>
              </div>
              <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>{f.watts}W</div>
              <div style={{ color: T.textMuted, textAlign: 'right' }}>{f.lumens.toLocaleString()} lm</div>
              <div style={{ color: T.textMuted, textAlign: 'right' }}>cost ${f.cost.toFixed(2)}</div>
              <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${f.retail.toFixed(2)}</div>
              {f.dlc
                ? <Chip color={T.successDark} bg={T.successBg}>DLC</Chip>
                : <Chip color={T.textMuted} bg={T.bg}>—</Chip>
              }
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'detail' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 60, height: 60, borderRadius: 9, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lamp size={28} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>2x4 LED panel · 40W</div>
              <div style={{ fontSize: 10, color: T.textMuted, fontFamily: 'monospace' }}>LED-2X4-40W</div>
              <Chip color={T.successDark} bg={T.successBg}>DLC listed</Chip>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Field label="Watts"   value="40"    />
            <Field label="Lumens"  value="4,800" />
            <Field label="Color"   value="4000K" />
            <Field label="Driver"  value="0–10V dim" />
            <Field label="Cost"    value="$4.80"  />
            <Field label="Retail"  value="$14.00" highlight />
            <Field label="Margin"  value="66%" color={T.successDark} />
            <Field label="Warranty" value="5 yr"  />
          </div>
        </div>
      )}

      {scene === 'replace' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.danger}`, borderRadius: 9, padding: 14, maxWidth: 180 }}>
            <Chip color={T.danger} bg="rgba(239,68,68,0.12)">Existing</Chip>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: T.text }}>2x4 fluorescent</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>64W · 4-lamp T8</div>
          </motion.div>
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
            <GitCompareArrows size={28} style={{ color: T.purple }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 9, padding: 14, maxWidth: 220 }}>
            <Chip color={T.successDark} bg={T.successBg}>Replaces with</Chip>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: T.text }}>2x4 LED panel · 40W</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>Saves 24W per fixture</div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 6, padding: 6, background: T.accentBg, borderRadius: 6, fontSize: 10, color: T.accent, fontWeight: 600 }}>
              Lenard proposes this automatically
            </motion.div>
          </motion.div>
        </div>
      )}

      {scene === 'utility' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Per-utility rebate eligibility</div>
          {[
            { program: 'RMP Wattsmart',  eligible: true,  rebate: '$45 / unit' },
            { program: 'SRP Custom',     eligible: false, rebate: 'not eligible' },
            { program: 'APS Solutions',  eligible: true,  rebate: '$36 / unit' },
            { program: 'PG&E EnergySmart',eligible: true, rebate: '$52 / unit' },
          ].map((row, i) => (
            <motion.div key={row.program} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 110px', gap: 10, padding: 10, background: T.bgCard, border: `1.5px solid ${row.eligible ? T.border : T.border}`, borderRadius: 7, marginBottom: 5, alignItems: 'center', opacity: row.eligible ? 1 : 0.6 }}>
              {row.eligible
                ? <CheckCircle2 size={16} style={{ color: T.successDark }} />
                : <XCircle      size={16} style={{ color: T.textMuted }} />}
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.program}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: row.eligible ? T.successDark : T.textMuted, textAlign: 'right' }}>{row.rebate}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'docs' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileBadge size={18} style={{ color: T.purple }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Docs attached to this fixture</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Flow into proposals automatically</div>
            </div>
          </div>
          {[
            { name: 'DLC qualification sheet',    type: 'PDF · 220 KB' },
            { name: '5-year limited warranty',     type: 'PDF · 96 KB'  },
            { name: 'Install instructions',         type: 'PDF · 1.4 MB' },
            { name: 'IES photometric report',       type: 'PDF · 800 KB' },
          ].map((d, i) => (
            <motion.div key={d.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.13 }} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 100px', gap: 8, padding: 8, borderBottom: `1px dashed ${T.border}`, fontSize: 11, alignItems: 'center' }}>
              <FileBadge size={12} style={{ color: T.accent }} />
              <div style={{ color: T.text, fontWeight: 600 }}>{d.name}</div>
              <div style={{ color: T.textMuted, fontSize: 10, textAlign: 'right' }}>{d.type}</div>
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function Field({ label, value, color, highlight }) {
  return (
    <div style={{ padding: 8, background: T.bg, border: `1.5px solid ${highlight ? T.accent : T.border}`, borderRadius: 7 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || T.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    catalog: '1. 314 LEDs · pre-loaded · DLC tagged',
    detail:  '2. Per fixture · wattage, lumens, cost, retail, warranty',
    replace: '3. Replaces mapping · Lenard proposes automatically',
    utility: '4. Per-utility rebate eligibility · RMP yes, SRP no',
    docs:    '5. DLC sheet + warranty + install + IES · auto-flow',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Pre-loaded · bind your cost'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
