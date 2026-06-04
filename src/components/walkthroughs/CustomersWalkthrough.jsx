// Customers walkthrough — rebuilt to Prospect Scout standard.
//
// Renders a near-pixel reproduction of /customers (Customers.jsx):
//   • PageHeader with User icon + title + Import + Export + Add Customer
//   • Search bar (with leading Search icon) + Status filter dropdown
//   • Result-count micro-row
//   • EntityCard grid (auto-fill, 320px min) — accent 48px square with
//     User icon, name + business_name, edit/delete actions, email + phone
//     rows, footer with status pill + salesperson
//
// Add Customer modal mirrors the real one (lines 524+ of Customers.jsx):
//   Name *, Business, Email, Phone, Address, Salesperson select, Status,
//   Preferred contact, Marketing opt-in.
//
// Customer Detail "portal" scene mirrors the real CustomerDetail page —
// 6-tab header (Jobs / Estimates / Invoices / Payments / Cards /
// Communications) and a Send Portal Link button that flashes a token.

import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Building2, Mail, Phone, Plus, Upload, Download, Search, X,
  Pencil, Trash2, CreditCard, Globe, Send, Briefcase, Receipt,
  DollarSign, MessageSquare, ExternalLink, CheckCircle2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/customers.js'

// Theme — pulled from defaultTheme in Customers.jsx (lines 47-56)
const T = {
  bg:           '#f7f5ef',
  bgCard:       '#ffffff',
  bgCardHover:  '#eef2eb',
  border:       '#d6cdb8',
  text:         '#2c3530',
  textSecondary:'#4d5a52',
  textMuted:    '#7d8a7f',
  accent:       '#5a6349',
  accentBg:     'rgba(90,99,73,0.12)',
  // Status pill colors — from getStatusStyle in Customers.jsx
  activeBg:   'rgba(34,197,94,0.15)',
  activeText: '#15803d',
  prospectBg: 'rgba(59,130,246,0.15)',
  prospectText:'#1d4ed8',
  inactiveBg: 'rgba(125,138,127,0.15)',
  inactiveText:'#4d5a52',
}

const CUSTOMERS = [
  { id: 1, name: 'Sarah Chen',     business: 'Northbridge Industries', email: 'sarah@northbridge.com', phone: '(801) 555-0142', status: 'Active',   sp: 'Cole' },
  { id: 2, name: 'Marcus Reeves',  business: 'Cypress Logistics',      email: 'mreeves@cypress.io',    phone: '(801) 555-0118', status: 'Active',   sp: 'Cole' },
  { id: 3, name: 'Priya Anand',    business: 'Solera Manufacturing',   email: 'priya@solera.io',       phone: '(801) 555-0203', status: 'Prospect', sp: 'Marcus' },
  { id: 4, name: 'David Okafor',   business: 'Granite Foods',          email: 'd.okafor@granite.com',  phone: '(801) 555-0455', status: 'Active',   sp: 'Cole' },
]
const NEW_CUSTOMER = CUSTOMERS[0]

export default function CustomersWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%',
      paddingBottom: '56.25%',
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
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
            <DonePanel key="done" onReplay={replay} subtitle="Your customer hub. Search, click, drill, send the portal link." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  // Form scene typewriter
  const NAME_TYPED = NEW_CUSTOMER.name
  const EMAIL_TYPED = NEW_CUSTOMER.email
  const typedName = scene === 'form'
    ? NAME_TYPED.slice(0, Math.min(NAME_TYPED.length, Math.floor(sceneElapsed / 70)))
    : NAME_TYPED
  const typedEmail = scene === 'form' && sceneElapsed > 1500
    ? EMAIL_TYPED.slice(0, Math.min(EMAIL_TYPED.length, Math.floor((sceneElapsed - 1500) / 60)))
    : (scene === 'form' ? '' : EMAIL_TYPED)

  // Search scene
  const SEARCH_QUERY = 'northbridge'
  const typedSearch = scene === 'search'
    ? SEARCH_QUERY.slice(0, Math.min(SEARCH_QUERY.length, Math.floor(sceneElapsed / 80)))
    : ''
  const filteredCustomers = scene === 'search' && typedSearch.length > 0
    ? CUSTOMERS.filter(c =>
        c.name.toLowerCase().includes(typedSearch.toLowerCase()) ||
        c.business.toLowerCase().includes(typedSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(typedSearch.toLowerCase()))
    : CUSTOMERS

  // Card flash on "card" scene — first customer animates in
  const cardFlashIds = scene === 'card' ? new Set([NEW_CUSTOMER.id]) : new Set()

  // What we show
  const visibleList = scene === 'empty' ? []
    : scene === 'card' ? [NEW_CUSTOMER]
    : scene === 'detail' ? [NEW_CUSTOMER]
    : scene === 'portal' ? [NEW_CUSTOMER]
    : filteredCustomers

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeaderRow />
      <FilterRow typedSearch={typedSearch} scene={scene} resultCount={visibleList.length} totalCount={CUSTOMERS.length} />

      {visibleList.length === 0 ? (
        <EmptyState />
      ) : scene === 'detail' || scene === 'portal' ? (
        <DetailPane scene={scene} sceneElapsed={sceneElapsed} customer={NEW_CUSTOMER} />
      ) : (
        <CardsGrid customers={visibleList} flashIds={cardFlashIds} />
      )}

      <AnimatePresence>
        {scene === 'form' && (
          <FormModal
            key="form-modal"
            typedName={typedName}
            typedEmail={typedEmail}
            sceneElapsed={sceneElapsed}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Page header ──────────────────────────────────────────────────────
function PageHeaderRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: T.accentBg, color: T.accent,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={22} />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.text }}>Customers</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <ActionBtn outline><Upload size={16} /> Import</ActionBtn>
        <ActionBtn outline><Download size={16} /> Export</ActionBtn>
        <ActionBtn solid><Plus size={18} /> Add Customer</ActionBtn>
      </div>
    </div>
  )
}

function ActionBtn({ outline, solid, children }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '9px 14px',
      background: solid ? T.accent : 'transparent',
      color: solid ? '#fff' : (outline ? T.accent : T.textSecondary),
      border: solid ? 'none' : `1px solid ${T.border}`,
      borderRadius: 8,
      fontSize: 13, fontWeight: 500,
    }}>{children}</div>
  )
}

function FilterRow({ typedSearch, scene, resultCount, totalCount }) {
  const showCount = scene === 'search'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
          <div style={{
            padding: '9px 12px 9px 36px',
            border: `1.5px solid ${typedSearch ? T.accent : T.border}`,
            borderRadius: 8, fontSize: 13,
            background: T.bgCard,
            minHeight: 16,
            color: T.text,
          }}>
            {typedSearch ? (
              <>
                {typedSearch}
                {scene === 'search' && typedSearch.length < 'northbridge'.length && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ display: 'inline-block', width: 1.5, height: 12, background: T.accent, marginLeft: 2, transform: 'translateY(2px)' }}
                  />
                )}
              </>
            ) : (
              <span style={{ color: T.textMuted, fontStyle: 'italic' }}>Search by name, business, email, phone, address…</span>
            )}
          </div>
        </div>
        <div style={{
          padding: '9px 12px',
          border: `1px solid ${T.border}`,
          borderRadius: 8, fontSize: 13,
          background: T.bgCard,
          color: T.text,
          minWidth: 140,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          All Status <span style={{ color: T.textMuted }}>▾</span>
        </div>
      </div>
      {showCount && (
        <div style={{ fontSize: 11, color: T.textMuted }}>{resultCount} of {totalCount} customers</div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10,
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: 40, textAlign: 'center',
      }}
    >
      <Building2 size={42} style={{ color: T.textMuted }} />
      <div style={{ fontSize: 14, color: T.textSecondary }}>
        No customers yet. Add your first customer to get started.
      </div>
    </motion.div>
  )
}

// ─── Cards grid ───────────────────────────────────────────────────────
function CardsGrid({ customers, flashIds }) {
  return (
    <div style={{
      flex: 1, overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 14,
      alignContent: 'start',
    }}>
      {customers.map(c => (
        <CustomerCard key={c.id} customer={c} flash={flashIds.has(c.id)} />
      ))}
    </div>
  )
}

function CustomerCard({ customer, flash }) {
  return (
    <motion.div
      initial={flash ? { opacity: 0, y: 14, scale: 0.95, background: T.accentBg } : false}
      animate={{ opacity: 1, y: 0, scale: 1, background: T.bgCard }}
      transition={{ duration: 0.6 }}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: T.accentBg, color: T.accent,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={22} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{customer.name}</div>
            {customer.business && (
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 1 }}>{customer.business}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <Pencil size={14} style={{ color: T.textMuted }} />
          <Trash2 size={14} style={{ color: T.textMuted }} />
        </div>
      </div>
      {/* Contact rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Mail size={12} /> {customer.email}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSecondary }}>
          <Phone size={12} /> {customer.phone}
        </div>
      </div>
      {/* Footer */}
      <div style={{
        paddingTop: 10, borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <StatusPill status={customer.status} />
        {customer.sp && <span style={{ fontSize: 11, color: T.textMuted }}>{customer.sp}</span>}
      </div>
    </motion.div>
  )
}

function StatusPill({ status }) {
  const map = {
    Active:   { bg: T.activeBg,   text: T.activeText },
    Prospect: { bg: T.prospectBg, text: T.prospectText },
    Inactive: { bg: T.inactiveBg, text: T.inactiveText },
  }
  const c = map[status] || map.Active
  return (
    <span style={{
      fontSize: 11, padding: '3px 10px',
      borderRadius: 99,
      background: c.bg, color: c.text,
      fontWeight: 600,
    }}>{status}</span>
  )
}

// ─── Add Customer modal ───────────────────────────────────────────────
function FormModal({ typedName, typedEmail, sceneElapsed }) {
  const nameDoneTyping = typedName.length >= NEW_CUSTOMER.name.length
  const emailDoneTyping = typedEmail.length >= NEW_CUSTOMER.email.length

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 5 }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 6 }} animate={{ scale: 1, y: 0 }}
        style={{
          background: T.bgCard, borderRadius: 14, width: '100%', maxWidth: 480,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: T.text }}>Add Customer</h2>
          <X size={18} style={{ color: T.textMuted }} />
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Name *">
            <InputBox
              value={typedName}
              showCursor={!nameDoneTyping}
              focused
            />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Business name" style={{ flex: 1 }}>
              <InputBox value={emailDoneTyping ? NEW_CUSTOMER.business : ''} placeholder="Northbridge Industries" />
            </Field>
            <Field label="Status" style={{ width: 140 }}>
              <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgCard, fontSize: 13, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.activeText }} /> Active
              </div>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Email" style={{ flex: 1 }}>
              <InputBox value={typedEmail} placeholder="email@example.com" showCursor={sceneElapsed > 1500 && !emailDoneTyping} focused={sceneElapsed > 1500} />
            </Field>
            <Field label="Phone" style={{ flex: 1 }}>
              <InputBox value={emailDoneTyping ? NEW_CUSTOMER.phone : ''} placeholder="(801) 555-0142" />
            </Field>
          </div>
          <Field label="Address">
            <InputBox value={emailDoneTyping ? '6395 W 10400 N · Highland UT 84003' : ''} placeholder="Street, City, State ZIP" />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Salesperson" style={{ flex: 1 }}>
              <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgCard, fontSize: 13, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} /> Cole Westbrook
              </div>
            </Field>
            <Field label="Preferred contact" style={{ flex: 1 }}>
              <div style={{ padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 7, background: T.bgCard, fontSize: 13, color: T.text }}>Phone</div>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1, padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, textAlign: 'center', fontSize: 13 }}>Cancel</div>
            <motion.div
              animate={emailDoneTyping ? { scale: [1, 1.05, 1] } : { scale: 1 }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{ flex: 1, padding: 10, background: T.accent, color: '#fff', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600 }}
            >
              Save Customer
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: T.textSecondary, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function InputBox({ value, placeholder, showCursor, focused }) {
  return (
    <div style={{
      padding: '8px 11px',
      border: `1.5px solid ${focused ? T.accent : T.border}`,
      borderRadius: 7,
      background: T.bgCard,
      fontSize: 13,
      color: T.text,
      minHeight: 16,
    }}>
      {value ? (
        <>
          {value}
          {showCursor && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{ display: 'inline-block', width: 1.5, height: 12, background: T.accent, marginLeft: 2, transform: 'translateY(2px)' }}
            />
          )}
        </>
      ) : (
        <span style={{ color: T.textMuted, fontStyle: 'italic' }}>{placeholder}</span>
      )}
    </div>
  )
}

// ─── Detail pane (scene === 'detail' or 'portal') ─────────────────────
// Mirrors CustomerDetail page header + tabs + body
function DetailPane({ scene, sceneElapsed, customer }) {
  const tabs = [
    { id: 'jobs',     label: 'Jobs',           icon: Briefcase,     count: 7 },
    { id: 'est',      label: 'Estimates',      icon: Receipt,       count: 3 },
    { id: 'inv',      label: 'Invoices',       icon: Receipt,       count: 5 },
    { id: 'pay',      label: 'Payments',       icon: DollarSign,    count: 5 },
    { id: 'cards',    label: 'Cards',          icon: CreditCard,    count: 1 },
    { id: 'comms',    label: 'Communications', icon: MessageSquare, count: 12 },
  ]
  return (
    <div style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Detail header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 11,
            background: T.accentBg, color: T.accent,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={26} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{customer.name}</div>
            <div style={{ fontSize: 12, color: T.textSecondary }}>{customer.business} · {customer.phone}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <motion.div
            animate={scene === 'portal' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={scene === 'portal' ? { repeat: Infinity, duration: 1.4 } : { duration: 0 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 12px',
              background: '#7c3aed', color: '#fff',
              borderRadius: 7,
              fontSize: 12, fontWeight: 700,
              border: scene === 'portal' ? '1.5px solid #6d28d9' : 'none',
            }}
          >
            <Globe size={13} /> Send Portal Link
          </motion.div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', background: 'transparent', color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 12, fontWeight: 500 }}>
            <Pencil size={12} /> Edit
          </div>
        </div>
      </div>
      {/* Tab strip */}
      <div style={{
        padding: '6px 12px',
        background: T.bg, borderBottom: `1px solid ${T.border}`,
        display: 'flex', gap: 4, overflowX: 'auto',
      }}>
        {tabs.map((t, i) => (
          <Tab key={t.id} tab={t} active={i === 0} />
        ))}
      </div>
      {/* Body */}
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        {scene === 'detail' ? (
          <JobsTimeline />
        ) : (
          <PortalView sceneElapsed={sceneElapsed} customer={customer} />
        )}
      </div>
    </div>
  )
}

function Tab({ tab, active }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '6px 12px',
      background: active ? T.bgCard : 'transparent',
      border: active ? `1px solid ${T.border}` : '1px solid transparent',
      borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
      borderRadius: '6px 6px 0 0',
      fontSize: 12, fontWeight: 600,
      color: active ? T.accent : T.textSecondary,
      whiteSpace: 'nowrap',
    }}>
      <tab.icon size={12} /> {tab.label}
      <span style={{ background: T.bg, color: T.textMuted, padding: '0 6px', borderRadius: 99, fontSize: 10, marginLeft: 2 }}>{tab.count}</span>
    </div>
  )
}

function JobsTimeline() {
  const jobs = [
    { id: 'JOB-2147', date: 'May 28, 2026', desc: 'LED retrofit · 240 fixtures', status: 'Won',  amount: 28400 },
    { id: 'JOB-2086', date: 'Mar 14, 2026', desc: 'Wallpack retrofit · 14 fixtures', status: 'Closed', amount: 6840 },
    { id: 'JOB-2014', date: 'Jan 09, 2026', desc: 'Quick service call',           status: 'Closed', amount: 480 },
  ]
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Recent jobs</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {jobs.map((j, i) => (
          <motion.div key={j.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{
            display: 'grid', gridTemplateColumns: '110px 110px 1fr 80px 90px', gap: 12, alignItems: 'center',
            padding: '10px 12px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12,
          }}>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: T.accent, fontWeight: 700 }}>{j.id}</div>
            <div style={{ color: T.textMuted, fontSize: 11 }}>{j.date}</div>
            <div style={{ color: T.text }}>{j.desc}</div>
            <StatusPill status={j.status === 'Won' ? 'Active' : 'Inactive'} />
            <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${j.amount.toLocaleString()}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function PortalView({ sceneElapsed, customer }) {
  const linkAppears = sceneElapsed > 1800
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, flexDirection: 'column', gap: 14 }}>
      <motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} style={{ padding: 18, background: '#f5edff', border: `1.5px solid #7c3aed`, borderRadius: 11, maxWidth: 440, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Globe size={18} style={{ color: '#7c3aed' }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Customer Portal Link</div>
        </div>
        <div style={{ padding: '10px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 12, fontFamily: 'monospace', color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>job-scout.app/portal/<span style={{ color: '#7c3aed', fontWeight: 700 }}>k3xR9pNm…</span></span>
          <ExternalLink size={12} style={{ color: T.textMuted }} />
        </div>
        <AnimatePresence>
          {linkAppears && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 12px', background: '#7c3aed', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                <Send size={12} /> Send to {customer.email}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'transparent', color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12 }}>
                Copy
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div style={{ marginTop: 10, fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
          Rotating token · 90-day expiry · customer sees open quotes, invoices, payments, statements. No password.
        </div>
      </motion.div>
      {linkAppears && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: T.activeBg, color: T.activeText, borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
          <CheckCircle2 size={12} /> Magic link sent · audit logged
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    empty:  '1. Empty Customers page · Building2 icon · click Add Customer',
    form:   '2. Add Customer modal · Name required · rest optional',
    card:   '3. Card lands in the grid · name, email, phone, status pill',
    detail: '4. Click → CustomerDetail · 6 tabs · jobs timeline first',
    portal: '5. Send Portal Link · rotating token · magic-link, no password',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Almost no setup'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
