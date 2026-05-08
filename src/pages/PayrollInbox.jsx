// PayrollInbox
// =====================================================================
// Alayda's home base for payroll-tax + compliance tasks. Replaces the
// "did I forget anything?" anxiety with a single list of:
//   - Tax deposits coming due (with traffic-light dots)
//   - Quarterly/annual filings due (941, W-2, etc.)
//   - New employees that need a new-hire report mailed in
//   - Setup gaps (missing W-4, missing EIN) the system needs to compute
//     payroll correctly
//
// Each row is a one-tap "what to do next" — the bookkeeper never has
// to know which IRS form is which. JobScout figures it out.
// =====================================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  Inbox, AlertTriangle, CheckCircle2, FileText, Clock, UserPlus,
  Settings as SettingsIcon, ChevronRight, Calendar, Building2,
  ArrowRight, RefreshCw,
} from 'lucide-react'

// "Crayola-easy" colors. Green = on track / done. Yellow = coming up.
// Red = overdue. Gray = informational / setup gap.
const TONE = {
  green:  { dot: '#22c55e', bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.35)',  label: '#16a34a' },
  yellow: { dot: '#eab308', bg: 'rgba(234,179,8,0.10)',  border: 'rgba(234,179,8,0.35)',  label: '#a16207' },
  red:    { dot: '#ef4444', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.40)',  label: '#dc2626' },
  gray:   { dot: '#9ca3af', bg: 'rgba(156,163,175,0.10)', border: 'rgba(156,163,175,0.35)', label: '#4b5563' },
}

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)
}

export default function PayrollInbox() {
  const navigate = useNavigate()
  const companyId = useStore(s => s.companyId)
  const company   = useStore(s => s.company)
  const themeCtx  = useTheme()
  const theme     = themeCtx?.theme || {
    bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8', text: '#2c3530',
    textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349',
    accentBg: 'rgba(90,99,73,0.12)',
  }

  const [loading, setLoading]       = useState(true)
  const [liabilities, setLiabilities] = useState([])
  const [filings, setFilings]         = useState([])
  const [newHires, setNewHires]       = useState([])
  const [employees, setEmployees]     = useState([])

  const refresh = async () => {
    if (!companyId) return
    setLoading(true)
    const today = new Date()
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10)

    const [{ data: liab }, { data: fil }, { data: emps }] = await Promise.all([
      supabase
        .from('payroll_tax_liabilities')
        .select('*')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true })
        .limit(200),
      supabase
        .from('payroll_tax_filings')
        .select('*')
        .eq('company_id', companyId)
        .order('period_end', { ascending: false })
        .limit(50),
      // Pull employees for new-hire reports (within 60 days of hire) + setup-gap detection.
      supabase
        .from('employees')
        .select('id, name, email, active, tax_classification, hire_date, new_hire_reported_at, w4_filing_status, ssn_last4, dd_account_last4')
        .eq('company_id', companyId)
        .order('id'),
    ])

    setLiabilities(liab || [])
    setFilings(fil || [])
    setEmployees(emps || [])

    const recentHires = (emps || []).filter(e => {
      if (!e.hire_date) return false
      if (e.new_hire_reported_at) return false
      const days = daysBetween(e.hire_date, today)
      return days >= 0 && days <= 60
    })
    setNewHires(recentHires)
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [companyId])

  // ---------- Setup gaps (block accurate payroll if missing) ----------
  const setupGaps = useMemo(() => {
    const gaps = []
    if (!company) return gaps
    if (!company.ein) {
      gaps.push({ key: 'ein', text: 'Add your company EIN (federal employer ID).', cta: 'Open Tax Settings', href: '/settings#tax' })
    }
    if (!company.state_employer_id) {
      gaps.push({ key: 'state_employer_id', text: 'Add your state withholding ID (Utah TC ID).', cta: 'Open Tax Settings', href: '/settings#tax' })
    }
    if (!company.federal_deposit_schedule) {
      gaps.push({ key: 'fed_sched', text: 'Set how often you deposit federal payroll taxes (the IRS told you in a letter).', cta: 'Open Tax Settings', href: '/settings#tax' })
    }
    if (company.sui_rate_pct == null) {
      gaps.push({ key: 'sui_rate', text: 'Add your state unemployment (SUI) rate. Utah DWS sends this in a notice each year.', cta: 'Open Tax Settings', href: '/settings#tax' })
    }
    // Employees missing W-4
    const missingW4 = (employees || []).filter(e => e.active && !e.w4_filing_status)
    if (missingW4.length) {
      gaps.push({
        key: 'w4', text: `${missingW4.length} active ${missingW4.length === 1 ? 'employee is' : 'employees are'} missing tax info (W-4).`,
        cta: 'Fix in Employees', href: '/employees',
      })
    }
    return gaps
  }, [company, employees])

  // ---------- Categorize liabilities ----------
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const overdue = liabilities.filter(l => !l.paid_at && l.due_date < todayStr)
  const dueSoon = liabilities.filter(l => !l.paid_at && l.due_date >= todayStr && daysBetween(today, l.due_date) <= 14)
  const upcoming = liabilities.filter(l => !l.paid_at && l.due_date >= todayStr && daysBetween(today, l.due_date) > 14)
  const recentPaid = liabilities.filter(l => l.paid_at).slice(0, 5)

  const totalOverdue = overdue.reduce((sum, l) => sum + (Number(l.amount_total) || 0), 0)
  const totalDueSoon = dueSoon.reduce((sum, l) => sum + (Number(l.amount_total) || 0), 0)

  const isAllClear =
    !loading &&
    setupGaps.length === 0 &&
    overdue.length === 0 &&
    dueSoon.length === 0 &&
    newHires.length === 0

  return (
    <div style={{ padding: '20px', maxWidth: 980, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Inbox size={28} color={theme.accent} />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: theme.text }}>Payroll Inbox</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: theme.textMuted }}>
            What needs your attention to keep payroll, taxes, and new hires on track.
          </p>
        </div>
        <button
          onClick={refresh}
          title="Refresh"
          style={{ padding: 8, background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, cursor: 'pointer', color: theme.textMuted }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* All-clear banner */}
      {isAllClear && (
        <Card tone={TONE.green} theme={theme}>
          <CheckCircle2 size={28} color={TONE.green.dot} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TONE.green.label }}>You're caught up</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
              No tax deposits due, no new-hire reports waiting, no setup gaps. Nice work.
            </div>
          </div>
        </Card>
      )}

      {/* Summary chips */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 20 }}>
          {overdue.length > 0 && (
            <Chip
              tone={TONE.red}
              theme={theme}
              icon={AlertTriangle}
              big={fmtMoney(totalOverdue)}
              label={`${overdue.length} overdue ${overdue.length === 1 ? 'deposit' : 'deposits'}`}
            />
          )}
          {dueSoon.length > 0 && (
            <Chip
              tone={TONE.yellow}
              theme={theme}
              icon={Clock}
              big={fmtMoney(totalDueSoon)}
              label={`${dueSoon.length} due in 14 days`}
            />
          )}
        </div>
      )}

      {/* Setup gaps */}
      {setupGaps.length > 0 && (
        <Section title="Set this up so payroll math is correct" theme={theme}>
          {setupGaps.map(g => (
            <Row
              key={g.key}
              tone={TONE.gray}
              theme={theme}
              icon={SettingsIcon}
              title={g.text}
              right={<button onClick={() => navigate(g.href)} style={btn(theme)}>{g.cta}<ChevronRight size={14} /></button>}
            />
          ))}
        </Section>
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <Section title="Overdue — pay these now" theme={theme} tone={TONE.red}>
          {overdue.map(l => (
            <LiabilityRow key={l.id} l={l} theme={theme} navigate={navigate} todayStr={todayStr} />
          ))}
        </Section>
      )}

      {/* Due soon */}
      {dueSoon.length > 0 && (
        <Section title="Coming up in the next 14 days" theme={theme} tone={TONE.yellow}>
          {dueSoon.map(l => (
            <LiabilityRow key={l.id} l={l} theme={theme} navigate={navigate} todayStr={todayStr} />
          ))}
        </Section>
      )}

      {/* New hires needing report */}
      {newHires.length > 0 && (
        <Section title="New hire reports to send to Utah DWS" theme={theme} tone={TONE.yellow}>
          {newHires.map(e => {
            const dueDate = new Date(new Date(e.hire_date).getTime() + 20 * 86400000)
            const overdueHire = dueDate < today
            const tone = overdueHire ? TONE.red : TONE.yellow
            return (
              <Row
                key={e.id}
                tone={tone}
                theme={theme}
                icon={UserPlus}
                title={`${e.name} — hired ${fmtDate(e.hire_date)}`}
                subtitle={overdueHire ? `Was due ${fmtDate(dueDate)} (${Math.abs(daysBetween(today, dueDate))}d overdue)` : `Due ${fmtDate(dueDate)}`}
                right={<button onClick={() => navigate(`/employees?id=${e.id}#new-hire-report`)} style={btn(theme)}>Print report<ChevronRight size={14} /></button>}
              />
            )
          })}
        </Section>
      )}

      {/* Upcoming (later than 14 days) */}
      {upcoming.length > 0 && (
        <Section title="Later (more than 14 days away)" theme={theme}>
          {upcoming.slice(0, 6).map(l => (
            <LiabilityRow key={l.id} l={l} theme={theme} navigate={navigate} todayStr={todayStr} compact />
          ))}
          {upcoming.length > 6 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: theme.textMuted, textAlign: 'center' }}>
              +{upcoming.length - 6} more in the calendar
            </div>
          )}
        </Section>
      )}

      {/* Recently filed / paid */}
      {recentPaid.length > 0 && (
        <Section title="Recently paid" theme={theme} tone={TONE.green}>
          {recentPaid.map(l => (
            <Row
              key={l.id}
              tone={TONE.green}
              theme={theme}
              icon={CheckCircle2}
              title={taxKindLabel(l.kind)}
              subtitle={`${fmtMoney(l.amount_total)} · paid ${fmtDate(l.paid_at)}${l.confirmation_number ? ` · #${l.confirmation_number}` : ''}`}
            />
          ))}
        </Section>
      )}

      {filings.length > 0 && (
        <Section title="Forms on file" theme={theme}>
          {filings.slice(0, 8).map(f => (
            <Row
              key={f.id}
              tone={f.status === 'filed' ? TONE.green : TONE.gray}
              theme={theme}
              icon={FileText}
              title={`${f.form_kind} · ${fmtDate(f.period_start)} – ${fmtDate(f.period_end)}`}
              subtitle={f.status === 'filed' ? `Filed ${fmtDate(f.filed_at)}${f.filed_method ? ` (${f.filed_method})` : ''}` : `Status: ${f.status}`}
            />
          ))}
        </Section>
      )}

      {/* Empty-state when not all-clear and there are no rows in any section */}
      {!loading && !isAllClear && liabilities.length === 0 && newHires.length === 0 && setupGaps.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: theme.textMuted }}>
          Nothing to do yet. As soon as you run a payroll the tax deposits will appear here.
        </div>
      )}
    </div>
  )
}

// ===== Helpers + tiny components =====================================
function btn(theme) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '8px 12px', minHeight: 36,
    backgroundColor: theme.accent, color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }
}

function Card({ tone, theme, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: 18,
      backgroundColor: tone.bg,
      border: `1px solid ${tone.border}`,
      borderRadius: 12,
      marginBottom: 20,
    }}>
      {children}
    </div>
  )
}

function Section({ title, theme, tone, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{
        margin: '0 0 8px',
        fontSize: 13,
        fontWeight: 700,
        color: tone?.label || theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>{title}</h2>
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </section>
  )
}

function Row({ tone, theme, icon: Icon, title, subtitle, right, big }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px',
      borderBottom: `1px solid ${theme.border}`,
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: 999, backgroundColor: tone.dot, flexShrink: 0,
      }} />
      {Icon && <Icon size={16} color={tone.label} style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
          {title}
          {big != null && (
            <span style={{ marginLeft: 10, fontSize: 16, fontWeight: 700, color: tone.label }}>
              {big}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  )
}

function Chip({ tone, theme, icon: Icon, big, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: 14,
      backgroundColor: tone.bg,
      border: `1px solid ${tone.border}`,
      borderRadius: 12,
    }}>
      <Icon size={22} color={tone.dot} />
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: tone.label, lineHeight: 1.1 }}>{big}</div>
        <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

function LiabilityRow({ l, theme, navigate, todayStr, compact }) {
  const isOverdue = !l.paid_at && l.due_date < todayStr
  const days = daysBetween(new Date(), l.due_date)
  const tone = isOverdue
    ? TONE.red
    : (days <= 14 ? TONE.yellow : TONE.gray)
  const subtitle = isOverdue
    ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue · was due ${fmtDate(l.due_date)}`
    : `Due ${fmtDate(l.due_date)}${days <= 14 ? ` (${days}d)` : ''}`
  return (
    <Row
      tone={tone}
      theme={theme}
      icon={Building2}
      title={`Send ${fmtMoney(l.amount_total)} to ${l.agency} · ${taxKindLabel(l.kind)}`}
      subtitle={subtitle}
      right={!compact && <button onClick={() => navigate(`/payroll/inbox/${l.id}`)} style={btn(theme)}>Pay this now<ArrowRight size={14} /></button>}
    />
  )
}

function taxKindLabel(kind) {
  const map = {
    federal_income_tax: 'Federal income tax (employee withholding)',
    social_security:    'Social Security',
    medicare:           'Medicare',
    additional_medicare:'Additional Medicare',
    futa:               'FUTA (federal unemployment)',
    state_income_tax:   'State income tax',
    sui:                'State unemployment (SUI)',
  }
  return map[kind] || kind
}
