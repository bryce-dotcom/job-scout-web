// Leads walkthrough — rebuilt to Prospect Scout standard.
// Source of truth: src/pages/Leads.jsx + src/lib/statusColors.js
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Plus, Search, MapPin, Phone, Mail, Calendar,
  FileText, Pencil, Upload, Download, ChevronDown, ChevronRight, X,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/leads.js'

// ─── Theme (matches JOBSCOUT_PROJECT_RULES.md) ─────────────────────────────
const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
  shadow:        '0 1px 4px rgba(44,53,48,0.08)',
}

// From src/lib/statusColors.js — exact values
const STATUS_COLORS = {
  'New':             { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Contacted':       { bg: 'rgba(139,92,246,0.12)',  text: '#8b5cf6' },
  'Appointment Set': { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  'Qualified':       { bg: 'rgba(249,115,22,0.12)',  text: '#f97316' },
  'Estimate Sent':   { bg: 'rgba(234,179,8,0.12)',   text: '#eab308' },
  'Negotiation':     { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b' },
  'Won':             { bg: 'rgba(16,185,129,0.12)',  text: '#10b981' },
  'Lost':            { bg: 'rgba(100,116,139,0.12)', text: '#64748b' },
}

// Mock leads matching real emptyLead fields (customer_name, business_name,
// phone, email, address, service_type, lead_source, status, appointment_time)
const MOCK_LEADS = [
  {
    id: 1,
    customer_name:  'Marcus Okafor',
    business_name:  'Northbridge Logistics',
    phone:          '(801) 555-0142',
    email:          'marcus@northbridge.co',
    address:        '1440 S Temple, Salt Lake City, UT 84115',
    service_type:   'LED Retrofit',
    lead_source:    'Web Form',
    status:         'New',
    appointment_time: null,
  },
  {
    id: 2,
    customer_name:  'Sarah Chen',
    business_name:  'Cypress Roofing',
    phone:          '(801) 555-0283',
    email:          'schen@cypress.io',
    address:        '295 Highland Dr, Highland, UT 84003',
    service_type:   'Fleet Wrap',
    lead_source:    'Referral',
    status:         'Contacted',
    appointment_time: null,
  },
  {
    id: 3,
    customer_name:  'David Kim',
    business_name:  'Solera Electric',
    phone:          '(801) 555-0094',
    email:          'dkim@solera.com',
    address:        '892 Lone Peak Pkwy, Draper, UT 84020',
    service_type:   'LED Retrofit',
    lead_source:    'Cold Call',
    status:         'Appointment Set',
    appointment_time: '2026-06-10T14:00:00',
  },
  {
    id: 4,
    customer_name:  'Jennifer Walsh',
    business_name:  null,
    phone:          '(801) 555-0371',
    email:          'jwalsh@gmail.com',
    address:        '348 W 700 S, Salt Lake City, UT 84101',
    service_type:   'Lawn Care',
    lead_source:    'Door Knock',
    status:         'Won',
    appointment_time: null,
  },
]

const TYPED = 'Marcus Okafor'

// ─── Root ──────────────────────────────────────────────────────────────────
export default function LeadsWalkthrough() {
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
            <DonePanel key="done" onReplay={replay} subtitle="Your leads funnel is live." />
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
function Stage({ scene, sceneElapsed }) {
  // Typewriter: ~80 ms per character → full name done in ~1 040 ms
  const typedName = scene === 'add'
    ? TYPED.slice(0, Math.min(TYPED.length, Math.floor(sceneElapsed / 80)))
    : TYPED
  const nameDone = typedName.length >= TYPED.length

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      fontSize: '12px', fontFamily: 'system-ui, sans-serif',
      color: T.text,
    }}>
      <MiniPageHeader scene={scene} />
      <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px', position: 'relative' }}>
        {scene === 'empty'    && <EmptyLeads />}
        {scene === 'add'      && <AddModal typedName={typedName} nameDone={nameDone} />}
        {scene === 'grid'     && <LeadGrid leads={MOCK_LEADS} />}
        {scene === 'schedule' && <ApptModal />}
        {scene === 'city'     && <CityView />}
      </div>
    </div>
  )
}

// ─── MiniPageHeader — mirrors Leads.jsx lines 489-559 ─────────────────────
function MiniPageHeader({ scene }) {
  const cityActive = scene === 'city'
  const btnBase = {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', border: `1px solid ${T.border}`,
    borderRadius: '6px', fontSize: '11px', fontWeight: '500',
    cursor: 'pointer', backgroundColor: 'transparent', color: T.textSecondary,
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{
      backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`,
      padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Leads</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button style={btnBase}>Board View</button>
          <button style={{ ...btnBase, color: T.accent }}><Upload size={12} />Import</button>
          <button style={btnBase}><Download size={12} />Export</button>
          <button style={{ ...btnBase, backgroundColor: T.accent, color: '#fff', border: 'none' }}>
            <Plus size={13} />Add Lead
          </button>
        </div>
      </div>
      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '100px' }}>
          <Search size={11} style={{
            position: 'absolute', left: '7px', top: '50%',
            transform: 'translateY(-50%)', color: T.textMuted,
          }} />
          <input
            readOnly placeholder="Search leads..."
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '4px 8px 4px 22px',
              border: `1px solid ${T.border}`, borderRadius: '6px',
              fontSize: '11px', backgroundColor: T.bg, color: T.text, outline: 'none',
            }}
          />
        </div>
        {/* Selects */}
        {['All Owners', 'All Status', 'All Sources'].map(label => (
          <select key={label} style={{
            padding: '4px 8px', border: `1px solid ${T.border}`,
            borderRadius: '6px', fontSize: '11px',
            backgroundColor: T.bg, color: T.textSecondary,
          }}>
            <option>{label}</option>
          </select>
        ))}
        {/* Group by City toggle */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '4px 10px', whiteSpace: 'nowrap',
          border: `1px solid ${cityActive ? T.accent : T.border}`,
          borderRadius: '6px', fontSize: '11px', fontWeight: '500',
          backgroundColor: cityActive ? T.accentBg : T.bg,
          color: cityActive ? T.accent : T.textSecondary, cursor: 'pointer',
        }}>
          <MapPin size={11} />Group by City
        </button>
      </div>
    </div>
  )
}

// ─── Empty state — mirrors Leads.jsx lines 562-565 ────────────────────────
function EmptyLeads() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%',
        backgroundColor: T.bgCard, borderRadius: '10px',
        border: `1px solid ${T.border}`,
      }}
    >
      <UserPlus size={36} style={{ color: T.textMuted, marginBottom: '12px' }} />
      <p style={{ color: T.textSecondary, fontSize: '13px', margin: 0 }}>No leads found.</p>
    </motion.div>
  )
}

// ─── Lead card — mirrors renderLeadCard() Leads.jsx lines 400-466 ─────────
function MiniLeadCard({ lead, flashIn }) {
  const sc = STATUS_COLORS[lead.status] || { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
  // "Appointment Set" is long — abbreviate for the small card
  const statusLabel = lead.status === 'Appointment Set' ? 'Appt Set' : lead.status
  return (
    <motion.div
      initial={flashIn ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: '8px', padding: '10px', boxShadow: T.shadow,
      }}
    >
      {/* Name + status */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: '6px', marginBottom: '4px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: T.text, lineHeight: 1.3 }}>
          {lead.customer_name}
        </div>
        <span style={{
          padding: '2px 7px', borderRadius: '10px', fontSize: '10px',
          fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0,
          backgroundColor: sc.bg, color: sc.text,
        }}>
          {statusLabel}
        </span>
      </div>
      {/* Business name */}
      {lead.business_name && (
        <div style={{ fontSize: '11px', color: T.textSecondary, marginBottom: '6px' }}>
          {lead.business_name}
        </div>
      )}
      {/* Phone + email */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '10px', color: T.textMuted, marginBottom: '4px', flexWrap: 'wrap',
      }}>
        {lead.phone && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Phone size={10} />{lead.phone}
          </span>
        )}
        {lead.email && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden' }}>
            <Mail size={10} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}>
              {lead.email}
            </span>
          </span>
        )}
      </div>
      {/* Address */}
      {lead.address && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '3px',
          fontSize: '10px', color: T.textMuted, marginBottom: '6px', overflow: 'hidden',
        }}>
          <MapPin size={10} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.address}
          </span>
        </div>
      )}
      {/* Chips: service_type + appointment_time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {lead.service_type && (
          <span style={{
            fontSize: '10px', padding: '2px 6px',
            backgroundColor: T.bg, color: T.textSecondary,
            borderRadius: '4px', fontWeight: '500',
          }}>
            {lead.service_type}
          </span>
        )}
        {lead.appointment_time && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            fontSize: '10px', padding: '2px 6px',
            backgroundColor: '#d1fae5', color: '#059669',
            borderRadius: '4px', fontWeight: '500',
          }}>
            <Calendar size={9} />
            {new Date(lead.appointment_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      {/* Footer: Edit · Appt · Quote — mirrors lines 454-464 */}
      <div style={{
        display: 'flex', gap: '4px',
        paddingTop: '7px', borderTop: `1px solid ${T.border}`,
      }}>
        <button style={{
          padding: '3px 7px', border: `1px solid ${T.border}`, borderRadius: '4px',
          backgroundColor: 'transparent', color: T.textSecondary,
          fontSize: '10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '3px',
        }}>
          <Pencil size={10} />Edit
        </button>
        <button style={{
          flex: 1, padding: '3px 4px', border: `1px solid ${T.border}`,
          borderRadius: '4px', backgroundColor: 'transparent',
          color: T.textSecondary, fontSize: '10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
        }}>
          <Calendar size={10} />Appt
        </button>
        <button style={{
          flex: 1, padding: '3px 4px', border: `1px solid ${T.border}`,
          borderRadius: '4px', backgroundColor: 'transparent',
          color: T.textSecondary, fontSize: '10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
        }}>
          <FileText size={10} />Quote
        </button>
      </div>
    </motion.div>
  )
}

// Grid wrapper — mirrors line 616 (auto-fill, 320px min)
function LeadGrid({ leads }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '10px', alignContent: 'start',
    }}>
      {leads.map(lead => <MiniLeadCard key={lead.id} lead={lead} />)}
    </div>
  )
}

// ─── Add Lead modal — mirrors Leads.jsx lines 800-872 ─────────────────────
function AddModal({ typedName, nameDone }) {
  const fieldBox = (value, focused) => ({
    padding: '5px 9px',
    border: `1px solid ${focused ? T.accent : T.border}`,
    borderRadius: '6px', backgroundColor: T.bg,
    fontSize: '11px', color: value ? T.text : T.textMuted,
    minHeight: '26px', lineHeight: '16px',
  })
  const label = txt => (
    <label style={{
      display: 'block', fontSize: '11px', fontWeight: '500',
      color: T.text, marginBottom: '3px',
    }}>{txt}</label>
  )

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Dimmed background grid */}
      <div style={{ opacity: 0.25 }}>
        <LeadGrid leads={MOCK_LEADS.slice(1, 3)} />
      </div>
      {/* Overlay + modal */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
          style={{
            backgroundColor: T.bgCard, borderRadius: '12px',
            border: `1px solid ${T.border}`, width: '340px',
            maxHeight: '92%', overflow: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          {/* Modal header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
            position: 'sticky', top: 0, backgroundColor: T.bgCard,
          }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>Add Lead</span>
            <X size={15} style={{ color: T.textMuted }} />
          </div>

          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Customer Name * | Business Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                {label('Customer Name *')}
                <div style={{ ...fieldBox(typedName, true), display: 'flex', alignItems: 'center' }}>
                  <span>{typedName}</span>
                  {!nameDone && (
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                      style={{ borderRight: `1.5px solid ${T.accent}`, marginLeft: '1px', height: '12px', display: 'inline-block' }}
                    />
                  )}
                </div>
              </div>
              <div>
                {label('Business Name')}
                <div style={fieldBox(nameDone ? 'Northbridge Logistics' : '', false)}>
                  {nameDone && 'Northbridge Logistics'}
                </div>
              </div>
            </div>
            {/* Email | Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                {label('Email')}
                <div style={fieldBox(nameDone, false)}>{nameDone && 'marcus@northbridge.co'}</div>
              </div>
              <div>
                {label('Phone')}
                <div style={fieldBox(nameDone, false)}>{nameDone && '(801) 555-0142'}</div>
              </div>
            </div>
            {/* Address */}
            <div>
              {label('Address')}
              <div style={{ ...fieldBox(nameDone, false), minHeight: '36px' }}>
                {nameDone && '1440 S Temple, Salt Lake City, UT 84115'}
              </div>
            </div>
            {/* Service Type | Lead Source */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                {label('Service Type')}
                <div style={fieldBox(nameDone, false)}>{nameDone && 'LED Retrofit'}</div>
              </div>
              <div>
                {label('Lead Source')}
                <div style={fieldBox(nameDone, false)}>{nameDone && 'Web Form'}</div>
              </div>
            </div>
            {/* Lead Owner */}
            <div>
              {label('Lead Owner')}
              <div style={fieldBox(nameDone, false)}>{nameDone && 'Doug Anderson'}</div>
            </div>
            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button style={{
                flex: 1, padding: '8px',
                border: `1px solid ${T.border}`, borderRadius: '6px',
                backgroundColor: 'transparent', color: T.textSecondary,
                fontSize: '11px', cursor: 'pointer',
              }}>Cancel</button>
              <button style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
                backgroundColor: T.accent, color: '#fff',
                fontSize: '11px', fontWeight: '500', cursor: 'pointer',
              }}>Add Lead</button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Appointment modal — mirrors Leads.jsx lines 918-942 ──────────────────
function ApptModal() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ opacity: 0.25 }}>
        <LeadGrid leads={MOCK_LEADS} />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            backgroundColor: T.bgCard, borderRadius: '12px',
            border: `1px solid ${T.border}`, width: '300px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>Schedule Appointment</span>
            <X size={15} style={{ color: T.textMuted }} />
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Title */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.text, marginBottom: '3px' }}>Title</label>
              <div style={{ padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>
                Appointment with Marcus Okafor
              </div>
            </div>
            {/* Start / End */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.text, marginBottom: '3px' }}>Start Time *</label>
                <div style={{ padding: '5px 9px', border: `1.5px solid ${T.accent}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>
                  Jun 10 · 2:00 PM
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.text, marginBottom: '3px' }}>End Time</label>
                <div style={{ padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '11px', color: T.textMuted }}>
                  Jun 10 · 3:00 PM
                </div>
              </div>
            </div>
            {/* Location */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: T.text, marginBottom: '3px' }}>Location</label>
              <div style={{ padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '11px', color: T.textMuted }}>
                1440 S Temple, Salt Lake City, UT
              </div>
            </div>
            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{
                flex: 1, padding: '8px',
                border: `1px solid ${T.border}`, borderRadius: '6px',
                backgroundColor: 'transparent', color: T.textSecondary,
                fontSize: '11px', cursor: 'pointer',
              }}>Cancel</button>
              <button style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
                backgroundColor: T.accent, color: '#fff',
                fontSize: '11px', fontWeight: '500', cursor: 'pointer',
              }}>Schedule</button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Group by City view — mirrors Leads.jsx lines 578-614 ─────────────────
const CITY_GROUPS = [
  { city: 'Draper',         count: 1, leads: null },
  { city: 'Highland',       count: 1, leads: null },
  { city: 'Salt Lake City', count: 2, leads: MOCK_LEADS.filter(l => l.address.includes('Salt Lake City')) },
]

function CityView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {CITY_GROUPS.map((g, i) => (
        <motion.div
          key={g.city}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
        >
          {/* City header button */}
          <button style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            width: '100%', padding: '8px 12px', minHeight: '40px',
            backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: '8px', color: T.text, fontSize: '12px',
            fontWeight: '600', cursor: 'pointer', textAlign: 'left',
            marginBottom: g.leads ? '8px' : 0,
            boxSizing: 'border-box',
          }}>
            {g.leads
              ? <ChevronDown size={14} style={{ color: T.textMuted }} />
              : <ChevronRight size={14} style={{ color: T.textMuted }} />}
            <MapPin size={13} style={{ color: T.accent }} />
            <span style={{ flex: 1 }}>{g.city}</span>
            <span style={{ color: T.textMuted, fontWeight: '500', fontSize: '11px' }}>
              {g.count} lead{g.count !== 1 ? 's' : ''}
            </span>
          </button>
          {/* Expanded leads */}
          {g.leads && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px',
            }}>
              {g.leads.map(lead => <MiniLeadCard key={lead.id} lead={lead} />)}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    empty:    '1 · Empty lead list — click Add Lead to get started',
    add:      '2 · Add Lead modal — name required, rest fills in as you go',
    grid:     '3 · Lead grid — status pills, service chips, appointment dates',
    schedule: '4 · Appt button books a time on the setter\'s calendar',
    city:     '5 · Group by City — collapses leads under collapsible city headers',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How to capture leads'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
