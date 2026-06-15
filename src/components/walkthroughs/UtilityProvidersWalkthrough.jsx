// Utility Providers walkthrough — provider grid, detail, rate schedules, and linked programs.
// Source: src/lib/featureKnowledge/utility-providers.js

import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Search, MapPin, ChevronRight, ExternalLink, FileText, DollarSign, CheckCircle, XCircle, Clock, BarChart2, ChevronLeft } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/utility-providers.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const PROVIDERS = [
  { id: 1, code: 'SRP',  name: 'SRP',               full: 'Salt River Project',    state: 'AZ', programs: 3, color: '#e97316', rateSchedule: 'TOU-E, GS, LGS' },
  { id: 2, code: 'RMP',  name: 'RMP',               full: 'Rocky Mountain Power',  state: 'UT', programs: 2, color: '#3b82f6', rateSchedule: 'Res-1, Com-1' },
  { id: 3, code: 'APS',  name: 'APS',               full: 'Arizona Public Service', state: 'AZ', programs: 4, color: '#ef4444', rateSchedule: 'TOU-2, E-20' },
  { id: 4, code: 'PC',   name: 'PacifiCorp',        full: 'PacifiCorp',             state: 'UT', programs: 2, color: '#8b5cf6', rateSchedule: 'Schedule 1, 23' },
  { id: 5, code: 'PGE',  name: "PG&E",              full: 'Pacific Gas & Electric', state: 'CA', programs: 5, color: '#f59e0b', rateSchedule: 'E-TOU-C, A-6' },
  { id: 6, code: 'RMP2', name: 'Rocky Mtn Power',  full: 'Rocky Mountain Power',   state: 'ID', programs: 1, color: '#06b6d4', rateSchedule: 'Schedule 1' },
]

const SRP_PROGRAMS = [
  { id: 1, name: 'SRP Custom Incentive',    updated: 'May 14, 2026', status: 'Active'  },
  { id: 2, name: 'SRP Prescriptive Rebate', updated: 'Apr 2, 2026',  status: 'Active'  },
  { id: 3, name: 'SRP EV Charging',         updated: 'Jan 9, 2026',  status: 'Expired' },
]

const SRP_RATES = [
  { schedule: 'Residential TOU', peak: '0.1384', offPeak: '0.0781', effective: 'Mar 1, 2026', source: 'srp.net/rates/tou-e' },
  { schedule: 'Commercial GS',   peak: '0.1542', offPeak: '0.0892', effective: 'Mar 1, 2026', source: 'srp.net/rates/gs' },
  { schedule: 'Large Commercial', peak: '0.1703', offPeak: '0.0944', effective: 'Mar 1, 2026', source: 'srp.net/rates/lcs' },
]

const LINKED_PROGRAMS = [
  { id: 1, name: 'SRP Custom Incentive',    measure: 'Lighting', status: 'Active',  budget: '$124,000', expiry: 'Dec 31, 2026', topPick: true  },
  { id: 2, name: 'SRP Prescriptive Rebate', measure: 'Lighting', status: 'Active',  budget: '$58,400',  expiry: 'Sep 30, 2026', topPick: false },
  { id: 3, name: 'SRP HVAC Rebate',         measure: 'HVAC',     status: 'Active',  budget: '$31,200',  expiry: 'Dec 31, 2026', topPick: false },
  { id: 4, name: 'SRP EV Charging',         measure: 'Lighting', status: 'Expired', budget: '$0',       expiry: 'Jan 31, 2026', topPick: false },
]

const STATUS_PILL = {
  Active:  { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
  Expired: { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444' },
}

export default function UtilityProvidersWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Rebates on tap." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function ProviderIcon({ code, color, size = 28 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '6px', backgroundColor: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${color}30` }}>
      <Zap size={size * 0.45} style={{ color }} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>

      {scene === 'list' && <ListScene />}
      {scene === 'detail' && <DetailScene />}
      {scene === 'rates' && <RatesScene />}
      {scene === 'programs' && <ProgramsScene />}

    </div>
  )
}

function ListScene() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Utility Providers</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>6 providers</span>
        </div>
        <button style={{ padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>+ Add Provider</button>
      </div>

      <div style={{ display: 'flex', gap: '7px', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 9px', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
          <Search size={11} style={{ color: T.textMuted }} />
          <span style={{ fontSize: '10px', color: T.textMuted }}>Search providers…</span>
        </div>
        {['AZ', 'UT', 'CA', 'ID'].map(st => (
          <div key={st} style={{ padding: '5px 10px', backgroundColor: st === 'AZ' ? T.accentBg : T.bgCard, border: `1px solid ${st === 'AZ' ? T.accent : T.border}`, borderRadius: '6px', fontSize: '9px', fontWeight: '600', color: st === 'AZ' ? T.accent : T.textMuted, cursor: 'pointer' }}>{st}</div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px', alignContent: 'start', overflowY: 'auto' }}>
        {PROVIDERS.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <ProviderIcon code={p.code} color={p.color} size={26} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: '8px', color: T.textMuted, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', backgroundColor: T.accentBg, borderRadius: '4px' }}>
                <MapPin size={8} style={{ color: T.accent }} />
                <span style={{ fontSize: '8px', fontWeight: '600', color: T.accent }}>{p.state}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '9px', color: T.textMuted }}>{p.programs} programs</span>
              <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>{p.programs > 0 ? 'Active' : 'None'}</span>
            </div>
            <div style={{ fontSize: '8px', color: T.textMuted, borderTop: `1px solid ${T.border}`, paddingTop: '5px' }}>{p.rateSchedule}</div>
          </motion.div>
        ))}
      </div>
    </>
  )
}

function DetailScene() {
  const srp = PROVIDERS[0]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: T.textMuted, fontSize: '10px', cursor: 'pointer' }}>
          <ChevronLeft size={12} />Providers
        </div>
        <ProviderIcon code={srp.code} color={srp.color} size={28} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>SRP · Salt River Project</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 7px', backgroundColor: T.accentBg, borderRadius: '5px' }}>
              <MapPin size={9} style={{ color: T.accent }} />
              <span style={{ fontSize: '9px', fontWeight: '600', color: T.accent }}>AZ</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
        <div style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '8px' }}>Utility Contact</div>
            {[['Rep', 'Jordan Mills'], ['Phone', '(602) 236-8888'], ['Email', 'jmills@srpnet.com']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${T.border}`, fontSize: '9px' }}>
                <span style={{ color: T.textMuted }}>{l}</span>
                <span style={{ color: T.text, fontWeight: '500', textAlign: 'right', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '7px' }}>Summary</div>
            {[['Programs', '3 active'], ['Rate schedules', '3 tiers'], ['Last updated', 'May 14, 2026']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${T.border}`, fontSize: '9px' }}>
                <span style={{ color: T.textMuted }}>{l}</span>
                <span style={{ color: T.text, fontWeight: '500' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden' }}>
          <div style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>Active Programs</span>
            <span style={{ fontSize: '9px', color: T.textMuted }}>3 total</span>
          </div>
          {SRP_PROGRAMS.map((prog, i) => {
            const ss = STATUS_PILL[prog.status]
            return (
              <motion.div key={prog.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{prog.name}</div>
                  <div style={{ fontSize: '9px', color: T.textMuted }}>Updated {prog.updated}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: ss.bg, color: ss.text }}>{prog.status}</span>
                  <ChevronRight size={11} style={{ color: T.textMuted }} />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function RatesScene() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: T.textMuted, fontSize: '10px', cursor: 'pointer' }}>
          <ChevronLeft size={12} />SRP
        </div>
        <BarChart2 size={14} style={{ color: T.accent }} />
        <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Rate Schedules</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Salt River Project · AZ</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
        style={{ padding: '8px 12px', backgroundColor: T.accentBg, border: `1px solid ${T.accent}40`, borderRadius: '8px', fontSize: '9px', color: T.textSecondary, flexShrink: 0 }}>
        <span style={{ fontWeight: '600', color: T.accent }}>Lenard uses these rates</span> to calculate kWh savings, payback period, and energy cost reduction for each lighting audit — all without you entering numbers manually.
      </motion.div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Rate Schedule', 'Peak $/kWh', 'Off-Peak $/kWh', 'Effective Date', 'Source URL'].map(h => (
                <th key={h} style={{ padding: '7px 11px', textAlign: 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SRP_RATES.map((r, i) => (
              <motion.tr key={i} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '9px 11px', fontWeight: '600', color: T.text }}>{r.schedule}</td>
                <td style={{ padding: '9px 11px' }}>
                  <span style={{ padding: '2px 7px', borderRadius: '5px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: '700', fontSize: '10px' }}>${r.peak}</span>
                </td>
                <td style={{ padding: '9px 11px' }}>
                  <span style={{ padding: '2px 7px', borderRadius: '5px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: '700', fontSize: '10px' }}>${r.offPeak}</span>
                </td>
                <td style={{ padding: '9px 11px', color: T.textMuted }}>{r.effective}</td>
                <td style={{ padding: '9px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6', fontSize: '9px' }}>
                    <ExternalLink size={9} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{r.source}</span>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '7px' }}>
          <FileText size={10} style={{ color: T.textMuted }} />
          <span style={{ fontSize: '9px', color: T.textMuted }}>Rates sourced from official tariff filings. Last verified May 14, 2026.</span>
          <button style={{ marginLeft: 'auto', padding: '4px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textMuted, fontSize: '9px', cursor: 'pointer' }}>Update from PDF</button>
        </div>
      </div>
    </>
  )
}

function ProgramsScene() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: T.textMuted, fontSize: '10px', cursor: 'pointer' }}>
          <ChevronLeft size={12} />SRP
        </div>
        <DollarSign size={14} style={{ color: T.accent }} />
        <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Linked Programs</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Salt River Project · 4 programs</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
        style={{ padding: '7px 12px', backgroundColor: 'rgba(90,99,73,0.07)', border: `1px solid ${T.accent}35`, borderRadius: '7px', fontSize: '9px', color: T.textSecondary, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
        <Zap size={10} style={{ color: T.accent }} />
        <span><span style={{ fontWeight: '600', color: T.accent }}>Lenard auto-selects</span> the highest-value applicable program for each audit based on measure type and remaining budget.</span>
      </motion.div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {LINKED_PROGRAMS.map((prog, i) => {
          const ss = STATUS_PILL[prog.status]
          return (
            <motion.div key={prog.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${prog.topPick ? T.accent : T.border}`, borderRadius: '9px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', outline: prog.topPick ? `2px solid ${T.accent}` : 'none', outlineOffset: '-1px' }}>
              {prog.topPick && (
                <div style={{ width: '4px', alignSelf: 'stretch', borderRadius: '4px', backgroundColor: T.accent, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: T.text }}>{prog.name}</span>
                  {prog.topPick && <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: '700', backgroundColor: T.accent, color: '#fff' }}>TOP PICK</span>}
                  <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: ss.bg, color: ss.text }}>{prog.status}</span>
                </div>
                <div style={{ display: 'flex', gap: '14px', fontSize: '9px', color: T.textMuted }}>
                  <span>Measure: <span style={{ color: T.text, fontWeight: '500' }}>{prog.measure}</span></span>
                  <span>Budget remaining: <span style={{ color: prog.status === 'Expired' ? '#ef4444' : '#22c55e', fontWeight: '600' }}>{prog.budget}</span></span>
                  <span>Expires: <span style={{ color: T.textSecondary }}>{prog.expiry}</span></span>
                </div>
              </div>
              <button style={{ padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.accent, fontSize: '9px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                View Program <ChevronRight size={10} />
              </button>
            </motion.div>
          )
        })}
      </div>
    </>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:     '1 · Provider grid — 6 utilities across AZ, UT, CA, ID · filter by state · program count per card',
    detail:   '2 · SRP detail — contact rep, phone, email · 3 rebate programs with status and last-updated date',
    rates:    '3 · Rate schedules — peak vs off-peak $/kWh · Lenard pulls these for energy savings calculations',
    programs: '4 · Linked programs — budget remaining, measure type, expiry · Lenard auto-picks highest-value',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Utility Providers work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
