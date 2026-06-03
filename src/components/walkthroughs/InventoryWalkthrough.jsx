// Inventory walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Boxes, AlertTriangle, ArrowRight, Truck, Package, ClipboardCheck,
  Warehouse, ShoppingCart,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/inventory.js'

const STOCK = [
  { sku: 'LED-2X4-40W',   name: '2x4 LED panel · 40W',       wh: 142, t7: 8,  t12: 6,  reorder: 100, status: 'ok' },
  { sku: 'TUBE-LED-T8',   name: 'T8 LED tube · 4ft',         wh: 87,  t7: 24, t12: 18, reorder: 100, status: 'low' },
  { sku: 'BRKT-2X4',      name: '2x4 mounting bracket',      wh: 220, t7: 12, t12: 8,  reorder: 50,  status: 'ok' },
  { sku: 'WIRE-12-2-250', name: '12-2 Romex · 250ft roll',   wh: 18,  t7: 1,  t12: 1,  reorder: 12,  status: 'ok' },
  { sku: 'DRIVER-LED-100', name: 'LED driver · 100W',        wh: 12,  t7: 2,  t12: 0,  reorder: 25,  status: 'low' },
]

export default function InventoryWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Stock you can trust · across every location." />}
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
    <ZachShell title="Inventory · 4 locations" subtitle="Warehouse · 3 trucks · live consumption" actionLabel="New Product" actionIcon={Package} filterChips={[{ icon: Warehouse, label: '4 locations' }, { icon: AlertTriangle, label: '2 low-stock' }]}>
      {scene === 'list' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 60px 60px 70px 60px', fontSize: 9, color: T.textMuted, fontWeight: 700, padding: '6px 10px', borderBottom: `1.5px solid ${T.border}`, textTransform: 'uppercase' }}>
            <div>SKU</div><div>Name</div><div>WH</div><div>T7</div><div>T12</div><div>Reorder</div><div>Status</div>
          </div>
          {STOCK.map((s, i) => (
            <motion.div key={s.sku} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 60px 60px 70px 60px', fontSize: 11, color: T.text, padding: '8px 10px', alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: T.accent, fontWeight: 700 }}>{s.sku}</div>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{s.wh}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{s.t7}</div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{s.t12}</div>
              <div style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{s.reorder}</div>
              <div>{s.status === 'low' ? <Chip color={T.danger} bg="rgba(239,68,68,0.12)">low</Chip> : <Chip color={T.successDark} bg={T.successBg}>ok</Chip>}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'low' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STOCK.filter(s => s.status === 'low').map((s, i) => (
            <motion.div key={s.sku} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.2 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 90px 120px', gap: 10, alignItems: 'center', padding: 12, background: T.bgCard, border: `1.5px solid ${T.danger}`, borderRadius: 9 }}>
              <AlertTriangle size={20} style={{ color: T.danger }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{s.name}</div>
                <div style={{ fontSize: 10, color: T.textMuted, fontFamily: 'monospace' }}>{s.sku}</div>
              </div>
              <Chip color={T.danger} bg="rgba(239,68,68,0.12)">{s.wh + s.t7 + s.t12} on hand</Chip>
              <button style={{ padding: '6px 12px', background: T.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <ShoppingCart size={11} /> Reorder 100
              </button>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ padding: 10, background: T.successBg, border: `1.5px solid ${T.successDark}`, borderRadius: 7, fontSize: 11, color: T.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardCheck size={13} /> Purchase orders sent · 2 items · $1,840
          </motion.div>
        </div>
      )}

      {scene === 'transfer' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 14, minWidth: 170 }}>
            <Warehouse size={20} style={{ color: T.accent, marginBottom: 6 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Warehouse</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>2x4 LED panel · 40W</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: T.text }}>142 → 132</div>
          </motion.div>
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
            <ArrowRight size={28} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 9, padding: 14, minWidth: 170 }}>
            <Truck size={20} style={{ color: T.accent, marginBottom: 6 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Truck 12</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>2x4 LED panel · 40W</div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: T.successDark }}>6 → 16</div>
          </motion.div>
        </div>
      )}

      {scene === 'consume' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Package size={18} style={{ color: T.accent }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>JOB-2147 · Northbridge consumption</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Real-time as tech adds line items</div>
            </div>
          </div>
          {[
            { sku: 'LED-2X4-40W', name: '2x4 LED panel · 40W', qty: 14, was: 16, now: 2,  unit: 4.80, total: 67.20 },
            { sku: 'BRKT-2X4',    name: '2x4 mounting bracket', qty: 28, was: 32, now: 4, unit: 1.20, total: 33.60 },
            { sku: 'TUBE-LED-T8', name: 'T8 LED tube · 4ft',    qty: 12, was: 24, now: 12, unit: 8.00, total: 96.00 },
          ].map((r, i) => (
            <motion.div key={r.sku} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.2 }} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 90px', gap: 8, padding: '6px 0', fontSize: 11, borderBottom: `1px dashed ${T.border}` }}>
              <div style={{ color: T.text }}>{r.name}</div>
              <div style={{ color: T.text, fontWeight: 700 }}>{r.qty}× used</div>
              <div style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>truck: {r.was}→{r.now}</div>
              <div style={{ color: T.successDark, fontWeight: 700, textAlign: 'right' }}>${r.total.toFixed(2)} cost</div>
            </motion.div>
          ))}
          <div style={{ marginTop: 8, padding: 8, background: T.bg, borderRadius: 6, fontSize: 11, color: T.text, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>Job materials cost</span>
            <span style={{ color: T.accent, fontWeight: 800 }}>$196.80 → rolled into JOB-2147 costing</span>
          </div>
        </div>
      )}

      {scene === 'count' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Q2 count · Warehouse</div>
          {[
            { name: '2x4 LED panel · 40W',    exp: 142, counted: 142, variance: 0 },
            { name: 'T8 LED tube · 4ft',      exp: 200, counted: 188, variance: -12 },
            { name: '2x4 mounting bracket',   exp: 220, counted: 220, variance: 0 },
            { name: '12-2 Romex · 250ft roll', exp: 18, counted: 18,  variance: 0 },
            { name: 'LED driver · 100W',      exp: 12,  counted: 14,  variance: +2 },
          ].map((r, i) => (
            <motion.div key={r.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px', gap: 8, padding: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, alignItems: 'center' }}>
              <div style={{ color: T.text, fontWeight: 600 }}>{r.name}</div>
              <div style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>exp {r.exp}</div>
              <div style={{ color: T.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{r.counted}</div>
              <div style={{ color: r.variance === 0 ? T.successDark : r.variance < 0 ? T.danger : T.purple, fontWeight: 700, textAlign: 'right' }}>
                {r.variance === 0 ? '✓ match' : (r.variance > 0 ? '+' : '') + r.variance}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    list:     '1. Every product · warehouse + every truck',
    low:      '2. Reorder threshold · Freddy flags · one click reorder',
    transfer: '3. Pull from warehouse to truck · live sync',
    consume:  '4. Tech uses parts on a job · auto-deducted',
    count:    '5. Quarterly count · scan + reconcile variances',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Catalog · locations · thresholds'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
