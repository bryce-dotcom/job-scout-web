// Products & Services walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/ProductsServices.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Package, Plus, Search, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/products-services.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_PRODUCTS = [
  { id: 1, name: '48" LED Strip Fixture (Type A)',  sku: 'FIX-48A', unit_price: 350,   cost: 220, category: 'Fixture',    active: true },
  { id: 2, name: 'LED Driver — 100W',               sku: 'DRV-100', unit_price: 100,   cost: 58,  category: 'Component',  active: true },
  { id: 3, name: 'Installation Labor (per hr)',     sku: 'LAB-001', unit_price: 95,    cost: 65,  category: 'Labor',      active: true },
  { id: 4, name: 'LED Retrofit Kit — 2×4 Bay',     sku: 'KIT-2X4', unit_price: 1200,  cost: 740, category: 'Kit',        active: true },
  { id: 5, name: 'Warranty Extension — 5yr',       sku: 'WAR-5YR', unit_price: 250,   cost: 0,   category: 'Service',    active: false },
]

const CAT_COLORS = {
  'Fixture':   '#3b82f6',
  'Component': '#8b5cf6',
  'Labor':     '#22c55e',
  'Kit':       '#f97316',
  'Service':   '#f59e0b',
}

export default function ProductsServicesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Your catalog is ready." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const products = scene === 'empty' ? [] : MOCK_PRODUCTS.filter(p => scene !== 'active' || p.active)
  const showModal = scene === 'add'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Products & Services</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Product
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder="Search products and services..." style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
      </div>

      {/* Product grid */}
      {products.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}` }}>
          <Package size={36} style={{ color: T.textMuted, marginBottom: '10px' }} />
          <p style={{ color: T.textSecondary, fontSize: '12px', margin: 0 }}>No products yet. Add your first item.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {products.map((prod, i) => {
            const catColor = CAT_COLORS[prod.category] || '#6b7280'
            const margin = prod.cost > 0 ? Math.round(((prod.unit_price - prod.cost) / prod.unit_price) * 100) : null
            return (
              <motion.div key={prod.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: prod.active ? 1 : 0.55, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}
                style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.name}</div>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{prod.sku}</div>
                  </div>
                  <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: catColor + '18', color: catColor, flexShrink: 0, marginLeft: '4px' }}>{prod.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: T.accent }}>${prod.unit_price.toLocaleString()}</div>
                  {margin !== null && (
                    <div style={{ fontSize: '9px', color: '#22c55e', fontWeight: '600' }}>{margin}% margin</div>
                  )}
                </div>
                {prod.cost > 0 && (
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Cost: ${prod.cost}</div>
                )}
                {!prod.active && (
                  <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(107,114,128,0.12)', color: '#6b7280' }}>Inactive</span>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Add Product modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Product</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Name', '48" LED Strip Fixture (Type A)'], ['SKU', 'FIX-48A'], ['Unit Price', '$350.00'], ['Cost', '$220.00'], ['Category', 'Fixture']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              <div style={{ fontSize: '10px', color: '#22c55e', fontWeight: '600' }}>Margin: 37.1%</div>
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:  '1 · Products & Services — catalog page, Add Product button',
    add:    '2 · Add Product modal — name, SKU, unit price, cost, category · margin auto-calculated',
    grid:   '3 · Product cards — name, SKU, category chip, price, margin %, inactive dimmed',
    margin: '4 · Margin = (price − cost) / price — visible on every card',
    quote:  '5 · Products feed into the estimate line picker — type a name and it pre-fills',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to set up your catalog'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
