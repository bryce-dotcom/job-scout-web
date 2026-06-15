// Inventory walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/Inventory.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Boxes, Plus, Search, AlertTriangle, Package, ArrowRightLeft, ScanLine, Briefcase } from 'lucide-react'
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

const EXTENDED_INVENTORY = [
  ...MOCK_MATERIALS,
  { id: 5, item_id: 'MAT-005', name: 'Mounting Brackets (pkg/10)', quantity: 8,  min_quantity: 5, location: 'Shelf A-3' },
  { id: 6, item_id: 'MAT-006', name: '14-gauge Wire (25ft)',        quantity: 15, min_quantity: 8, location: 'Floor Rack' },
]

const JOB_USAGE = [
  { job: 'JOB-041', name: 'Northbridge LED', item: '48" LED Strip (Type A)', qty: 6, cost: 1320 },
  { job: 'JOB-041', name: 'Northbridge LED', item: 'LED Driver 100W',        qty: 4, cost: 400  },
  { job: 'JOB-038', name: 'Solera Office',   item: '48" LED Strip (Type A)', qty: 3, cost: 660  },
  { job: 'JOB-038', name: 'Solera Office',   item: 'Mounting Brackets',      qty: 2, cost: 44   },
]

function getStockColor(q, min) {
  if (!min) return '#4a7c59'
  if (q === 0) return '#ef4444'
  if (q < min) return '#c25a5a'
  if (q < min * 1.5) return '#c28b38'
  return '#4a7c59'
}

function InvCard({ item, highlight }) {
  const sc = getStockColor(item.quantity, item.min_quantity)
  const isLow = item.quantity < item.min_quantity
  const isOut = item.quantity === 0
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      style={{ backgroundColor: T.bgCard, border: `1px solid ${highlight || isLow ? sc : T.border}`, borderRadius: '9px', padding: '10px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '5px' }}>
        <div style={{ flex: 1, overflow: 'hidden', paddingRight: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ fontSize: '8px', color: T.textMuted }}>{item.item_id}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: sc }}>{item.quantity}</div>
          <div style={{ fontSize: '8px', color: T.textMuted }}>min {item.min_quantity}</div>
        </div>
      </div>
      {(isLow || isOut) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 5px', backgroundColor: sc + '15', borderRadius: '4px', marginBottom: '4px' }}>
          <AlertTriangle size={8} style={{ color: sc }} />
          <span style={{ fontSize: '8px', fontWeight: '600', color: sc }}>{isOut ? 'OUT OF STOCK' : 'LOW STOCK'}</span>
        </div>
      )}
      <div style={{ fontSize: '8px', color: T.textMuted }}>{item.location}</div>
    </motion.div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Boxes size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Inventory</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {(scene === 'transfer' || scene === 'count') && (
            <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: scene === 'transfer' ? T.accent : T.bgCard, color: scene === 'transfer' ? '#fff' : T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>
              {scene === 'transfer' ? <><ArrowRightLeft size={10} />Transfer</> : <><ScanLine size={10} />Count</>}
            </button>
          )}
          <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Plus size={10} />Add Item
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '3px', backgroundColor: T.bg, padding: '3px', borderRadius: '7px', width: 'fit-content', flexShrink: 0 }}>
        {['Material', 'Tool', 'Equipment'].map((tab, i) => (
          <button key={tab} style={{ padding: '3px 9px', fontSize: '9px', fontWeight: i === 0 ? '600' : '400', backgroundColor: i === 0 ? T.bgCard : 'transparent', color: i === 0 ? T.text : T.textMuted, border: 'none', borderRadius: '5px', cursor: 'pointer' }}>{tab}</button>
        ))}
      </div>

      {/* list: full item grid */}
      {scene === 'list' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '7px', alignContent: 'start', overflowY: 'auto' }}>
          {EXTENDED_INVENTORY.map(item => <InvCard key={item.id} item={item} />)}
        </div>
      )}

      {/* reorder: grid + reorder prompt at top */}
      {scene === 'reorder' && (
        <>
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={12} style={{ color: '#ef4444' }} />
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>2 items below reorder threshold</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>LED Driver 100W · Wire Nuts — Assorted</div>
              </div>
            </div>
            <button style={{ padding: '5px 12px', border: 'none', borderRadius: '6px', backgroundColor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>Reorder</button>
          </motion.div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '7px', alignContent: 'start', overflowY: 'auto' }}>
            {EXTENDED_INVENTORY.map(item => <InvCard key={item.id} item={item} highlight={item.quantity < item.min_quantity} />)}
          </div>
        </>
      )}

      {/* transfer: transfer modal */}
      {scene === 'transfer' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', width: '290px', boxShadow: '0 6px 24px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowRightLeft size={12} style={{ color: T.accent }} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>Transfer Inventory</span>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Item', '48" LED Strip (Type A)'], ['Quantity', '4'], ['From', 'Main Warehouse — Shelf A-2'], ['To', 'VEH-001 (Marcus — F-250)'], ['Job', 'JOB-041 — Northbridge LED']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '9px', color: T.textMuted, marginBottom: '2px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${l === 'To' ? T.accent : T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '10px', color: T.text, fontWeight: l === 'To' ? '600' : '400' }}>{v}</div>
                </div>
              ))}
              <button style={{ padding: '8px', border: 'none', borderRadius: '7px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Confirm Transfer</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* costing: job costing view */}
      {scene === 'costing' && (
        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Briefcase size={12} style={{ color: T.accent }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Material Usage by Job</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ backgroundColor: T.accentBg }}>
                {['Job', 'Item', 'Qty', 'Cost'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Cost' || h === 'Qty' ? 'right' : 'left', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {JOB_USAGE.map((u, i) => (
                <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                  style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '6px 10px', color: T.accent, fontWeight: '600' }}>{u.job}</td>
                  <td style={{ padding: '6px 10px', color: T.text, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.item}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: T.textSecondary }}>{u.qty}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', color: T.accent }}>${u.cost.toLocaleString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* count: barcode count view */}
      {scene === 'count' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ScanLine size={12} style={{ color: T.accent }} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Cycle Count — Jun 9</span>
            </div>
            {EXTENDED_INVENTORY.slice(0, 4).map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{item.name}</div>
                  <div style={{ fontSize: '8px', color: T.textMuted }}>{item.item_id} · {item.location}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>System</div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: T.textSecondary }}>{item.quantity}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>Counted</div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: i < 2 ? '#22c55e' : T.accent }}>
                      {i === 0 ? item.quantity : i === 1 ? item.quantity : i === 2 ? '2' : '—'}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {/* Scanner hint */}
          <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
            style={{ width: '130px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '14px' }}>
            <ScanLine size={26} style={{ color: T.accent }} />
            <div style={{ fontSize: '9px', color: T.textMuted, textAlign: 'center', lineHeight: '1.4' }}>Scan barcode to count. Works with any USB or Bluetooth scanner.</div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:    '1 · Inventory grid — quantity (green/amber/red), min threshold, location per item',
    reorder: '2 · Reorder alert — 2 items below threshold · one-click to order what you need',
    transfer:'3 · Transfer modal — move items from warehouse to truck, link to a job',
    costing: '4 · Material usage by job — every item pulled rolls into that job\'s cost',
    count:   '5 · Cycle count — scan barcode, system compares to counted quantity',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Inventory tracking works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
