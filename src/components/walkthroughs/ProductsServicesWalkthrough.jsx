// Products & Services walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, Edit2, Layers, UserCog, FileText, DollarSign, Tag,
  Image,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/products-services.js'

const PRODUCTS = [
  { sku: 'LED-2X4-40W',  name: '2x4 LED panel · 40W',   category: 'Lighting',  cost: 4.80, price: 14.00 },
  { sku: 'TUBE-LED-T8',  name: 'T8 LED tube · 4ft',     category: 'Lighting',  cost: 4.20, price: 12.00 },
  { sku: 'BRKT-2X4',     name: '2x4 mounting bracket',  category: 'Hardware',  cost: 1.20, price: 4.50 },
  { sku: 'LABOR-RETRO',  name: 'Retrofit labor · /hr',  category: 'Services',  cost: 32.00, price: 95.00 },
  { sku: 'WIRE-12-2',    name: '12-2 Romex · per foot', category: 'Hardware',  cost: 0.42, price: 1.20 },
]

export default function ProductsServicesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="The catalog every quote, job, and invoice draws from." />}
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
    <ZachShell title="Products & Services" subtitle="Catalog · BOMs · per-customer overrides" actionLabel="New Product" actionIcon={Package} filterChips={[{ icon: Tag, label: 'Lighting · Hardware · Services' }]}>
      {scene === 'catalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PRODUCTS.map((p, i) => (
            <motion.div key={p.sku} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 90px 70px 70px 70px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image size={14} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.name}</div>
                <div style={{ fontSize: 10, color: T.textMuted, fontFamily: 'monospace' }}>{p.sku}</div>
              </div>
              <Chip>{p.category}</Chip>
              <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'right' }}>cost ${p.cost.toFixed(2)}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textAlign: 'right' }}>${p.price.toFixed(2)}</div>
              <Chip color={T.successDark} bg={T.successBg}>{Math.round((1 - p.cost / p.price) * 100)}% m</Chip>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'edit' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 60, height: 60, borderRadius: 9, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Image size={24} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>2x4 LED panel · 40W</div>
              <div style={{ fontSize: 11, color: T.textMuted, fontFamily: 'monospace' }}>LED-2X4-40W</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Unit cost" value="$4.80" />
            <Field label="Unit price" value="$14.00" highlight />
            <Field label="Margin" value="66%" color={T.successDark} />
          </div>
          <div style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: 7, fontSize: 11, color: T.text }}>
            <strong>Description:</strong> 40W edge-lit LED flat panel · 4000K · 4800 lumens · DLC listed · 5-year warranty.
          </div>
          <div style={{ marginTop: 8, padding: 8, background: T.successBg, borderRadius: 6, fontSize: 11, color: T.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <DollarSign size={12} /> $9.20 gross per unit · drives quote-builder pricing
          </div>
        </div>
      )}

      {scene === 'bom' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Layers size={18} style={{ color: T.purple }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Kit · Bay LED Retrofit</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>One line on a quote · 4 components resolved</div>
            </div>
          </div>
          {[
            { name: '2x4 LED panel · 40W',  qty: 1, cost: 4.80, unitPrice: 14.00 },
            { name: 'T8 LED tube · 4ft',    qty: 4, cost: 4.20, unitPrice: 12.00 },
            { name: '2x4 mounting bracket', qty: 2, cost: 1.20, unitPrice: 4.50 },
            { name: '12-2 Romex · per foot', qty: 25, cost: 0.42, unitPrice: 1.20 },
          ].map((row, i) => (
            <motion.div key={row.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 70px 80px', gap: 10, padding: '6px 0', fontSize: 11, borderBottom: `1px dashed ${T.border}` }}>
              <div style={{ color: T.purple, fontWeight: 700 }}>{i + 1}.</div>
              <div style={{ color: T.text }}>{row.name}</div>
              <div style={{ color: T.textMuted, textAlign: 'right' }}>{row.qty}×</div>
              <div style={{ color: T.textMuted, textAlign: 'right' }}>${row.cost.toFixed(2)}</div>
              <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${(row.qty * row.unitPrice).toFixed(2)}</div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 10, background: T.purpleBg, borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.purple }}>Kit price (auto-rolled)</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.purple }}>$101.00</div>
          </motion.div>
        </div>
      )}

      {scene === 'override' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <UserCog size={18} style={{ color: T.accent }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Northbridge Industries · price overrides</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>Big account · 18% off on Lighting</div>
            </div>
          </div>
          {PRODUCTS.filter(p => p.category === 'Lighting').map((p, i) => {
            const override = +(p.price * 0.82).toFixed(2)
            return (
              <motion.div key={p.sku} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 30px 70px', gap: 10, padding: '8px 0', fontSize: 11, borderBottom: `1px dashed ${T.border}`, alignItems: 'center' }}>
                <div style={{ color: T.text, fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: T.textMuted, textDecoration: 'line-through', textAlign: 'right' }}>${p.price.toFixed(2)}</div>
                <div style={{ textAlign: 'center', color: T.accent }}>→</div>
                <div style={{ color: T.successDark, fontWeight: 800, textAlign: 'right' }}>${override.toFixed(2)}</div>
              </motion.div>
            )
          })}
          <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>
            Catalog cost stays the same · only price shifts · margin math stays honest
          </div>
        </div>
      )}

      {scene === 'use' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.successDark}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileText size={18} style={{ color: T.successDark }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Quote · EST-2147 · Northbridge</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>Type SKU · line drops in with the right cost + price</div>
            </div>
          </div>
          {[
            { sku: 'LED-2X4-40W', name: '2x4 LED panel · 40W', qty: 14, price: 11.48, total: 160.72 },
            { sku: 'TUBE-LED-T8', name: 'T8 LED tube · 4ft',   qty: 56, price: 9.84,  total: 551.04 },
            { sku: 'LABOR-RETRO', name: 'Retrofit labor · /hr', qty: 18, price: 95.00, total: 1710.00 },
          ].map((row, i) => (
            <motion.div key={row.sku} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 50px 70px 80px', gap: 10, padding: '6px 0', fontSize: 11, borderBottom: `1px dashed ${T.border}`, alignItems: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: T.accent, fontWeight: 700 }}>{row.sku}</div>
              <div style={{ color: T.text }}>{row.name}</div>
              <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>{row.qty}</div>
              <div style={{ color: T.textMuted, textAlign: 'right' }}>${row.price}</div>
              <div style={{ color: T.successDark, fontWeight: 800, textAlign: 'right' }}>${row.total.toLocaleString()}</div>
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
      <div style={{ fontSize: 14, fontWeight: 800, color: color || T.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    catalog:  '1. Full catalog · cost, price, margin per row',
    edit:     '2. Edit one · margin live · adjust without guessing',
    bom:      '3. Build a kit · one line resolves to N components',
    override: '4. Per-customer overrides · big accounts get the rate',
    use:      '5. Quote builder pulls right from here · auto-fills',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Seed once · everything flows from it'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
