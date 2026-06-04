// Sales Pipeline walkthrough — rebuilt to Prospect Scout standard.
// Source of truth: src/pages/SalesPipeline.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, Settings, Plus, ChevronRight,
  Phone, Calendar, X, Trophy,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/sales-pipeline.js'

// ─── Theme ─────────────────────────────────────────────────────────────────
const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
}

// ─── defaultStages from SalesPipeline.jsx lines 40-59 ─────────────────────
const SALES_STAGES = [
  { id: 'New',             name: 'New',           color: '#3b82f6' },
  { id: 'Contacted',       name: 'Contacted',     color: '#8b5cf6' },
  { id: 'Appointment Set', name: 'Scheduled',     color: '#22c55e' },
  { id: 'Qualified',       name: 'Qualified',     color: '#3b82f6' },
  { id: 'Quote Sent',      name: 'Estimate Sent', color: '#8b5cf6' },
  { id: 'Negotiation',     name: 'Negotiation',   color: '#f59e0b' },
  { id: 'Won',             name: 'Won',           color: '#10b981', isWon: true },
  { id: 'Lost',            name: 'Lost',          color: '#64748b', isLost: true },
]

const DELIVERY_STAGES = [
  { id: 'Chillin',      name: 'Chillin',      color: '#94a3b8' },
  { id: 'Scheduled',    name: 'Job Scheduled',color: '#0ea5e9' },
  { id: 'In Progress',  name: 'In Progress',  color: '#f97316' },
  { id: 'Job Complete', name: 'Job Complete', color: '#22c55e' },
  { id: 'Invoiced',     name: 'Invoiced',     color: '#8b5cf6' },
  { id: 'Paid',         name: 'Paid',         color: '#16a34a' },
  { id: 'Closed',       name: 'Closed',       color: '#6b7280' },
]

// Mock data keyed by stage id
const STAGE_DATA = {
  'New':             { count: 3, value: 0,      leads: [
    { id: 1, customer_name: 'Brady Marsh',    business_name: 'Peak Windows',          phone: '(801) 555-0142', lead_source: 'Referral',   amount: 0 },
    { id: 2, customer_name: 'Elena Bates',    business_name: null,                    phone: '(801) 555-0283', lead_source: 'Web Form',   amount: 0 },
    { id: 3, customer_name: 'Tom Bradley',    business_name: 'Bradley Roofing',       phone: '(801) 555-0317', lead_source: 'Cold Call',  amount: 0 },
  ]},
  'Contacted':       { count: 2, value: 12000, leads: [
    { id: 4, customer_name: 'Ryan Torres',    business_name: 'Apex Solar',            phone: '(801) 555-0094', lead_source: 'Referral',   amount: 12000 },
    { id: 5, customer_name: 'Linda Pierce',   business_name: null,                    phone: '(801) 555-0415', lead_source: 'Door Knock', amount: 0 },
  ]},
  'Appointment Set': { count: 2, value: 0,      leads: [
    { id: 6, customer_name: 'Marcus Okafor',  business_name: 'Northbridge Logistics', phone: '(801) 555-0371', lead_source: 'Referral',   amount: 0, appointment_time: 'Jun 10' },
    { id: 7, customer_name: 'Sarah Chen',     business_name: 'Cypress Roofing',       phone: '(801) 555-0118', lead_source: 'Web Form',   amount: 0, appointment_time: 'Jun 12' },
  ]},
  'Qualified':       { count: 1, value: 24500, leads: [
    { id: 8, customer_name: 'David Kim',      business_name: 'Solera Electric',       phone: '(801) 555-0422', lead_source: 'Lenard-SRP', amount: 24500 },
  ]},
  'Quote Sent':      { count: 1, value: 18200, leads: [
    { id: 9, customer_name: 'Jennifer Walsh', business_name: 'Walsh Industries',      phone: '(801) 555-0509', _quoteName: 'EST-047',     amount: 18200 },
  ]},
  'Negotiation':     { count: 0, value: 0,      leads: [] },
  'Won':             { count: 3, value: 48200,  leads: [] },
  'Lost':            { count: 1, value: 0,      leads: [] },
}

const DELIVERY_DATA = {
  'Chillin':      { count: 2, value: 0 },
  'Scheduled':    { count: 3, value: 32000 },
  'In Progress':  { count: 2, value: 28000 },
  'Job Complete': { count: 1, value: 14500 },
  'Invoiced':     { count: 1, value: 18200 },
  'Paid':         { count: 1, value: 12400 },
  'Closed':       { count: 0, value: 0 },
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function SalesPipelineWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: T.bg, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist
                title={`Set it up in ${card.setup.steps.length} steps`}
                steps={card.setup.steps}
                currentIdx={setupIdx}
              />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="Your pipeline is live." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage dispatcher ──────────────────────────────────────────────────────
function Stage({ scene }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      fontSize: '11px', fontFamily: 'system-ui, sans-serif',
      color: T.text, backgroundColor: T.bg, overflow: 'hidden',
    }}>
      <PageHeader />
      <div style={{ flex: 1, overflow: 'hidden', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
        <SalesSection scene={scene} />
        <DeliverySection scene={scene} />
        {scene === 'won' && <WonModal />}
      </div>
    </div>
  )
}

// ─── Page header — mirrors SalesPipeline.jsx lines 1182-1414 ──────────────
function PageHeader() {
  return (
    <div style={{
      backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`,
      padding: '7px 12px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px',
    }}>
      {/* Title + subtitle */}
      <div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Sales Pipeline</div>
        <div style={{ fontSize: '9px', color: T.textMuted }}>Track leads through the sales process. Drag to move between stages.</div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={10} style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <input readOnly placeholder="Search leads..." style={{ padding: '3px 7px 3px 20px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text, outline: 'none', width: '130px' }} />
        </div>

        {/* Stats strip — lines 1231-1257 */}
        <div style={{
          display: 'flex', gap: '10px', padding: '4px 10px',
          backgroundColor: T.bgCard, borderRadius: '6px', border: `1px solid ${T.border}`,
          alignItems: 'center',
        }}>
          {[
            { label: 'Sales Won', value: '$48.2k', sublabel: '6 jobs', color: '#16a34a' },
            { label: 'Active',    value: '9',      sublabel: null,     color: null },
            { label: 'Won',       value: '3',      sublabel: null,     color: '#22c55e' },
            { label: 'Pipeline',  value: '$127k',  sublabel: null,     color: null },
          ].map((stat, i) => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {i > 0 && <div style={{ width: '1px', height: '22px', backgroundColor: T.border }} />}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: stat.color || T.text }}>{stat.value}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{stat.label}</div>
                {stat.sublabel && <div style={{ fontSize: '8px', color: T.textMuted }}>{stat.sublabel}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Date range toggle — lines 1259-1284 */}
        <div style={{ display: 'flex', gap: '1px', backgroundColor: T.bgCard, borderRadius: '5px', border: `1px solid ${T.border}`, padding: '2px' }}>
          {['MTD','YTD','30d','90d','All'].map(opt => (
            <button key={opt} style={{
              padding: '2px 6px', fontSize: '9px',
              fontWeight: opt === 'MTD' ? '600' : '400',
              backgroundColor: opt === 'MTD' ? T.accent : 'transparent',
              color: opt === 'MTD' ? '#fff' : T.textMuted,
              border: 'none', borderRadius: '4px', cursor: 'pointer',
            }}>{opt}</button>
          ))}
        </div>

        {/* Owner filter */}
        <select style={{ padding: '3px 7px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: T.bgCard, color: T.text }}>
          <option>All Owners</option>
        </select>

        {/* Icon buttons */}
        {[RefreshCw, Settings].map((Icon, i) => (
          <button key={i} style={{ padding: '4px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Icon size={12} />
          </button>
        ))}

        <button style={{ padding: '3px 9px', border: `1px solid ${T.border}`, borderRadius: '5px', fontSize: '10px', backgroundColor: 'transparent', color: T.textSecondary, cursor: 'pointer' }}>List View</button>
        <button style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 9px', border: 'none', borderRadius: '5px', fontSize: '10px', fontWeight: '500', backgroundColor: T.accent, color: '#fff', cursor: 'pointer' }}>
          <Plus size={10} />Add Lead
        </button>
      </div>
    </div>
  )
}

// ─── Sales section — mirrors lines 1825-1988 ──────────────────────────────
function SalesSection({ scene }) {
  const expanded = scene === 'board' || scene === 'drag' || scene === 'won'
  const dragTarget = scene === 'drag' ? 'Quote Sent' : null
  const draggingId = scene === 'drag' ? 8 : null   // David Kim dragging to Estimate Sent

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderRadius: '6px', border: `1px solid ${T.border}`,
      overflow: 'hidden', flex: expanded ? 1 : 'none',
    }}>
      {/* Section header — line 1828-1846 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 10px', backgroundColor: T.bgCard,
        borderBottom: `1px solid ${T.border}`, cursor: 'pointer', userSelect: 'none',
      }}>
        <ChevronRight size={12} style={{ color: T.textMuted, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
        <span style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sales Pipeline</span>
        <span style={{ fontSize: '8px', color: T.textMuted }}>Leads & Customers W/Estimates</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: T.border }} />
        <span style={{ fontSize: '10px', fontWeight: '700', color: '#16a34a' }}>$54,700</span>
        <span style={{ fontSize: '9px', color: T.textMuted }}>9 leads</span>
      </div>

      {/* Stage headers strip — always visible, lines 1848-1882 */}
      <div style={{ display: 'flex', backgroundColor: T.bg }}>
        {SALES_STAGES.map(stage => {
          const data = STAGE_DATA[stage.id] || { count: 0, value: 0 }
          const isTarget = dragTarget === stage.id
          return (
            <div key={stage.id} style={{
              flex: '1 1 0', minWidth: 0, padding: '4px 6px',
              borderBottom: `3px solid ${stage.color}`,
              backgroundColor: isTarget ? T.accentBg : T.bgCard,
              transition: 'background-color 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2px' }}>
                <span style={{ fontWeight: '600', color: T.text, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stage.name}
                </span>
                <span style={{ backgroundColor: stage.color + '20', color: stage.color, padding: '0 4px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', flexShrink: 0 }}>
                  {data.count}
                </span>
              </div>
              <div style={{ fontSize: '9px', color: data.value > 0 ? '#16a34a' : T.textMuted, fontWeight: data.value > 0 ? '600' : '400', marginTop: '1px' }}>
                {data.value > 0 ? `$${(data.value / 1000).toFixed(0)}k` : '$0'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cards area — expanded only, lines 1886-1988 */}
      {expanded && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {SALES_STAGES.map(stage => {
            const data = STAGE_DATA[stage.id] || { count: 0, leads: [] }
            const isTarget = dragTarget === stage.id
            return (
              <div key={stage.id} style={{
                flex: '1 1 0', minWidth: 0,
                borderRight: `1px solid ${T.border}`,
                backgroundColor: isTarget ? T.accentBg : 'transparent',
                transition: 'background-color 0.15s',
                display: 'flex', flexDirection: 'column',
                padding: '3px', gap: '3px', overflowY: 'auto',
              }}>
                {data.leads.map(lead => (
                  <PipelineCard
                    key={lead.id}
                    lead={lead}
                    isDragging={draggingId === lead.id}
                  />
                ))}
                {data.leads.length === 0 && (
                  <div style={{ padding: '8px 4px', textAlign: 'center', color: T.textMuted, fontSize: '8px' }}>
                    {stage.isWon ? 'Drag here to close' : stage.isLost ? 'Drop if deal falls through' : 'Drop leads here'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Pipeline card — mirrors EntityCard usage lines 1920-1967 ─────────────
function PipelineCard({ lead, isDragging }) {
  return (
    <motion.div
      animate={isDragging
        ? { scale: 1.05, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', opacity: 0.88 }
        : { scale: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: '5px', padding: '5px', cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <div style={{ fontSize: '9px', fontWeight: '600', color: T.text, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lead.customer_name}
      </div>
      {lead._quoteName && (
        <span style={{ fontSize: '7px', padding: '1px 4px', borderRadius: '3px', backgroundColor: T.accentBg, color: T.accent, fontWeight: '600', display: 'inline-block', marginBottom: '2px' }}>
          {lead._quoteName}
        </span>
      )}
      {lead.business_name && !lead._quoteName && (
        <div style={{ fontSize: '8px', color: T.textMuted, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.business_name}
        </div>
      )}
      {lead.phone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '8px', color: T.textMuted, marginBottom: '1px' }}>
          <Phone size={7} />{lead.phone}
        </div>
      )}
      {lead.amount > 0 && (
        <div style={{ fontSize: '9px', fontWeight: '700', color: '#16a34a' }}>
          ${lead.amount.toLocaleString()}
        </div>
      )}
      {lead.appointment_time && (
        <div style={{ marginTop: '2px', padding: '1px 4px', backgroundColor: '#dcfce7', borderRadius: '3px', fontSize: '7px', color: '#166534', display: 'flex', alignItems: 'center', gap: '2px' }}>
          <Calendar size={7} />{lead.appointment_time}
        </div>
      )}
      {lead.lead_source && (
        <div style={{ marginTop: '1px', fontSize: '7px', color: T.textMuted, fontStyle: 'italic' }}>
          via {lead.lead_source}
        </div>
      )}
    </motion.div>
  )
}

// ─── Delivery section — mirrors lines 1991-2044 ───────────────────────────
function DeliverySection({ scene }) {
  const expanded = scene === 'delivery'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderRadius: '6px', border: `1px solid ${T.border}`,
      overflow: 'hidden', flex: expanded ? 1 : 'none',
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 10px', backgroundColor: T.bgCard,
        borderBottom: `1px solid ${T.border}`, cursor: 'pointer', userSelect: 'none',
      }}>
        <ChevronRight size={12} style={{ color: '#0ea5e9', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
        <span style={{ fontSize: '9px', fontWeight: '700', color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Delivery Pipeline</span>
        <span style={{ fontSize: '8px', color: T.textMuted }}>Auto-synced from jobs</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: T.border }} />
        <span style={{ fontSize: '10px', fontWeight: '700', color: '#16a34a' }}>$104.9k</span>
        <span style={{ fontSize: '9px', color: T.textMuted }}>10 deals</span>
      </div>

      {/* Stage headers strip */}
      <div style={{ display: 'flex', backgroundColor: T.bg }}>
        {DELIVERY_STAGES.map(stage => {
          const data = DELIVERY_DATA[stage.id] || { count: 0, value: 0 }
          return (
            <div key={stage.id} style={{
              flex: '1 1 0', minWidth: 0, padding: '4px 6px',
              borderBottom: `3px solid ${stage.color}`,
              backgroundColor: T.bgCard,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2px' }}>
                <span style={{ fontWeight: '600', color: T.text, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stage.name}
                </span>
                <span style={{ backgroundColor: stage.color + '20', color: stage.color, padding: '0 4px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', flexShrink: 0 }}>
                  {data.count}
                </span>
              </div>
              <div style={{ fontSize: '9px', color: data.value > 0 ? '#16a34a' : T.textMuted, fontWeight: data.value > 0 ? '600' : '400', marginTop: '1px' }}>
                {data.value > 0 ? `$${(data.value / 1000).toFixed(0)}k` : '$0'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cards — expanded only */}
      {expanded && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {DELIVERY_STAGES.map(stage => (
            <div key={stage.id} style={{
              flex: '1 1 0', minWidth: 0,
              borderRight: `1px solid ${T.border}`,
              padding: '3px', overflowY: 'auto',
            }}>
              {stage.id === 'Scheduled' && [
                { id: 'j1', name: 'Marcus Okafor', jobId: 'JOB-041', amount: '$24,500' },
                { id: 'j2', name: 'Ryan Torres',   jobId: 'JOB-039', amount: '$12,000' },
              ].map(j => <DeliveryCard key={j.id} {...j} stageColor={stage.color} />)}
              {stage.id === 'In Progress' && [
                { id: 'j3', name: 'David Kim',  jobId: 'JOB-038', amount: '$18,200' },
              ].map(j => <DeliveryCard key={j.id} {...j} stageColor={stage.color} />)}
              {stage.id === 'Job Complete' && [
                { id: 'j4', name: 'Sarah Chen', jobId: 'JOB-032', amount: '$14,500' },
              ].map(j => <DeliveryCard key={j.id} {...j} stageColor={stage.color} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeliveryCard({ name, jobId, amount, stageColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        backgroundColor: T.bgCard,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${stageColor}`,
        borderRadius: '5px', padding: '5px', marginBottom: '3px',
      }}
    >
      <div style={{ fontSize: '9px', fontWeight: '600', color: T.text, marginBottom: '1px' }}>{name}</div>
      <div style={{ fontSize: '8px', color: T.textMuted }}>{jobId}</div>
      <div style={{ fontSize: '9px', fontWeight: '700', color: '#16a34a', marginTop: '1px' }}>{amount}</div>
    </motion.div>
  )
}

// ─── Won modal — mirrors handleMarkAsWon UI lines 840-960 ─────────────────
function WonModal() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 20,
        backgroundColor: 'rgba(0,0,0,0.26)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ scale: 0.95, y: -10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          backgroundColor: T.bgCard, borderRadius: '12px',
          border: `1px solid ${T.border}`, width: '260px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Trophy size={13} style={{ color: '#16a34a' }} />
            <span style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>Mark as Won</span>
          </div>
          <X size={13} style={{ color: T.textMuted }} />
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <div style={{ fontSize: '11px', color: T.textSecondary }}>
            <strong>David Kim</strong> · Solera Electric
          </div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#16a34a' }}>$24,500</div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.text, marginBottom: '3px' }}>Notes (optional)</label>
            <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '10px', color: T.textMuted, minHeight: '28px' }}>
              Signed EST-031. Install Jun 18.
            </div>
          </div>
          <div style={{ fontSize: '9px', color: T.textMuted, backgroundColor: '#dcfce7', padding: '5px 8px', borderRadius: '5px', lineHeight: 1.5 }}>
            A Job record is auto-created in the Delivery Pipeline.
          </div>
          <div style={{ display: 'flex', gap: '7px' }}>
            <button style={{ flex: 1, padding: '6px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
            <button style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', backgroundColor: '#16a34a', color: '#fff', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Mark Won</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview: '1 · Sales + Delivery — two collapsible tracks, stats strip, date range',
    board:    '2 · Sales expanded — draggable cards in each stage column',
    drag:     '3 · Drag a card right — column lights up as the drop target',
    won:      '4 · Drop on Won → notes → job auto-created in Delivery Pipeline',
    delivery: '5 · Delivery Pipeline — auto-synced from jobs, from Chillin to Paid',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How the pipeline works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
