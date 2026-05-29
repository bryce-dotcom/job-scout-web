// Sales Pipeline walkthrough — kanban view of leads through stages.

import { motion, AnimatePresence } from 'framer-motion'
import {
  GitBranch, Trophy, DollarSign, Users, Move, ArrowRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/sales-pipeline.js'

const COLUMNS = ['Appointment Set', 'Qualified', 'Quoted', 'Won']
const BASE_DEALS = [
  { id: 1, name: 'Sarah Chen',     biz: 'Northbridge Industries', total: 4200, col: 0 },
  { id: 2, name: 'Marcus Reeves',  biz: 'Cypress Logistics',      total: 2840, col: 0 },
  { id: 3, name: 'Priya Anand',    biz: 'Solera Manufacturing',   total: 8900, col: 1 },
  { id: 4, name: 'David Okafor',   biz: 'Granite Foods',          total: 1640, col: 1 },
  { id: 5, name: 'Hannah Liu',     biz: 'Ridgeline REIT',         total: 6300, col: 2 },
  { id: 6, name: 'Carlos Rivera',  biz: 'Carlsen Builders',       total: 3500, col: 2 },
  { id: 7, name: 'Tom Walsh',      biz: 'Walsh & Sons',           total: 12400, col: 3 },
]

export default function SalesPipelineWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your funnel is one drag away from clarity." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  // Move scene: deal at column 0 drags to column 1 over time
  const dragProgress = scene === 'drag' ? Math.min(1, sceneElapsed / 3000) : 0
  const dragDeal = BASE_DEALS.find(d => d.id === 2)
  const deals = BASE_DEALS.map(d => {
    if (scene === 'drag' && d.id === 2) return { ...d, col: dragProgress > 0.8 ? 1 : 0, dragging: true, dragProgress }
    if (scene === 'quoted' && d.id === 5) return { ...d, fresh: true }
    if (scene === 'won' && d.id === 7) return { ...d, exiting: true }
    return d
  })

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>Sales Pipeline</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textMuted }}>Every lead from Appointment Set to Won</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip icon={Users}>All reps</Chip>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, overflow: 'hidden' }}>
        {COLUMNS.map((col, ci) => {
          const colDeals = deals.filter(d => d.col === ci && !d.exiting)
          const total = colDeals.reduce((s, d) => s + d.total, 0)
          const isQuotedCol = ci === 2
          return (
            <div key={col} style={{ background: T.bgCard, border: `1.5px solid ${scene === 'forecast' ? T.accent : T.border}`, borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{col}</div>
              <AnimatePresence>
                {scene === 'forecast' && (
                  <motion.div key={col} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * ci, duration: 0.3 }} style={{ marginBottom: 6, padding: '4px 7px', background: T.accentBg, color: T.accent, borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <DollarSign size={10} /> {total.toLocaleString()} forecast
                  </motion.div>
                )}
              </AnimatePresence>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
                {colDeals.map((d, i) => (
                  <DealCard key={d.id} deal={d} fresh={d.fresh && isQuotedCol} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {scene === 'won' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }} style={{ position: 'absolute', top: 60, right: 20, padding: 12, background: T.successBg, border: `1.5px solid ${T.success}`, borderRadius: 10, boxShadow: '0 4px 14px rgba(34,197,94,0.18)', maxWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <Trophy size={13} style={{ color: T.successDark }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: T.successDark, textTransform: 'uppercase' }}>One click fires all three</div>
          </div>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.4 }}>
            ✓ Lead → Customer<br />
            ✓ Quote → Job<br />
            ✓ Setter bonus stamped
          </div>
        </motion.div>
      )}

      <div style={{ marginTop: 8, padding: '6px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
        {scene === 'board' && '12 active deals · $47,180 forecast'}
        {scene === 'drag' && (
          <span style={{ color: T.accent, fontWeight: 600 }}>
            <Move size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Dragging Marcus Reeves → Qualified
          </span>
        )}
        {scene === 'quoted' && 'Hannah Liu just sent — auto-moved to Quoted with $6,300'}
        {scene === 'forecast' && 'Per-column forecast updates as cards move'}
        {scene === 'won' && 'Tom Walsh signed — converts in one tap'}
      </div>
    </div>
  )
}

function DealCard({ deal, fresh }) {
  return (
    <motion.div
      initial={fresh ? { opacity: 0, scale: 0.94 } : false}
      animate={{ opacity: 1, scale: 1, x: deal.dragging ? deal.dragProgress * 60 : 0 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: '6px 8px',
        background: fresh ? T.successBg : T.bgCard,
        border: `1px solid ${fresh ? T.success : T.border}`,
        borderRadius: 6,
        boxShadow: deal.dragging ? '0 6px 14px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
        cursor: deal.dragging ? 'grabbing' : 'grab',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {deal.name}
      </div>
      <div style={{ fontSize: 9, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {deal.biz}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginTop: 2 }}>
        ${deal.total.toLocaleString()}
      </div>
    </motion.div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    board:    '1. Four stages — Appointment Set, Qualified, Quoted, Won',
    drag:     '2. Drag a card to advance the deal',
    quoted:   '3. Send a quote — card auto-moves to Quoted with the total',
    forecast: '4. Per-column revenue forecast in one glance',
    won:      '5. Won fires lead-convert + job + bonus in one click',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return "Now — what little there is to set up"
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
