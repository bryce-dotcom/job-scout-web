// Products & Services walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/ProductsServices.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Package, Plus, Search, X, Layers, UserCheck, Link } from 'lucide-react'
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

const KIT_COMPONENTS = [
  { name: '48" LED Strip Fixture', qty: 1, cost: 220 },
  { name: 'LED Driver — 100W',     qty: 2, cost: 116 },
  { name: 'Mounting Brackets',     qty: 4, cost: 28  },
  { name: '14-gauge Wire (25ft)',   qty: 1, cost: 18  },
]

const CUSTOMER_OVERRIDES = [
  { customer: 'Northbridge Logistics', discount: '18%', note: 'Volume account' },
  { customer: 'Apex Solar',            discount: '12%', note: 'Multi-site contract' },
]

function ProductCard({ prod, highlight }) {
  const catColor = CAT_COLORS[prod.category] || '#6b7280'
  const margin = prod.cost > 0 ? Math.round(((prod.unit_price - prod.cost) / prod.unit_price) * 100) : null
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: prod.active ? 1 : 0.55, y: 0 }} transition={{ duration: 0.2 }}
      style={{ backgroundColor: T.bgCard, border: `1px solid ${highlight ? T.accent : T.border}`, borderRadius: '9px', padding: '10px', cursor: 'pointer', outline: highlight ? `2px solid ${T.accent}` : 'none', outlineOffset: '-1px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '5px' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.name}</div>
          <div style={{ fontSize: '9px', color: T.textMuted }}>{prod.sku}</div>
        </div>
        <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: catColor + '18', color: catColor, flexShrink: 0, marginLeft: '4px' }}>{prod.category}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: T.accent }}>${prod.unit_price.toLocaleString()}</div>
        {margin !== null && <div style={{ fontSize: '9px', color: '#22c55e', fontWeight: '600' }}>{margin}% margin</div>}
      </div>
      {prod.cost > 0 && <div style={{ fontSize: '9px', color: T.textMuted }}>Cost: ${prod.cost}</div>}
      {!prod.active && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(107,114,128,0.12)', color: '#6b7280' }}>Inactive</span>}
    </motion.div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Products & Services</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Product
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Search size={11} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <input readOnly placeholder={scene === 'quote' ? 'FIX-48A' : 'Search products and services...'} style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px 5px 20px', border: `1px solid ${scene === 'quote' ? T.accent : T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none' }} />
        {scene === 'quote' && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '0 0 6px 6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            {MOCK_PRODUCTS.slice(0, 2).map(p => (
              <div key={p.id} style={{ padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{p.sku}</div>
                </div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent }}>${p.unit_price}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* catalog / quote: full grid */}
      {(scene === 'catalog' || scene === 'quote') && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
          {MOCK_PRODUCTS.map(prod => <ProductCard key={prod.id} prod={prod} />)}
        </div>
      )}

      {/* edit: modal overlay */}
      {scene === 'edit' && (
        <>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto', opacity: 0.35 }}>
            {MOCK_PRODUCTS.map(prod => <ProductCard key={prod.id} prod={prod} />)}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '270px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Edit Product</span>
                <X size={13} style={{ color: T.textMuted }} />
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {[['Name', '48" LED Strip Fixture (Type A)'], ['SKU', 'FIX-48A'], ['Unit Price', '$350.00'], ['Cost', '$220.00'], ['Category', 'Fixture']].map(([l, v]) => (
                  <div key={l}>
                    <label style={{ display: 'block', fontSize: '9px', fontWeight: '500', color: T.textSecondary, marginBottom: '2px' }}>{l}</label>
                    <div style={{ padding: '5px 8px', border: `1px solid ${l === 'Unit Price' ? T.accent : T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text, fontWeight: l === 'Unit Price' ? '600' : '400' }}>{v}</div>
                  </div>
                ))}
                <div style={{ padding: '6px 8px', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: '6px', border: '1px solid rgba(34,197,94,0.25)', fontSize: '10px', color: '#22c55e', fontWeight: '600' }}>Margin: 37.1% — live as you type</div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                  <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}

      {/* kit: grid with kit card highlighted + BOM breakdown */}
      {scene === 'kit' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
            {MOCK_PRODUCTS.map(prod => <ProductCard key={prod.id} prod={prod} highlight={prod.category === 'Kit'} />)}
          </div>
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            style={{ width: '180px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px', flexShrink: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
              <Layers size={12} style={{ color: T.accent }} />
              <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Kit BOM</span>
            </div>
            {KIT_COMPONENTS.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: '9px', color: T.text, fontWeight: '500' }}>{c.name}</div>
                  <div style={{ fontSize: '8px', color: T.textMuted }}>×{c.qty}</div>
                </div>
                <div style={{ fontSize: '9px', color: T.textSecondary }}>${c.cost}</div>
              </div>
            ))}
            <div style={{ marginTop: '7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>Total cost</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: T.accent }}>${KIT_COMPONENTS.reduce((s, c) => s + c.cost, 0)}</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* override: grid + customer price override panel */}
      {scene === 'override' && (
        <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
            {MOCK_PRODUCTS.map(prod => <ProductCard key={prod.id} prod={prod} />)}
          </div>
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            style={{ width: '190px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
              <UserCheck size={12} style={{ color: T.accent }} />
              <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Customer Overrides</span>
            </div>
            {CUSTOMER_OVERRIDES.map((o, i) => (
              <div key={i} style={{ padding: '8px', backgroundColor: T.bg, borderRadius: '7px', border: `1px solid ${T.border}`, marginBottom: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{o.customer}</div>
                <div style={{ fontSize: '9px', color: T.textMuted, marginBottom: '4px' }}>{o.note}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#3b82f6' }}>{o.discount} off</span>
                  <span style={{ fontSize: '8px', color: T.textMuted }}>all products</span>
                </div>
              </div>
            ))}
            <button style={{ width: '100%', padding: '6px', border: `1px dashed ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textMuted, fontSize: '9px', cursor: 'pointer' }}>+ Add override</button>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    catalog:  '1 · Full catalog — every product and service, SKU, price, margin, category chip',
    edit:     '2 · Edit product — cost $220, price $350, margin shows live at 37%',
    kit:      '3 · Kit BOM — "Bay LED Retrofit" bundles fixture + drivers + brackets + wire, cost rolls up',
    override: '4 · Per-customer overrides — Northbridge gets 18% off, Apex Solar 12% · auto-applies to quotes',
    quote:    '5 · Quote builder pulls from here — type SKU, line drops in with price and cost pre-filled',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to set up your catalog'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
