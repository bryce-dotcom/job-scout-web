// Inventory walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Inventory.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Boxes, Plus, Search, AlertTriangle, Package, Wrench, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/inventory.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// CONDITION_COLORS from Inventory.jsx
const CONDITION_COLORS = {
  'New':        { backgroundColor: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
  'Good':       { backgroundColor: 'rgba(74,124,89,0.12)',  color: '#4a7c59' },
  'Fair':       { backgroundColor: 'rgba(194,139,56,0.12)', color: '#c28b38' },
  'Poor':       { backgroundColor: 'rgba(194,90,90,0.12)',  color: '#c25a5a' },
}

const MOCK_MATERIALS = [
  { id: 1, item_id: 'MAT-001', name: '48" LED Strip (Type A)',   quantity: 12,  min_quantity: 5,  location: 'Shelf A-2' },
  { id: 2, item_id: 'MAT-002', name: 'LED Driver 100W',          quantity: 3,   min_quantity: 10, location: 'Shelf B-1' },
  { id: 3, item_id: 'MAT-003', name: 'Conduit — 1" EMT (10ft)',  quantity: 24,  min_quantity: 10, location: 'Floor Rack' },
  { id: 4, item_id: 'MAT-004', name: 'Wire Nuts — Assorted',     quantity: 0,   min_quantity: 1,  location: 'Bin C-3'   },
]

export default function InventoryWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Inventory tracked." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const items = scene === 'empty' ? [] : MOCK_MATERIALS
  const getStockColor = (q, min) => {
    if (!min) return '#4a7c59'
    const r = q / min
    if (q === 0) return '#ef4444'
    if (r < 1) return '#c25a5a'
    if (r < 1.5) return '#c28b38'
    return '#4a7c59'
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Boxes size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Inventory</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Item
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', backgroundColor: T.bg, padding: '3px', borderRadius: '7px', width: 'fit-content' }}>
        {['Material', 'Tool', 'Equipment'].map((tab, i) => (
          <button key={tab} style={{ padding: '4px 10px', fontSize: '10px', fontWeight: i === 0 ? '600' : '400', backgroundColor: i === 0 ? T.bgCard : 'transparent', color: i === 0 ? T.text : T.textMuted, border: 'none', borderRadius: '5px', cursor: 'pointer' }}>{tab}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder="Search inventory..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <Boxes size={36} style={{ color: T.textMuted, marginBottom: '10px' }} />
          <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No inventory items. Add your first item.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {items.map((item, i) => {
            const sc = getStockColor(item.quantity, item.min_quantity)
            const isLow = item.quantity < item.min_quantity
            const isOut = item.quantity === 0
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.25 }}
                style={{ backgroundColor: T.bgCard, border: `1px solid ${isLow ? sc : T.border}`, borderRadius: '9px', padding: '12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{item.item_id}</div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: '6px', textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: sc }}>{item.quantity}</div>
                    <div style={{ fontSize: '8px', color: T.textMuted }}>min {item.min_quantity}</div>
                  </div>
                </div>
                {(isLow || isOut) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px', backgroundColor: sc + '15', borderRadius: '4px', marginBottom: '5px' }}>
                    <AlertTriangle size={9} style={{ color: sc }} />
                    <span style={{ fontSize: '8px', fontWeight: '600', color: sc }}>{isOut ? 'OUT OF STOCK' : 'LOW STOCK'}</span>
                  </div>
                )}
                <div style={{ fontSize: '9px', color: T.textMuted }}>{item.location}</div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:  '1 · Inventory — Material / Tool / Equipment tabs, Add Item',
    items:  '2 · Material cards — quantity (colored), min threshold, low stock badge',
    low:    '3 · Low stock items show AlertTriangle + colored border + low/out-of-stock chip',
    adjust: '4 · Click any item → adjust quantity +/- or scan barcode to look up',
    order:  '5 · Low stock items drive reorder triggers — configure thresholds per item',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Inventory tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
