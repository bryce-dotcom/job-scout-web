// Lighting Audits walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/LightingAudits.jsx + src/lib/statusColors.js (auditStatusColors)
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, Plus, Search, User, Zap, DollarSign, TrendingDown, Camera, ChevronLeft, FileText, PenLine } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/lighting-audits.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// auditStatusColors from statusColors.js
const STATUS_COLORS = {
  'Draft':       { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'In Progress': { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Completed':   { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  'Submitted':   { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b' },
  'Approved':    { bg: 'rgba(22,163,74,0.12)',   text: '#16a34a' },
  'Rejected':    { bg: 'rgba(139,90,90,0.12)',   text: '#8b5a5a' },
}

const MOCK_AUDITS = [
  { id: 1, audit_id: 'AUD-0041', customer: 'Northbridge Logistics', city: 'Salt Lake City', state: 'UT', status: 'In Progress', utility: 'RMP Wattsmart', fixtures: 48, annual_kwh_savings: 42800, rebate: 8400, date: 'Jun 5' },
  { id: 2, audit_id: 'AUD-0038', customer: 'Solera Electric HQ',    city: 'Draper',         state: 'UT', status: 'Submitted',   utility: 'SRP Solutions', fixtures: 32, annual_kwh_savings: 28600, rebate: 5900, date: 'Jun 2' },
  { id: 3, audit_id: 'AUD-0035', customer: 'Apex Solar Warehouse',  city: 'Phoenix',        state: 'AZ', status: 'Approved',    utility: 'APS Bright',   fixtures: 64, annual_kwh_savings: 61200, rebate: 14800, date: 'May 28' },
  { id: 4, audit_id: 'AUD-0032', customer: 'City Storage Units',    city: 'Ogden',          state: 'UT', status: 'Draft',       utility: 'RMP Wattsmart', fixtures: 0, annual_kwh_savings: 0, rebate: 0, date: 'May 24' },
]

export default function LightingAuditsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Every rebate captured." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

const AUDIT = MOCK_AUDITS[0]

const AUDIT_AREAS = [
  { name: 'Main Bay — Aisle A',  fixtures: 42, type: '400W Metal Halide',   photo: true  },
  { name: 'Main Bay — Aisle B',  fixtures: 42, type: '400W Metal Halide',   photo: true  },
  { name: 'Loading Dock',        fixtures: 18, type: '250W High Pressure Sodium', photo: false },
  { name: 'Office Mezzanine',    fixtures: 12, type: 'T8 Fluorescent (4-lamp)', photo: false },
]

const CATALOG_RESULTS = [
  { existing: '400W Metal Halide Highbay', qty: 84, watts: 400, proposed: '150W LED Highbay', proposedWatts: 150, savingsPct: 63 },
  { existing: '250W HPS Wallpack',         qty: 18, watts: 250, proposed: '80W LED Wallpack',  proposedWatts: 80,  savingsPct: 68 },
  { existing: 'T8 Fluorescent 4-lamp',     qty: 12, watts: 128, proposed: '36W LED Troffer',   proposedWatts: 36,  savingsPct: 72 },
]

const REBATE_ROWS = [
  { measure: 'LED Highbay ≥ 100W',  qty: 84, ratePerFixture: 75,  total: 6300 },
  { measure: 'LED Wallpack ≥ 40W',  qty: 18, ratePerFixture: 45,  total: 810  },
  { measure: 'LED Troffer ≥ 30W',   qty: 12, ratePerFixture: 25,  total: 300  },
  { measure: 'Bonus: Utility Rebate',qty: 1,  ratePerFixture: 990, total: 990  },
]

function Stage({ scene }) {
  const isDetail = scene !== 'walk'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          {isDetail && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: T.textMuted, fontSize: '10px', cursor: 'pointer' }}><ChevronLeft size={12} />Audits</div>}
          {!isDetail && <ClipboardList size={14} style={{ color: T.accent }} />}
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>
            {isDetail ? AUDIT.customer : 'Lighting Audits'}
          </span>
          {isDetail && (
            <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: STATUS_COLORS['In Progress'].bg, color: STATUS_COLORS['In Progress'].text }}>In Progress</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {isDetail && (
            <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>
              <Camera size={9} />Add Area
            </button>
          )}
          {!isDetail && (
            <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>
              <Plus size={9} />New Audit
            </button>
          )}
        </div>
      </div>

      {/* walk: audit list */}
      {scene === 'walk' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {[
              { label: 'Total Fixtures',   value: '144',            color: '#3b82f6' },
              { label: 'kWh/yr Savings',   value: '132,600',        color: '#22c55e' },
              { label: 'Total Rebates',    value: '$29,100',        color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, padding: '6px 9px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px' }}>
                <div style={{ fontSize: '8px', color: T.textMuted, marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {MOCK_AUDITS.map((audit, i) => {
            const sc = STATUS_COLORS[audit.status] || STATUS_COLORS['Draft']
            return (
              <motion.div key={audit.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{audit.customer}</span>
                      <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>{audit.status}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: T.textMuted }}>{audit.audit_id} · {audit.city}, {audit.state}</div>
                  </div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{audit.date}</div>
                </div>
                {audit.rebate > 0 && (
                  <div style={{ display: 'flex', gap: '10px', fontSize: '9px', flexWrap: 'wrap' }}>
                    <span style={{ color: T.textSecondary }}><Zap size={9} style={{ color: T.accent, display: 'inline', marginRight: '2px' }} />{audit.utility}</span>
                    <span style={{ color: '#3b82f6' }}>{audit.fixtures} fixtures</span>
                    <span style={{ color: '#22c55e' }}>{audit.annual_kwh_savings.toLocaleString()} kWh/yr saved</span>
                    <span style={{ color: '#f59e0b', fontWeight: '600' }}>${audit.rebate.toLocaleString()} rebate</span>
                  </div>
                )}
              </motion.div>
            )
          })}
          </div>
        </div>
      )}

      {/* snap: audit detail with areas + photo zone */}
      {scene === 'snap' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ fontSize: '10px', color: T.textMuted }}>AUD-0041 · Salt Lake City, UT · RMP Wattsmart</div>
          {/* Add area photo zone */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '14px', border: `2px dashed ${T.accent}`, borderRadius: '10px', backgroundColor: T.accentBg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', cursor: 'pointer', flexShrink: 0 }}>
            <Camera size={20} style={{ color: T.accent }} />
            <span style={{ fontSize: '10px', fontWeight: '600', color: T.accent }}>Snap or upload area photo</span>
            <span style={{ fontSize: '9px', color: T.textMuted }}>Lenard reads fixtures, watts, and lamp count</span>
          </motion.div>
          {/* Existing areas */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {AUDIT_AREAS.slice(0, 2).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{a.name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>{a.type}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: T.accent }}>{a.fixtures} fixtures</span>
                  <Camera size={10} style={{ color: '#22c55e' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* catalog: AI fixture results table */}
      {scene === 'catalog' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ padding: '7px 10px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <Zap size={11} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '500' }}>Lenard identified 114 fixtures across 4 areas — in 40 seconds</span>
          </motion.div>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ backgroundColor: T.accentBg }}>
                  {['Existing Fixture', 'Qty', 'Watts', 'Proposed LED', 'New W', 'Savings'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Qty' || h === 'Watts' || h === 'New W' || h === 'Savings' ? 'right' : 'left', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATALOG_RESULTS.map((r, i) => (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
                    style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '7px 8px', color: T.text, fontWeight: '500' }}>{r.existing}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: T.textSecondary }}>{r.qty}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: T.textMuted }}>{r.watts}W</td>
                    <td style={{ padding: '7px 8px', color: T.accent, fontWeight: '600' }}>{r.proposed}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: T.textSecondary }}>{r.proposedWatts}W</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                      <span style={{ padding: '2px 5px', borderRadius: '4px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: '700' }}>{r.savingsPct}%</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* rebate: rebate calculation panel */}
      {scene === 'rebate' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>RMP Wattsmart — Prescriptive Rebate Calculation</div>
          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: T.accentBg }}>
                  {['Measure', 'Qty', '$/Fixture', 'Total'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Total' || h === 'Qty' || h === '$/Fixture' ? 'right' : 'left', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REBATE_ROWS.map((r, i) => (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.07 }}
                    style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '7px 10px', color: T.text }}>{r.measure}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: T.textSecondary }}>{r.qty}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: T.textSecondary }}>${r.ratePerFixture}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: '#f59e0b' }}>${r.total.toLocaleString()}</td>
                  </motion.tr>
                ))}
                <tr style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderTop: `2px solid ${T.border}` }}>
                  <td colSpan={3} style={{ padding: '8px 10px', fontWeight: '700', color: T.text }}>Total Customer Rebate</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '14px', fontWeight: '800', color: '#f59e0b' }}>
                    ${REBATE_ROWS.reduce((s, r) => s + r.total, 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* proposal: proposal generation view */}
      {scene === 'proposal' && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '12px', flex: 1, overflow: 'auto' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: T.text, marginBottom: '10px' }}>LED Retrofit Proposal — Northbridge Logistics</div>
            {[
              { label: 'Total Fixtures', value: '114' },
              { label: 'Est. Project Cost', value: '$54,200' },
              { label: 'Utility Rebate', value: '$8,400', color: '#f59e0b' },
              { label: 'Net Customer Cost', value: '$45,800', color: T.accent },
              { label: 'Annual kWh Savings', value: '42,800 kWh', color: '#22c55e' },
              { label: 'Annual $ Savings', value: '$5,136 / yr', color: '#22c55e' },
              { label: 'Simple Payback', value: '8.9 years', color: '#3b82f6' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${T.border}`, fontSize: '10px' }}>
                <span style={{ color: T.textMuted }}>{f.label}</span>
                <span style={{ color: f.color || T.text, fontWeight: '600' }}>{f.value}</span>
              </div>
            ))}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: T.accentBg, border: `1px solid ${T.accent}`, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <PenLine size={14} style={{ color: T.accent }} />
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Customer signature</div>
                <div style={{ fontSize: '9px', color: T.textMuted }}>Tap to sign · IP + timestamp logged for ESIGN compliance</div>
              </div>
              <button style={{ marginLeft: 'auto', padding: '5px 12px', border: 'none', borderRadius: '6px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', fontWeight: '600', cursor: 'pointer' }}>Sign Now</button>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    walk:     '1 · Audit list — customer, status, utility, fixtures, kWh savings, rebate $',
    snap:     '2 · Snap an area — Lenard reads fixture make, wattage, and lamp count from the photo',
    catalog:  '3 · AI catalog — 114 fixtures in 40 seconds · existing → proposed LED + savings %',
    rebate:   '4 · Rebate math — RMP prescriptive table · $8,400 total customer rebate calculated',
    proposal: '5 · One-tap proposal — payback period, rebate, net cost · customer signs on-screen',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Lighting Audits work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
