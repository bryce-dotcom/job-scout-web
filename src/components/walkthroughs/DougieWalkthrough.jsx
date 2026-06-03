// Dougie The Document Reader walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSearch, FileUp, Sparkles, Pencil, GraduationCap, FileText, Eye,
  Bot,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/dougie.js'

export default function DougieWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Reads any document · learns your corrections · gets sharper weekly." />}
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
    <ZachShell title="Dougie · Document Reader" subtitle="OCR · structured extraction · per-company learning" actionLabel="Upload Document" actionIcon={FileUp} actionHighlight={scene === 'upload'} filterChips={[{ icon: Bot, label: 'Schemas: utility bill · receipt · audit form · W-9' }]}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14, height: '100%' }}>
        {/* Left: document preview */}
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 8, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>RMP-bill-may.pdf · 12 pages</div>
          <div style={{ flex: 1, background: '#1f2937', borderRadius: 6, padding: 8, position: 'relative', overflow: 'hidden' }}>
            <div style={{ background: 'rgba(255,255,255,0.95)', padding: 8, borderRadius: 3, color: '#1f2937', fontSize: 8, lineHeight: 1.4, fontFamily: 'monospace' }}>
              <div style={{ fontWeight: 700, fontSize: 9 }}>ROCKY MOUNTAIN POWER</div>
              <div>Statement · May 2026</div>
              <div style={{ marginTop: 4 }}>Account: 408-XXXX-XX</div>
              <div>Service: 6395 W 10400 N Highland UT</div>
              <div style={{ marginTop: 4 }}>Billing period: Apr 26 – May 24</div>
              <div>kWh used: 24,180</div>
              <div>Peak demand: 78 kW</div>
              <div style={{ marginTop: 4 }}>Energy charges ............ $2,810.40</div>
              <div>Demand charges ........... $1,029.60</div>
              <div style={{ fontWeight: 700, marginTop: 3, borderTop: '1px dashed #999', paddingTop: 3 }}>Total ........................ $3,840.00</div>
            </div>
            {scene === 'extract' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 8, pointerEvents: 'none' }}>
                {[
                  { top: '14%', left: '46%', width: '38%', label: 'account' },
                  { top: '28%', left: '20%', width: '74%', label: 'service addr' },
                  { top: '37%', left: '42%', width: '36%', label: 'period' },
                  { top: '43%', left: '28%', width: '20%', label: 'kWh' },
                  { top: '49%', left: '40%', width: '14%', label: 'demand' },
                  { top: '74%', left: '64%', width: '24%', label: 'total' },
                ].map((box, i) => (
                  <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 * i }} style={{ position: 'absolute', top: box.top, left: box.left, width: box.width, height: 10, border: `1.5px solid ${T.accent}`, borderRadius: 2, background: 'rgba(90,99,73,0.15)' }} />
                ))}
              </motion.div>
            )}
            {scene === 'correct' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', top: '49%', left: '40%', width: '14%', height: 10, border: `2px solid ${T.warning}`, borderRadius: 2, background: 'rgba(234,179,8,0.25)', boxShadow: '0 0 0 4px rgba(234,179,8,0.15)' }} />
            )}
          </div>
        </div>

        {/* Right: extracted fields */}
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 12, display: 'flex', flexDirection: 'column' }}>
          {scene === 'upload' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
              <FileUp size={36} style={{ color: T.accent }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Drop a document</div>
              <div style={{ fontSize: 11, color: T.textMuted, maxWidth: 220 }}>PDF or photo · Dougie reads any utility bill, receipt, audit form, or W-9.</div>
            </div>
          )}

          {(scene === 'extract' || scene === 'correct' || scene === 'learn') && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Sparkles size={14} style={{ color: T.accent }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: 'uppercase' }}>
                  {scene === 'learn' ? 'Re-applied automatically' : 'Extracted fields'}
                </div>
                <Chip color={T.purple} bg={T.purpleBg}>{scene === 'learn' ? 'next bill' : 'utility_bill schema'}</Chip>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { k: 'account',       v: '408-XXXX-XX',  conf: 99 },
                  { k: 'service_addr',  v: '6395 W 10400 N Highland UT', conf: 95 },
                  { k: 'period_start',  v: '2026-04-26',   conf: 97 },
                  { k: 'period_end',    v: '2026-05-24',   conf: 97 },
                  { k: 'kwh_used',      v: '24,180',       conf: 99 },
                  { k: 'peak_demand_kw',v: scene === 'correct' ? '54' : '78', conf: scene === 'correct' ? 64 : (scene === 'learn' ? 96 : 64), corrected: scene === 'learn' },
                  { k: 'total_amount',  v: '$3,840.00',    conf: 99 },
                ].map((row, i) => (
                  <motion.div key={row.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', gap: 8, padding: '5px 8px', background: row.corrected ? T.successBg : T.bg, border: `1px solid ${row.corrected ? T.successDark : T.border}`, borderRadius: 5, fontSize: 11, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: T.textMuted }}>{row.k}</div>
                    <div style={{ color: T.text, fontWeight: 600 }}>
                      {scene === 'correct' && row.k === 'peak_demand_kw' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ textDecoration: 'line-through', color: T.danger }}>78</span>
                          <span style={{ color: T.warning }}>→</span>
                          <strong style={{ color: T.warning }}>54</strong>
                        </span>
                      ) : row.v}
                    </div>
                    <div style={{ fontSize: 10, color: row.conf >= 90 ? T.successDark : row.conf >= 75 ? T.warning : T.danger, fontWeight: 700, textAlign: 'right' }}>
                      {row.conf}%
                    </div>
                  </motion.div>
                ))}
              </div>
              {scene === 'correct' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.warningBg, border: `1px solid ${T.warning}`, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Pencil size={12} style={{ color: T.warning }} />
                  Demand: corrected 78 → 54 · service charge confused the extractor
                </motion.div>
              )}
              {scene === 'learn' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.purpleBg, border: `1px solid ${T.purple}`, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <GraduationCap size={12} style={{ color: T.purple }} />
                  Correction learned · RMP bills, peak_demand · auto-applied on next pass
                </motion.div>
              )}
            </>
          )}

          {scene === 'use' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Where the fields flow</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { dest: 'Lighting audit baseline',  icon: '⚡', uses: 'kWh, demand, period' },
                  { dest: 'Rebate form auto-fill',    icon: '📋', uses: 'account, service addr' },
                  { dest: 'Utility invoice draft',    icon: '💰', uses: 'period, total' },
                  { dest: 'Energy savings model',      icon: '📈', uses: 'kWh, kWh delta target' },
                ].map((row, i) => (
                  <motion.div key={row.dest} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gap: 8, padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, alignItems: 'center' }}>
                    <span style={{ fontSize: 16 }}>{row.icon}</span>
                    <div style={{ color: T.text, fontWeight: 700 }}>{row.dest}</div>
                    <div style={{ color: T.textMuted, fontSize: 10, textAlign: 'right' }}>uses: {row.uses}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    upload:  '1. Drop a utility bill PDF · 12 pages, dense, ugly',
    extract: '2. Dougie reads · structured fields · confidence per field',
    correct: '3. Fix the one demand reading he got wrong · 78 → 54',
    learn:   '4. Next RMP bill · correction auto-applied · 96% confidence',
    use:     '5. Fields flow to audits, rebate forms, invoices, savings models',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Unlock Dougie · upload · train as you go'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
