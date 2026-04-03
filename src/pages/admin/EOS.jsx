import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { useTheme } from '../../components/Layout'
import { useIsMobile } from '../../hooks/useIsMobile'
import { toast } from '../../lib/toast'
import HelpBadge from '../../components/HelpBadge'
import {
  Target, Eye, TrendingUp, Shield, Heart, Star, Zap,
  Users, CheckCircle, XCircle, Clock, Calendar, Plus, X,
  ChevronDown, ChevronUp, ChevronRight, Trash2, Edit3,
  Save, AlertCircle, BarChart3, MessageSquare, Layers,
  Award, Compass, Flag, ArrowRight, RefreshCw, GripVertical,
  Timer, Play, Pause, Check, Circle, Minus, ListChecks,
  Activity, Link2, Database, BookOpen, UserCheck
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// ─── Helpers ──────────────────────────────────────────────────────

const EOS_KEYS = {
  core_values: 'eos_core_values',
  core_focus: 'eos_core_focus',
  ten_year: 'eos_ten_year_target',
  marketing: 'eos_marketing_strategy',
  three_year: 'eos_three_year_picture',
  one_year: 'eos_one_year_plan',
  rocks: 'eos_rocks',
  scorecard: 'eos_scorecard',
  issues: 'eos_issues',
  accountability: 'eos_accountability_chart',
  meetings: 'eos_meeting_cadences',
  todos: 'eos_todos',
  people_analyzer: 'eos_people_analyzer',
  quarterly_convos: 'eos_quarterly_conversations',
}

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const getCurrentQuarter = () => Math.ceil((new Date().getMonth() + 1) / 3)
const getCurrentYear = () => new Date().getFullYear()

const VALUE_ICONS = [Heart, Star, Shield, Zap, Compass, Award, Target, Users, Eye, Flag]

// ─── Week Helpers ────────────────────────────────────────────────

function getWeekRange(weeksAgo = 0) {
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset - (weeksAgo * 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return {
    start: monday.toISOString(),
    end: sunday.toISOString(),
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
    label: `${monday.getMonth() + 1}/${monday.getDate()}`,
  }
}

const WON_STATUSES = ['Won', 'Job Scheduled', 'In Progress', 'Job Complete', 'Invoiced', 'Closed']

// Entity filter: filters records by business_unit
function filterByEntity(arr, entity) {
  if (!entity) return arr
  return arr.filter(item =>
    item.business_unit && item.business_unit.toLowerCase() === entity.toLowerCase()
  )
}

// Filter time logs by entity via their linked job
function filterTimeLogsByEntity(timeLogs, jobs, entity) {
  if (!entity) return timeLogs
  const jobIds = new Set(filterByEntity(jobs, entity).map(j => j.id))
  return timeLogs.filter(t => t.job_id && jobIds.has(t.job_id))
}

// Filter invoices/payments by entity via their linked job
function filterInvoicesByEntity(invoices, jobs, entity) {
  if (!entity) return invoices
  const jobIds = new Set(filterByEntity(jobs, entity).map(j => j.id))
  return invoices.filter(i => i.job_id && jobIds.has(i.job_id))
}

const AUTO_SOURCES = {
  sales_won: {
    label: 'Dollar Amount Sold',
    category: 'Sales',
    format: 'currency',
    compute: (d, s, e, sd, ed, ent) => {
      return filterByEntity(d.leads, ent)
        .filter(l => WON_STATUSES.includes(l.status) && l.converted_at >= s && l.converted_at <= e)
        .reduce((sum, l) => {
          const q = d.quotes.find(q => String(q.lead_id) === String(l.id))
          return sum + (parseFloat(q?.quote_amount) || 0)
        }, 0)
    },
  },
  meetings_created: {
    label: 'Meetings Created',
    category: 'Sales',
    format: 'number',
    compute: (d, s, e, sd, ed, ent) => filterByEntity(d.appointments, ent).filter(a => a.created_at >= s && a.created_at <= e).length,
  },
  meetings_attended: {
    label: 'Meetings Attended',
    category: 'Sales',
    format: 'number',
    compute: (d, s, e, sd, ed, ent) => filterByEntity(d.appointments, ent).filter(a => a.status === 'Completed' && a.start_time >= s && a.start_time <= e).length,
  },
  jobs_completed: {
    label: 'Jobs Completed',
    category: 'Operations',
    format: 'number',
    compute: (d, s, e, sd, ed, ent) => filterByEntity(d.jobs, ent).filter(j => j.status === 'Completed' && j.updated_at >= s && j.updated_at <= e).length,
  },
  job_revenue: {
    label: 'Job Revenue',
    category: 'Operations',
    format: 'currency',
    compute: (d, s, e, sd, ed, ent) => filterByEntity(d.jobs, ent).filter(j => j.status === 'Completed' && j.updated_at >= s && j.updated_at <= e).reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0),
  },
  dollars_per_hour: {
    label: 'Dollars / Hour',
    category: 'Operations',
    format: 'currency',
    compute: (d, s, e, sd, ed, ent) => {
      const rev = filterByEntity(d.jobs, ent).filter(j => j.status === 'Completed' && j.updated_at >= s && j.updated_at <= e).reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)
      const hrs = filterTimeLogsByEntity(d.timeLogs, d.jobs, ent).filter(t => t.date >= sd && t.date <= ed).reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0)
      return hrs > 0 ? Math.round(rev / hrs) : 0
    },
  },
  man_hours: {
    label: 'Total Man Hours',
    category: 'Operations',
    format: 'number',
    compute: (d, s, e, sd, ed, ent) => Math.round(filterTimeLogsByEntity(d.timeLogs, d.jobs, ent).filter(t => t.date >= sd && t.date <= ed).reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0) * 10) / 10,
  },
  callbacks: {
    label: 'Callbacks',
    category: 'Operations',
    format: 'number',
    compute: (d, s, e, sd, ed, ent) => filterByEntity(d.leads, ent).filter(l => l.callback_date && l.callback_date >= sd && l.callback_date <= ed).length,
  },
  cash_collected: {
    label: 'Cash Collected',
    category: 'Finance',
    format: 'currency',
    compute: (d, s, e, sd, ed, ent) => {
      const p = filterInvoicesByEntity(d.payments || [], d.jobs, ent).filter(p => p.date >= sd && p.date <= ed).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
      const lp = (d.leadPayments || []).filter(p => {
        if (ent) {
          const lead = d.leads.find(l => String(l.id) === String(p.lead_id))
          if (!lead || lead.business_unit?.toLowerCase() !== ent.toLowerCase()) return false
        }
        return p.date_created >= s && p.date_created <= e && p.payment_status === 'Paid'
      }).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
      return p + lp
    },
  },
  receivables: {
    label: 'Accounts Receivable',
    category: 'Finance',
    format: 'currency',
    compute: (d, s, e, sd, ed, ent) => filterInvoicesByEntity(d.invoices || [], d.jobs, ent).filter(i => ['Pending', 'Sent', 'Partial', 'Overdue'].includes(i.payment_status)).reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0),
  },
  expenses_total: {
    label: 'Total Expenses',
    category: 'Finance',
    format: 'currency',
    compute: (d, s, e, sd, ed, ent) => {
      let exps = d.expenses || []
      if (ent) {
        const jobIds = new Set(filterByEntity(d.jobs, ent).map(j => j.id))
        exps = exps.filter(x => x.job_id && jobIds.has(x.job_id))
      }
      return exps.filter(x => x.date >= sd && x.date <= ed).reduce((sum, x) => sum + (parseFloat(x.amount) || 0), 0)
    },
  },
  submittals_sent: {
    label: 'Submittals Sent',
    category: 'Operations',
    format: 'number',
    compute: (d, s, e, sd, ed, ent) => {
      let subs = d.submittals || []
      if (ent) {
        const jobIds = new Set(filterByEntity(d.jobs, ent).map(j => j.id))
        subs = subs.filter(x => x.job_id && jobIds.has(x.job_id))
      }
      return subs.filter(x => x.created_at >= s && x.created_at <= e).length
    },
  },
}

function computeAutoValue(sourceKey, storeData, entity) {
  const src = AUTO_SOURCES[sourceKey]
  if (!src) return null
  const week = getWeekRange(0)
  return src.compute(storeData, week.start, week.end, week.startDate, week.endDate, entity || null)
}

function formatMetricValue(val, format) {
  if (val == null || val === '') return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  if (format === 'currency') return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

// ─── Reusable UI Components ──────────────────────────────────────

function Card({ children, style, theme }) {
  return (
    <div style={{
      backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: '12px', padding: '20px',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle, color, theme, action, help }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: (color || theme.accent) + '15',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={color || theme.accent} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>{title}</h3>
            {help && <HelpBadge text={help} />}
          </div>
          {subtitle && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  )
}

function ProgressRing({ percent, size = 48, stroke = 4, color, theme }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.border} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || theme.accent}
        strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: '11px', fontWeight: '700', fill: color || theme.accent }}>
        {Math.round(percent)}%
      </text>
    </svg>
  )
}

function StatusDot({ status, theme }) {
  const colors = { 'on-track': '#22c55e', 'off-track': '#ef4444', 'at-risk': '#f59e0b', done: '#22c55e' }
  return (
    <div style={{
      width: '10px', height: '10px', borderRadius: '50%',
      backgroundColor: colors[status] || theme.textMuted, flexShrink: 0,
    }} />
  )
}

function SmallBtn({ children, onClick, color, theme, disabled, style: s }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
      border: 'none', cursor: disabled ? 'default' : 'pointer',
      backgroundColor: color ? color + '12' : theme.accentBg,
      color: color || theme.accent, display: 'flex', alignItems: 'center', gap: '4px',
      opacity: disabled ? 0.5 : 1, ...s,
    }}>
      {children}
    </button>
  )
}

// Bare local-state input for inline editing (no border/bg, used inside styled containers)
function LocalInput({ value, onChange, placeholder, style: s }) {
  const [local, setLocal] = useState(value || '')
  useEffect(() => { setLocal(value || '') }, [value])
  return (
    <input value={local} onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value || '')) onChange(local) }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      placeholder={placeholder}
      style={s}
    />
  )
}

function InlineInput({ value, onChange, placeholder, style: s, theme, multiline }) {
  const [local, setLocal] = useState(value || '')
  const ref = useRef(null)
  useEffect(() => { setLocal(value || '') }, [value])
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <Tag ref={ref} value={local} onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value || '')) onChange(local) }}
      onKeyDown={e => { if (!multiline && e.key === 'Enter') { e.target.blur() } }}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
        border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text,
        outline: 'none', resize: multiline ? 'vertical' : 'none',
        minHeight: multiline ? '60px' : 'auto', fontFamily: 'inherit', ...s,
      }}
    />
  )
}

function CountdownTimer({ targetDate, theme }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(iv)
  }, [])
  if (!targetDate) return null
  const diff = new Date(targetDate).getTime() - now
  if (diff <= 0) return <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>Overdue</span>
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  return (
    <span style={{ fontSize: '12px', color: days < 3 ? '#f59e0b' : theme.textMuted, fontWeight: '600' }}>
      {days}d {hours}h
    </span>
  )
}

// ─── Tab Components ──────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════
// V/TO — VISION / TRACTION ORGANIZER
// ════════════════════════════════════════════════════════════════════

function VTOTab({ data, save, theme, employees, isMobile }) {
  const coreValues = data.core_values || []
  const coreFocus = data.core_focus || { purpose: '', niche: '' }
  const tenYear = data.ten_year || ''
  const marketing = data.marketing || { target_market: '', three_uniques: ['', '', ''], proven_process: [], guarantee: '' }
  const threeYear = data.three_year || { revenue: '', profit: '', measurables: '', what_it_looks_like: '' }
  const oneYear = data.one_year || { revenue: '', profit: '', goals: [] }

  const [editingValue, setEditingValue] = useState(null)
  const [newValue, setNewValue] = useState({ value: '', description: '' })

  const addCoreValue = () => {
    if (!newValue.value.trim()) return
    save('core_values', [...coreValues, { value: newValue.value.trim(), description: newValue.description.trim() }])
    setNewValue({ value: '', description: '' })
  }

  const removeCoreValue = (i) => save('core_values', coreValues.filter((_, idx) => idx !== i))

  const updateCoreValue = (i, field, val) => {
    const updated = [...coreValues]
    updated[i] = { ...updated[i], [field]: val }
    save('core_values', updated)
    setEditingValue(null)
  }

  const addProvenProcessStep = () => {
    save('marketing', { ...marketing, proven_process: [...(marketing.proven_process || []), { name: '', description: '' }] })
  }

  const addOneYearGoal = () => {
    save('one_year', { ...oneYear, goals: [...(oneYear.goals || []), { text: '', owner_id: null, done: false }] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ─── Core Values ─── */}
      <Card theme={theme}>
        <SectionHeader icon={Heart} title="Core Values" subtitle="The 3-7 principles your company lives by" color="#ef4444" theme={theme} help="Core Values are the defining characteristics of your organization — the handful of rules that guide your culture. They help you hire, fire, and make decisions. Ideally 3-7 values that are truly lived, not aspirational." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          {coreValues.map((cv, i) => {
            const ValIcon = VALUE_ICONS[i % VALUE_ICONS.length]
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px',
                borderRadius: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#ef444412',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px',
                }}>
                  <ValIcon size={16} color="#ef4444" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingValue === i ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <InlineInput value={cv.value} onChange={v => updateCoreValue(i, 'value', v)} theme={theme} placeholder="Value name" />
                      <InlineInput value={cv.description} onChange={v => updateCoreValue(i, 'description', v)} theme={theme} placeholder="What this means..." multiline />
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text }}>{cv.value}</div>
                      {cv.description && <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px', lineHeight: 1.5 }}>{cv.description}</div>}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => setEditingValue(editingValue === i ? null : i)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => removeCoreValue(i)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {coreValues.length < 7 && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <InlineInput value={newValue.value} onChange={v => setNewValue(p => ({ ...p, value: v }))} placeholder="New core value..." theme={theme} />
            </div>
            <div style={{ flex: isMobile ? 1 : 2 }}>
              <InlineInput value={newValue.description} onChange={v => setNewValue(p => ({ ...p, description: v }))} placeholder="Description (optional)" theme={theme} />
            </div>
            <SmallBtn onClick={addCoreValue} color="#ef4444" theme={theme} style={isMobile ? { justifyContent: 'center' } : undefined}><Plus size={14} /> Add</SmallBtn>
          </div>
        )}
      </Card>

      {/* ─── Core Focus ─── */}
      <Card theme={theme}>
        <SectionHeader icon={Compass} title="Core Focus" subtitle="Why you exist and what you're best at" color="#8b5cf6" theme={theme} help="Core Focus has two parts: your Purpose/Cause/Passion (why you exist beyond making money) and your Niche (what you do better than anyone). When you stay true to your Core Focus, you avoid distractions and 'shiny objects.'" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Purpose / Cause / Passion</label>
            <InlineInput value={coreFocus.purpose} onChange={v => save('core_focus', { ...coreFocus, purpose: v })} placeholder="Why does this company exist?" theme={theme} multiline />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Niche</label>
            <InlineInput value={coreFocus.niche} onChange={v => save('core_focus', { ...coreFocus, niche: v })} placeholder="What are you best in the world at?" theme={theme} multiline />
          </div>
        </div>
      </Card>

      {/* ─── 10-Year Target ─── */}
      <Card theme={theme}>
        <SectionHeader icon={Target} title="10-Year Target" subtitle="The big, hairy, audacious goal" color="#3b82f6" theme={theme} help="Your 10-Year Target is one bold, long-range goal that energizes the team. Think big — revenue target, number of locations, market position, or impact. It should be specific enough to know when you've hit it." />
        <InlineInput value={tenYear} onChange={v => save('ten_year', v)} placeholder='e.g., "Become the #1 commercial LED retrofit company in the Southwest with $50M in annual revenue"' theme={theme} multiline />
      </Card>

      {/* ─── Marketing Strategy ─── */}
      <Card theme={theme}>
        <SectionHeader icon={Target} title="Marketing Strategy" subtitle="Target market, differentiators, process, and guarantee" color="#f59e0b" theme={theme} help="Define your ideal customer (Target Market), what makes you different (Uniques), your proven step-by-step approach (Proven Process), and what you stand behind (Guarantee). This becomes the foundation of your marketing and sales messaging." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Target Market</label>
            <InlineInput value={marketing.target_market} onChange={v => save('marketing', { ...marketing, target_market: v })} placeholder="Who is your ideal customer?" theme={theme} multiline />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', display: 'block' }}>3 Uniques (What makes you different)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(marketing.three_uniques || ['', '', '']).map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#f59e0b18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    fontSize: '12px', fontWeight: '700', color: '#f59e0b',
                  }}>{i + 1}</div>
                  <InlineInput value={u} onChange={v => {
                    const updated = [...(marketing.three_uniques || ['', '', ''])]
                    updated[i] = v
                    save('marketing', { ...marketing, three_uniques: updated })
                  }} placeholder={`Unique #${i + 1}`} theme={theme} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Proven Process (Your named steps)</label>
              <SmallBtn onClick={addProvenProcessStep} color="#f59e0b" theme={theme}><Plus size={12} /> Step</SmallBtn>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {(marketing.proven_process || []).map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    padding: '8px 14px', borderRadius: '8px', backgroundColor: '#f59e0b10',
                    border: `1px solid #f59e0b30`, display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#f59e0b' }}>{i + 1}.</span>
                    <LocalInput value={step.name} onChange={v => {
                      const pp = [...(marketing.proven_process || [])]
                      pp[i] = { ...pp[i], name: v }
                      save('marketing', { ...marketing, proven_process: pp })
                    }} placeholder="Step name" style={{
                      border: 'none', background: 'none', fontSize: '13px', fontWeight: '600',
                      color: theme.text, outline: 'none', width: '120px',
                    }} />
                    <button onClick={() => {
                      save('marketing', { ...marketing, proven_process: (marketing.proven_process || []).filter((_, idx) => idx !== i) })
                    }} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                      <X size={12} />
                    </button>
                  </div>
                  {i < (marketing.proven_process || []).length - 1 && <ArrowRight size={14} color={theme.textMuted} />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Guarantee</label>
            <InlineInput value={marketing.guarantee} onChange={v => save('marketing', { ...marketing, guarantee: v })} placeholder="e.g., If your energy savings don't match our proposal within 12 months, we'll make up the difference." theme={theme} multiline />
          </div>
        </div>
      </Card>

      {/* ─── 3-Year Picture ─── */}
      <Card theme={theme}>
        <SectionHeader icon={Eye} title="3-Year Picture" subtitle="What the company looks like in 3 years" color="#22c55e" theme={theme} help="Paint a vivid picture of your company 3 years from now — revenue, profit, headcount, key metrics. Make it specific enough that every team member can see it. This bridges the gap between your 10-Year Target and this year's goals." />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Revenue Target</label>
            <InlineInput value={threeYear.revenue} onChange={v => save('three_year', { ...threeYear, revenue: v })} placeholder="$5,000,000" theme={theme} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Profit Target</label>
            <InlineInput value={threeYear.profit} onChange={v => save('three_year', { ...threeYear, profit: v })} placeholder="$750,000" theme={theme} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>What does it look like?</label>
          <InlineInput value={threeYear.what_it_looks_like} onChange={v => save('three_year', { ...threeYear, what_it_looks_like: v })} placeholder="Describe your company in 3 years — team size, markets, capabilities, reputation..." theme={theme} multiline style={{ minHeight: '80px' }} />
        </div>
      </Card>

      {/* ─── 1-Year Plan ─── */}
      <Card theme={theme}>
        <SectionHeader icon={Flag} title="1-Year Plan" subtitle="This year's goals and targets" color="#6366f1" theme={theme} help="Your 1-Year Plan breaks down the 3-Year Picture into this year's goals — revenue, profit, and 3-7 specific goals. These should be measurable, and your quarterly Rocks should ladder up to achieving them."
          action={<SmallBtn onClick={addOneYearGoal} color="#6366f1" theme={theme}><Plus size={12} /> Goal</SmallBtn>} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Revenue Goal</label>
            <InlineInput value={oneYear.revenue} onChange={v => save('one_year', { ...oneYear, revenue: v })} placeholder="$2,000,000" theme={theme} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Profit Goal</label>
            <InlineInput value={oneYear.profit} onChange={v => save('one_year', { ...oneYear, profit: v })} placeholder="$300,000" theme={theme} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(oneYear.goals || []).map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => {
                const goals = [...(oneYear.goals || [])]
                goals[i] = { ...goals[i], done: !goals[i].done }
                save('one_year', { ...oneYear, goals })
              }} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                {g.done ? <CheckCircle size={18} color="#22c55e" /> : <Circle size={18} color={theme.border} />}
              </button>
              <LocalInput value={g.text} onChange={v => {
                const goals = [...(oneYear.goals || [])]
                goals[i] = { ...goals[i], text: v }
                save('one_year', { ...oneYear, goals })
              }} placeholder="Annual goal..." style={{
                flex: 1, border: 'none', background: 'none', fontSize: '13px', color: theme.text,
                outline: 'none', textDecoration: g.done ? 'line-through' : 'none',
                opacity: g.done ? 0.6 : 1,
              }} />
              <select value={g.owner_id || ''} onChange={e => {
                const goals = [...(oneYear.goals || [])]
                goals[i] = { ...goals[i], owner_id: e.target.value || null }
                save('one_year', { ...oneYear, goals })
              }} style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`, fontSize: '11px', color: theme.textSecondary, backgroundColor: theme.bg }}>
                <option value="">Unassigned</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button onClick={() => save('one_year', { ...oneYear, goals: (oneYear.goals || []).filter((_, idx) => idx !== i) })} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ROCKS — QUARTERLY PRIORITIES
// ════════════════════════════════════════════════════════════════════

function RocksTab({ data, save, theme, employees, entities, isMobile }) {
  const rocks = data.rocks || []
  const [quarter, setQuarter] = useState(getCurrentQuarter())
  const [year, setYear] = useState(getCurrentYear())
  const [adding, setAdding] = useState(false)
  const [newRock, setNewRock] = useState({ title: '', owner_id: '', due_date: '', business_unit: '' })
  const [entityFilter, setEntityFilter] = useState('')

  const quarterRocks = useMemo(() => {
    let filtered = rocks.filter(r => r.quarter === quarter && r.year === year)
    if (entityFilter) filtered = filtered.filter(r => r.business_unit && r.business_unit.toLowerCase() === entityFilter.toLowerCase())
    return filtered
  }, [rocks, quarter, year, entityFilter])

  const completedCount = quarterRocks.filter(r => r.status === 'done').length
  const totalCount = quarterRocks.length
  const completionPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const addRock = () => {
    if (!newRock.title.trim()) return
    const rock = {
      id: crypto.randomUUID(),
      title: newRock.title.trim(),
      owner_id: newRock.owner_id || null,
      quarter, year,
      status: 'on-track',
      due_date: newRock.due_date || null,
      business_unit: newRock.business_unit || null,
      created_at: new Date().toISOString(),
    }
    save('rocks', [...rocks, rock])
    setNewRock({ title: '', owner_id: '', due_date: '', business_unit: '' })
    setAdding(false)
  }

  const updateRock = (id, changes) => save('rocks', rocks.map(r => r.id === id ? { ...r, ...changes } : r))
  const removeRock = (id) => save('rocks', rocks.filter(r => r.id !== id))

  const cycleStatus = (rock) => {
    const order = ['on-track', 'at-risk', 'off-track', 'done']
    const next = order[(order.indexOf(rock.status) + 1) % order.length]
    updateRock(rock.id, { status: next })
  }

  const statusLabels = { 'on-track': 'On Track', 'at-risk': 'At Risk', 'off-track': 'Off Track', done: 'Done' }
  const statusColors = { 'on-track': '#22c55e', 'at-risk': '#f59e0b', 'off-track': '#ef4444', done: '#22c55e' }

  return (
    <div>
      {/* Quarter selector + progress */}
      <Card theme={theme} style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {QUARTER_LABELS.map((q, i) => (
              <button key={q} onClick={() => setQuarter(i + 1)} style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
                border: quarter === i + 1 ? 'none' : `1px solid ${theme.border}`,
                backgroundColor: quarter === i + 1 ? theme.accent : 'transparent',
                color: quarter === i + 1 ? '#fff' : theme.textSecondary,
                cursor: 'pointer',
              }}>{q}</button>
            ))}
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{
              padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`,
              fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
            }}>
              {[getCurrentYear() - 1, getCurrentYear(), getCurrentYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {entities.length > 0 && (
              <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={{
                padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`,
                fontSize: '13px', color: entityFilter ? theme.accent : theme.textSecondary, backgroundColor: theme.bg,
              }}>
                <option value="">All business units</option>
                {entities.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ProgressRing percent={completionPct} color={theme.accent} theme={theme} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text }}>{completedCount}/{totalCount} Rocks</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{QUARTER_LABELS[quarter - 1]} {year}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Rock list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {quarterRocks.map(rock => {
          const owner = employees.find(e => String(e.id) === String(rock.owner_id))
          return (
            <Card key={rock.id} theme={theme} style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <button onClick={() => cycleStatus(rock)} title={`Status: ${statusLabels[rock.status]} (click to cycle)`} style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                  border: 'none', cursor: 'pointer', marginTop: '2px', whiteSpace: 'nowrap',
                  backgroundColor: statusColors[rock.status] + '15', color: statusColors[rock.status],
                }}>
                  {rock.status === 'done' ? <Check size={10} /> : null} {statusLabels[rock.status]}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px', fontWeight: '600', color: theme.text,
                    textDecoration: rock.status === 'done' ? 'line-through' : 'none',
                    opacity: rock.status === 'done' ? 0.6 : 1,
                  }}>{rock.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {owner && <span style={{ fontSize: '11px', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={10} />{owner.name}</span>}
                    {rock.business_unit && (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: theme.accentBg, color: theme.accent, fontWeight: '600' }}>{rock.business_unit}</span>
                    )}
                    {rock.due_date && (
                      <span style={{ fontSize: '11px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={10} /> Due: {new Date(rock.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => removeRock(rock.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          )
        })}
        {quarterRocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px', color: theme.textMuted, fontSize: '13px' }}>
            No rocks for {QUARTER_LABELS[quarter - 1]} {year}. Add your quarterly priorities below.
          </div>
        )}
      </div>

      {/* Add rock */}
      {adding ? (
        <Card theme={theme} style={{ border: `2px solid ${theme.accent}40` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <InlineInput value={newRock.title} onChange={v => setNewRock(p => ({ ...p, title: v }))} placeholder="What's the rock? Be specific and measurable..." theme={theme} />
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px' }}>
              <select value={newRock.owner_id} onChange={e => setNewRock(p => ({ ...p, owner_id: e.target.value }))} style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
                fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
              }}>
                <option value="">Assign to...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {entities.length > 0 && (
                <select value={newRock.business_unit} onChange={e => setNewRock(p => ({ ...p, business_unit: e.target.value }))} style={{
                  flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
                  fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
                }}>
                  <option value="">Business unit...</option>
                  {entities.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              )}
              <input type="date" value={newRock.due_date} onChange={e => setNewRock(p => ({ ...p, due_date: e.target.value }))} style={{
                padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
                fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
              }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <SmallBtn onClick={() => setAdding(false)} theme={theme}>Cancel</SmallBtn>
              <SmallBtn onClick={addRock} color="#22c55e" theme={theme}><Plus size={12} /> Add Rock</SmallBtn>
            </div>
          </div>
        </Card>
      ) : (
        <SmallBtn onClick={() => setAdding(true)} color={theme.accent} theme={theme} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
          <Plus size={14} /> Add Rock for {QUARTER_LABELS[quarter - 1]} {year}
        </SmallBtn>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// SCORECARD — WEEKLY METRICS
// ════════════════════════════════════════════════════════════════════

function ScorecardTab({ data, save, theme, employees, storeData, entities, isMobile }) {
  const scorecard = data.scorecard || []
  const [adding, setAdding] = useState(false)
  const [newMetric, setNewMetric] = useState({ metric: '', owner_id: '', goal: '', type: 'gte', source: 'manual', entity: '' })

  const addMetric = () => {
    if (!newMetric.metric.trim() && newMetric.source === 'manual') return
    const src = AUTO_SOURCES[newMetric.source]
    let label = newMetric.source !== 'manual' ? (src?.label || newMetric.metric) : newMetric.metric.trim()
    if (newMetric.entity && newMetric.source !== 'manual') label = `${label} (${newMetric.entity})`
    if (!label) return
    save('scorecard', [...scorecard, {
      id: crypto.randomUUID(),
      metric: label,
      owner_id: newMetric.owner_id || null,
      goal: newMetric.goal,
      type: newMetric.type,
      source: newMetric.source,
      entity: newMetric.entity || null,
      current: '',
    }])
    setNewMetric({ metric: '', owner_id: '', goal: '', type: 'gte', source: 'manual', entity: '' })
    setAdding(false)
  }

  const updateMetric = (id, changes) => save('scorecard', scorecard.map(m => m.id === id ? { ...m, ...changes } : m))
  const removeMetric = (id) => save('scorecard', scorecard.filter(m => m.id !== id))

  const getActual = (m) => {
    if (m.source && m.source !== 'manual' && AUTO_SOURCES[m.source]) {
      const val = computeAutoValue(m.source, storeData, m.entity)
      return val != null ? String(Math.round(val * 100) / 100) : ''
    }
    return m.current || ''
  }

  const getColor = (m) => {
    const cur = parseFloat(getActual(m))
    const goal = parseFloat(m.goal)
    if (isNaN(cur) || isNaN(goal)) return theme.textMuted
    if (m.type === 'lte') return cur <= goal ? '#22c55e' : cur <= goal * 1.1 ? '#f59e0b' : '#ef4444'
    return cur >= goal ? '#22c55e' : cur >= goal * 0.9 ? '#f59e0b' : '#ef4444'
  }

  const getLastWeek = (m) => {
    if (m.source && m.source !== 'manual' && AUTO_SOURCES[m.source]) {
      const week = getWeekRange(1)
      const src = AUTO_SOURCES[m.source]
      return src.compute(storeData, week.start, week.end, week.startDate, week.endDate, m.entity || null)
    }
    return null
  }

  return (
    <div>
      <Card theme={theme} style={{ marginBottom: '20px' }}>
        <SectionHeader icon={BarChart3} title="Weekly Scorecard" subtitle="Track 5-15 activity metrics every week" color="#3b82f6" theme={theme} help="The Scorecard is a weekly pulse on your business — 5 to 15 numbers that tell you if you're on track. Each metric has an owner and a goal. Review these every week in your L10 meeting to catch problems early before they become crises. Use 'auto-sourced' metrics to pull data directly from your system."
          action={!adding && <SmallBtn onClick={() => setAdding(true)} color="#3b82f6" theme={theme}><Plus size={12} /> Metric</SmallBtn>} />

        <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: isMobile ? '600px' : 'auto' }}>
            {scorecard.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 90px 90px 40px', gap: '8px', padding: '8px 12px', fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span>Metric</span><span>Owner</span><span>Goal</span><span>This Week</span><span>Last Week</span><span></span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {scorecard.map(m => {
                const owner = employees.find(e => String(e.id) === String(m.owner_id))
                const color = getColor(m)
                const actual = getActual(m)
                const isAuto = m.source && m.source !== 'manual'
                const lastWeek = getLastWeek(m)
                const fmt = isAuto ? AUTO_SOURCES[m.source]?.format : null
                return (
                  <div key={m.id} style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 80px 90px 90px 40px', gap: '8px',
                    padding: '10px 12px', borderRadius: '8px', backgroundColor: theme.bg,
                    alignItems: 'center', border: `1px solid ${theme.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      {isAuto && <Database size={11} color="#3b82f6" style={{ flexShrink: 0 }} />}
                      <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.metric}</span>
                      {m.entity && <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '3px', backgroundColor: '#6366f115', color: '#6366f1', flexShrink: 0 }}>{m.entity}</span>}
                    </div>
                    <span style={{ fontSize: '12px', color: theme.textSecondary }}>{owner?.name || '—'}</span>
                    <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600' }}>{m.goal || '—'}</span>
                    {isAuto ? (
                      <div style={{
                        padding: '4px 8px', borderRadius: '6px', fontSize: '13px', fontWeight: '700',
                        backgroundColor: color + '08', color, textAlign: 'center',
                        border: `2px solid ${color}30`,
                      }}>
                        {formatMetricValue(actual, fmt)}
                      </div>
                    ) : (
                      <LocalInput value={actual} onChange={v => updateMetric(m.id, { current: v })}
                        placeholder="—" style={{
                          width: '100%', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', fontWeight: '700',
                          border: `2px solid ${color}30`, backgroundColor: color + '08', color,
                          outline: 'none', textAlign: 'center',
                        }} />
                    )}
                    <div style={{
                      padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      color: theme.textMuted, textAlign: 'center', backgroundColor: theme.bgCard || '#fff',
                    }}>
                      {lastWeek != null ? formatMetricValue(lastWeek, fmt) : (m.current ? '—' : '—')}
                    </div>
                    <button onClick={() => removeMetric(m.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {scorecard.length === 0 && !adding && (
          <div style={{ textAlign: 'center', padding: '24px', color: theme.textMuted, fontSize: '13px' }}>
            No metrics yet. Add the 5-15 numbers that tell you if your business had a good week.
          </div>
        )}
      </Card>

      {adding && (
        <Card theme={theme} style={{ border: `2px solid #3b82f640` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Data Source</label>
              <select value={newMetric.source} onChange={e => {
                const src = e.target.value
                setNewMetric(p => ({
                  ...p,
                  source: src,
                  metric: src !== 'manual' ? (AUTO_SOURCES[src]?.label || '') : p.metric,
                }))
              }} style={{
                width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
                fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
              }}>
                <option value="manual">Manual entry</option>
                <optgroup label="Sales">
                  {Object.entries(AUTO_SOURCES).filter(([, v]) => v.category === 'Sales').map(([k, v]) => (
                    <option key={k} value={k}>{v.label} (live)</option>
                  ))}
                </optgroup>
                <optgroup label="Operations">
                  {Object.entries(AUTO_SOURCES).filter(([, v]) => v.category === 'Operations').map(([k, v]) => (
                    <option key={k} value={k}>{v.label} (live)</option>
                  ))}
                </optgroup>
                <optgroup label="Finance">
                  {Object.entries(AUTO_SOURCES).filter(([, v]) => v.category === 'Finance').map(([k, v]) => (
                    <option key={k} value={k}>{v.label} (live)</option>
                  ))}
                </optgroup>
              </select>
            </div>
            {newMetric.source !== 'manual' && entities.length > 0 && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Business Unit (optional)</label>
                <select value={newMetric.entity} onChange={e => setNewMetric(p => ({ ...p, entity: e.target.value }))} style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`,
                  fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
                }}>
                  <option value="">All business units</option>
                  {entities.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}
            {newMetric.source === 'manual' && (
              <InlineInput value={newMetric.metric} onChange={v => setNewMetric(p => ({ ...p, metric: v }))} placeholder='e.g., "Revenue Booked", "Proposals Sent"' theme={theme} />
            )}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px' }}>
              <select value={newMetric.owner_id} onChange={e => setNewMetric(p => ({ ...p, owner_id: e.target.value }))} style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', color: theme.textSecondary, backgroundColor: theme.bg,
              }}>
                <option value="">Owner...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <InlineInput value={newMetric.goal} onChange={v => setNewMetric(p => ({ ...p, goal: v }))} placeholder="Weekly goal" theme={theme} style={{ width: isMobile ? '100%' : '120px' }} />
              <select value={newMetric.type} onChange={e => setNewMetric(p => ({ ...p, type: e.target.value }))} style={{
                padding: '8px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '12px', color: theme.textSecondary, backgroundColor: theme.bg,
              }}>
                <option value="gte">Higher is better</option>
                <option value="lte">Lower is better</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <SmallBtn onClick={() => setAdding(false)} theme={theme}>Cancel</SmallBtn>
              <SmallBtn onClick={addMetric} color="#3b82f6" theme={theme}><Plus size={12} /> Add</SmallBtn>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ISSUES — IDENTIFY, DISCUSS, SOLVE
// ════════════════════════════════════════════════════════════════════

function IssuesTab({ data, save, theme, employees, isMobile }) {
  const issues = data.issues || []
  const todos = data.todos || []
  const [filter, setFilter] = useState('open')
  const [adding, setAdding] = useState(false)
  const [newIssue, setNewIssue] = useState({ title: '', priority: 'medium', type: 'short' })
  const [resolvingId, setResolvingId] = useState(null)
  const [todoText, setTodoText] = useState('')
  const [todoOwner, setTodoOwner] = useState('')
  const [addingTodo, setAddingTodo] = useState(false)
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoOwner, setNewTodoOwner] = useState('')

  const filtered = useMemo(() => {
    let list = issues
    if (filter === 'open') list = list.filter(i => !i.resolved)
    if (filter === 'resolved') list = list.filter(i => i.resolved)
    return list.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 }
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
      return (p[a.priority] || 1) - (p[b.priority] || 1)
    })
  }, [issues, filter])

  const addIssue = () => {
    if (!newIssue.title.trim()) return
    save('issues', [...issues, {
      id: crypto.randomUUID(),
      title: newIssue.title.trim(),
      priority: newIssue.priority,
      type: newIssue.type,
      resolved: false,
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolution: '',
    }])
    setNewIssue({ title: '', priority: 'medium', type: 'short' })
    setAdding(false)
  }

  const resolveIssue = (id) => {
    // Mark issue resolved
    save('issues', issues.map(i => i.id === id ? { ...i, resolved: true, resolved_at: new Date().toISOString() } : i))
    // If there's a to-do from this resolution, add it
    if (todoText.trim()) {
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      save('todos', [...todos, {
        id: crypto.randomUUID(),
        text: todoText.trim(),
        owner_id: todoOwner || null,
        due_date: nextWeek.toISOString().slice(0, 10),
        done: false,
        created_at: new Date().toISOString(),
        source_issue_id: id,
      }])
    }
    setResolvingId(null)
    setTodoText('')
    setTodoOwner('')
  }

  const unresolveIssue = (id) => {
    save('issues', issues.map(i => i.id === id ? { ...i, resolved: false, resolved_at: null } : i))
  }

  const removeIssue = (id) => save('issues', issues.filter(i => i.id !== id))

  const addTodo = () => {
    if (!newTodoText.trim()) return
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    save('todos', [...todos, {
      id: crypto.randomUUID(),
      text: newTodoText.trim(),
      owner_id: newTodoOwner || null,
      due_date: nextWeek.toISOString().slice(0, 10),
      done: false,
      created_at: new Date().toISOString(),
      source_issue_id: null,
    }])
    setNewTodoText('')
    setNewTodoOwner('')
    setAddingTodo(false)
  }

  const toggleTodo = (id) => save('todos', todos.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const removeTodo = (id) => save('todos', todos.filter(t => t.id !== id))

  const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' }
  const openCount = issues.filter(i => !i.resolved).length
  const activeTodos = todos.filter(t => !t.done)
  const doneTodos = todos.filter(t => t.done)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ─── To-Do List ─── */}
      <Card theme={theme}>
        <SectionHeader icon={ListChecks} title="To-Do List" subtitle={`${activeTodos.length} active — action items from IDS`} color="#8b5cf6" theme={theme} help="To-Dos are 7-day action items that come from IDS (solving issues) or from your L10 meeting. They should be specific, owned by one person, and completable within a week. Review them every L10 — they either got done or they didn't."
          action={!addingTodo && <SmallBtn onClick={() => setAddingTodo(true)} color="#8b5cf6" theme={theme}><Plus size={12} /> To-Do</SmallBtn>} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {activeTodos.map(todo => {
            const owner = employees.find(e => String(e.id) === String(todo.owner_id))
            const overdue = todo.due_date && todo.due_date < new Date().toISOString().slice(0, 10)
            return (
              <div key={todo.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                borderRadius: '8px', backgroundColor: overdue ? '#ef444408' : theme.bg,
                border: `1px solid ${overdue ? '#ef444430' : theme.border}`,
              }}>
                <button onClick={() => toggleTodo(todo.id)} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Circle size={18} color={theme.border} />
                </button>
                <span style={{ flex: 1, fontSize: '13px', color: theme.text, fontWeight: '500' }}>{todo.text}</span>
                {owner && <span style={{ fontSize: '11px', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '3px' }}><Users size={10} />{owner.name}</span>}
                {todo.due_date && <span style={{ fontSize: '10px', color: overdue ? '#ef4444' : theme.textMuted, fontWeight: '600' }}>{overdue ? 'Overdue' : todo.due_date}</span>}
                <button onClick={() => removeTodo(todo.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                  <X size={12} />
                </button>
              </div>
            )
          })}
          {doneTodos.length > 0 && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>Done ({doneTodos.length})</div>
              {doneTodos.slice(0, 5).map(todo => (
                <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 12px', opacity: 0.5 }}>
                  <button onClick={() => toggleTodo(todo.id)} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <CheckCircle size={16} color="#22c55e" />
                  </button>
                  <span style={{ fontSize: '12px', color: theme.text, textDecoration: 'line-through' }}>{todo.text}</span>
                  <button onClick={() => removeTodo(todo.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, marginLeft: 'auto' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {activeTodos.length === 0 && doneTodos.length === 0 && !addingTodo && (
            <div style={{ textAlign: 'center', padding: '16px', color: theme.textMuted, fontSize: '12px' }}>
              No to-dos yet. Resolve issues via IDS to generate action items.
            </div>
          )}
        </div>

        {addingTodo && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
            <InlineInput value={newTodoText} onChange={setNewTodoText} placeholder="Action item..." theme={theme} style={{ flex: 1 }} />
            <select value={newTodoOwner} onChange={e => setNewTodoOwner(e.target.value)} style={{
              padding: '8px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '12px', backgroundColor: theme.bg, color: theme.textSecondary,
            }}>
              <option value="">Owner...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <SmallBtn onClick={addTodo} color="#8b5cf6" theme={theme}><Plus size={12} /></SmallBtn>
            <SmallBtn onClick={() => setAddingTodo(false)} theme={theme}><X size={12} /></SmallBtn>
          </div>
        )}
      </Card>

      {/* ─── Issues (IDS) ─── */}
      <Card theme={theme}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <SectionHeader icon={AlertCircle} title="Issues List" subtitle={`${openCount} open — IDS: Identify, Discuss, Solve`} color="#ef4444" theme={theme} help="The Issues List is where you capture every problem, idea, or obstacle. In your L10 meeting, you prioritize the top 3 and IDS them: Identify the root cause, Discuss solutions openly, then Solve with a to-do or decision. Don't skip straight to solving — the discussion matters." />
          <div style={{ display: 'flex', gap: '6px' }}>
            {['open', 'resolved', 'all'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                border: filter === f ? 'none' : `1px solid ${theme.border}`,
                backgroundColor: filter === f ? theme.accent : 'transparent',
                color: filter === f ? '#fff' : theme.textMuted, cursor: 'pointer', textTransform: 'capitalize',
              }}>{f}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(issue => (
            <div key={issue.id}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                borderRadius: resolvingId === issue.id ? '8px 8px 0 0' : '8px',
                backgroundColor: issue.resolved ? theme.bg : '#fff',
                border: `1px solid ${issue.resolved ? theme.border : priorityColors[issue.priority] + '30'}`,
                opacity: issue.resolved ? 0.6 : 1,
              }}>
                <button onClick={() => {
                  if (!issue.resolved) {
                    setResolvingId(resolvingId === issue.id ? null : issue.id)
                    setTodoText('')
                    setTodoOwner('')
                  } else {
                    unresolveIssue(issue.id)
                  }
                }} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {issue.resolved ? <CheckCircle size={18} color="#22c55e" /> : <Circle size={18} color={theme.border} />}
                </button>
                <div style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '700',
                  backgroundColor: priorityColors[issue.priority] + '15', color: priorityColors[issue.priority],
                  textTransform: 'uppercase', flexShrink: 0,
                }}>{issue.priority}</div>
                <span style={{
                  flex: 1, fontSize: '13px', color: theme.text, fontWeight: '500',
                  textDecoration: issue.resolved ? 'line-through' : 'none',
                }}>{issue.title}</span>
                <span style={{ fontSize: '10px', color: theme.textMuted, flexShrink: 0 }}>
                  {issue.type === 'short' ? 'Short-term' : 'Long-term'}
                </span>
                <button onClick={() => removeIssue(issue.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                  <Trash2 size={13} />
                </button>
              </div>
              {/* Resolve panel — create to-do from IDS */}
              {resolvingId === issue.id && !issue.resolved && (
                <div style={{
                  padding: '12px 14px', backgroundColor: '#22c55e08',
                  border: `1px solid #22c55e30`, borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#22c55e', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Solve — Create action item (optional)
                  </div>
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', alignItems: isMobile ? 'stretch' : 'center' }}>
                    <InlineInput value={todoText} onChange={setTodoText} placeholder="To-do from solving this issue..." theme={theme} style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select value={todoOwner} onChange={e => setTodoOwner(e.target.value)} style={{
                        padding: '8px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '12px', backgroundColor: theme.bg, color: theme.textSecondary, flex: isMobile ? 1 : undefined,
                      }}>
                        <option value="">Who...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                      <SmallBtn onClick={() => resolveIssue(issue.id)} color="#22c55e" theme={theme}><Check size={12} /> Solve</SmallBtn>
                      <SmallBtn onClick={() => setResolvingId(null)} theme={theme}><X size={12} /></SmallBtn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: theme.textMuted, fontSize: '13px' }}>
              {filter === 'open' ? "No open issues. Either you're crushing it or you're not being honest." : 'No issues found.'}
            </div>
          )}
        </div>
      </Card>

      {adding ? (
        <Card theme={theme} style={{ border: `2px solid #ef444440` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <InlineInput value={newIssue.title} onChange={v => setNewIssue(p => ({ ...p, title: v }))} placeholder="What's the issue? State it clearly in one sentence." theme={theme} />
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px' }}>
              <select value={newIssue.priority} onChange={e => setNewIssue(p => ({ ...p, priority: e.target.value }))} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.textSecondary }}>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
              <select value={newIssue.type} onChange={e => setNewIssue(p => ({ ...p, type: e.target.value }))} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.textSecondary }}>
                <option value="short">Short-term (this quarter)</option>
                <option value="long">Long-term (future)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <SmallBtn onClick={() => setAdding(false)} theme={theme}>Cancel</SmallBtn>
              <SmallBtn onClick={addIssue} color="#ef4444" theme={theme}><Plus size={12} /> Add Issue</SmallBtn>
            </div>
          </div>
        </Card>
      ) : (
        <SmallBtn onClick={() => setAdding(true)} color="#ef4444" theme={theme} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
          <Plus size={14} /> Add Issue
        </SmallBtn>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// MEETINGS — L10, QUARTERLY, ANNUAL
// ════════════════════════════════════════════════════════════════════

function L10Tab({ data, save, theme, employees, storeData, entities, isMobile }) {
  const meetings = data.meetings || { l10_day: '', l10_time: '', quarterly_next: '', annual_next: '' }
  const scorecard = data.scorecard || []
  const rocks = data.rocks || []
  const issues = data.issues || []
  const todos = data.todos || []
  const [meetingMode, setMeetingMode] = useState(false)
  const [meetingSeconds, setMeetingSeconds] = useState(90 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [meetingRating, setMeetingRating] = useState(0)
  const [entityFilter, setEntityFilter] = useState('')

  const quarter = getCurrentQuarter()
  const year = getCurrentYear()

  // Meeting timer
  useEffect(() => {
    if (!timerRunning) return
    const iv = setInterval(() => setMeetingSeconds(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(iv)
  }, [timerRunning])

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  // Scorecard: this week vs last week
  const getMetricValues = (m) => {
    const isAuto = m.source && m.source !== 'manual' && AUTO_SOURCES[m.source]
    const ent = m.entity || null
    const thisWeek = isAuto ? computeAutoValue(m.source, storeData, ent) : parseFloat(m.current) || 0
    if (isAuto) {
      const lw = getWeekRange(1)
      const src = AUTO_SOURCES[m.source]
      const lastWeek = src.compute(storeData, lw.start, lw.end, lw.startDate, lw.endDate, ent)
      return { thisWeek, lastWeek, format: src.format }
    }
    return { thisWeek, lastWeek: null, format: null }
  }

  // Group scorecard by owner, filtered by entity
  const groupedMetrics = useMemo(() => {
    let metrics = scorecard
    if (entityFilter) metrics = metrics.filter(m => !m.entity || m.entity.toLowerCase() === entityFilter.toLowerCase())
    const groups = {}
    metrics.forEach(m => {
      const owner = employees.find(e => String(e.id) === String(m.owner_id))
      const key = owner ? owner.name : 'Unassigned'
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    })
    return groups
  }, [scorecard, employees, entityFilter])

  const quarterRocks = rocks.filter(r => r.quarter === quarter && r.year === year)
  const openIssues = issues.filter(i => !i.resolved)
  const activeTodos = todos.filter(t => !t.done)

  const statusLabels = { 'on-track': 'On Track', 'at-risk': 'At Risk', 'off-track': 'Off Track', done: 'Done' }
  const statusColors = { 'on-track': '#22c55e', 'at-risk': '#f59e0b', 'off-track': '#ef4444', done: '#22c55e' }

  if (meetingMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Meeting header with timer */}
        <Card theme={theme} style={{ position: 'sticky', top: 0, zIndex: 10, borderColor: '#8b5cf640' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                fontSize: '28px', fontWeight: '800', fontFamily: 'monospace',
                color: meetingSeconds < 300 ? '#ef4444' : meetingSeconds < 600 ? '#f59e0b' : '#8b5cf6',
              }}>
                {formatTime(meetingSeconds)}
              </div>
              <button onClick={() => setTimerRunning(!timerRunning)} style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                backgroundColor: timerRunning ? '#ef444415' : '#22c55e15',
                color: timerRunning ? '#ef4444' : '#22c55e', fontWeight: '700', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                {timerRunning ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Start</>}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#8b5cf6' }}>Level 10 Meeting</div>
              {entities.length > 0 && (
                <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={{
                  padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`,
                  fontSize: '12px', color: entityFilter ? theme.accent : theme.textMuted, backgroundColor: theme.bg,
                }}>
                  <option value="">All units</option>
                  {entities.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              )}
            </div>
            <SmallBtn onClick={() => { setMeetingMode(false); setTimerRunning(false); setMeetingSeconds(90 * 60) }} theme={theme}><X size={12} /> End Meeting</SmallBtn>
          </div>
        </Card>

        {/* 1. Segue */}
        <Card theme={theme}>
          <SectionHeader icon={MessageSquare} title="Segue" subtitle="5 min — share good news (personal & professional)" color="#22c55e" theme={theme} help="The Segue starts the meeting on a positive note. Each person shares one personal and one professional piece of good news from the past week. It builds connection and sets the tone." />
          <div style={{ fontSize: '12px', color: theme.textMuted, fontStyle: 'italic' }}>Go around the room. One personal, one professional good thing this week.</div>
        </Card>

        {/* 2. Scorecard */}
        <Card theme={theme}>
          <SectionHeader icon={BarChart3} title="Scorecard" subtitle="5 min — are we hitting our numbers?" color="#3b82f6" theme={theme} help="Quick review of this week's numbers vs last week. Don't discuss — just report. If a number is off track, drop it down to the Issues List to IDS later." />
          {Object.entries(groupedMetrics).map(([ownerName, metrics]) => (
            <div key={ownerName} style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: theme.accent, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{ownerName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 70px 70px' : '2fr 80px 80px', gap: '4px' }}>
                <div style={{ fontSize: '9px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', padding: '0 8px' }}>Metric</div>
                <div style={{ fontSize: '9px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'center' }}>This Wk</div>
                <div style={{ fontSize: '9px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'center' }}>Last Wk</div>
                {metrics.map(m => {
                  const vals = getMetricValues(m)
                  const goal = parseFloat(m.goal)
                  const hitGoal = !isNaN(goal) && !isNaN(vals.thisWeek) && (m.type === 'lte' ? vals.thisWeek <= goal : vals.thisWeek >= goal)
                  return (
                    <React.Fragment key={m.id}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, padding: '4px 8px' }}>{m.metric}</div>
                      <div style={{
                        fontSize: '13px', fontWeight: '700', textAlign: 'center', padding: '4px',
                        borderRadius: '4px', backgroundColor: hitGoal ? '#22c55e10' : isNaN(goal) ? 'transparent' : '#ef444410',
                        color: hitGoal ? '#22c55e' : isNaN(goal) ? theme.text : '#ef4444',
                      }}>{formatMetricValue(vals.thisWeek, vals.format)}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', padding: '4px' }}>
                        {vals.lastWeek != null ? formatMetricValue(vals.lastWeek, vals.format) : '—'}
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          ))}
          {scorecard.length === 0 && <div style={{ fontSize: '12px', color: theme.textMuted }}>No scorecard metrics configured yet.</div>}
        </Card>

        {/* 3. Rock Review */}
        <Card theme={theme}>
          <SectionHeader icon={Target} title="Rock Review" subtitle={`5 min — Q${quarter} ${year} rocks`} color="#22c55e" theme={theme} help="Each rock owner reports 'on track' or 'off track' — that's it. No lengthy updates. If a rock is off track, drop it to the Issues List. The goal is awareness, not problem-solving." />
          {quarterRocks.map(rock => {
            const owner = employees.find(e => String(e.id) === String(rock.owner_id))
            return (
              <div key={rock.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                <button onClick={() => {
                  const order = ['on-track', 'at-risk', 'off-track', 'done']
                  const next = order[(order.indexOf(rock.status) + 1) % order.length]
                  save('rocks', rocks.map(r => r.id === rock.id ? { ...r, status: next } : r))
                }} style={{
                  padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '700',
                  border: 'none', cursor: 'pointer', backgroundColor: statusColors[rock.status] + '15', color: statusColors[rock.status],
                }}>
                  {statusLabels[rock.status]}
                </button>
                <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{rock.title}</span>
                {owner && <span style={{ fontSize: '11px', color: theme.textSecondary }}>{owner.name}</span>}
              </div>
            )
          })}
          {quarterRocks.length === 0 && <div style={{ fontSize: '12px', color: theme.textMuted }}>No rocks this quarter.</div>}
        </Card>

        {/* 4. To-Do Review */}
        <Card theme={theme}>
          <SectionHeader icon={ListChecks} title="To-Do List" subtitle={`5 min — ${activeTodos.length} active items`} color="#8b5cf6" theme={theme} help="Review last week's to-dos. Each is either done or not done — no excuses, no stories. Incomplete items get re-committed or moved to the Issues List. Target 90%+ completion rate." />
          {todos.filter(t => !t.done).map(todo => {
            const owner = employees.find(e => String(e.id) === String(todo.owner_id))
            return (
              <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                <button onClick={() => save('todos', todos.map(t => t.id === todo.id ? { ...t, done: true } : t))} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Circle size={16} color={theme.border} />
                </button>
                <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{todo.text}</span>
                {owner && <span style={{ fontSize: '11px', color: theme.textSecondary }}>{owner.name}</span>}
              </div>
            )
          })}
          {activeTodos.length === 0 && <div style={{ fontSize: '12px', color: theme.textMuted }}>All clear.</div>}
        </Card>

        {/* 5. IDS */}
        <Card theme={theme}>
          <SectionHeader icon={AlertCircle} title="IDS — Identify, Discuss, Solve" subtitle={`60 min — ${openIssues.length} open issues`} color="#ef4444" theme={theme} help="This is the heart of the L10 — 60 minutes to solve your biggest issues. Prioritize the top 3, then IDS each one: Identify the real root cause, Discuss openly, then Solve with a clear action (to-do, decision, or process change). Stay on one issue until it's solved." />
          {openIssues.sort((a, b) => {
            const p = { high: 0, medium: 1, low: 2 }
            return (p[a.priority] || 1) - (p[b.priority] || 1)
          }).map(issue => (
            <div key={issue.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{
                padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '700',
                backgroundColor: ({ high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' })[issue.priority] + '15',
                color: ({ high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' })[issue.priority],
                textTransform: 'uppercase',
              }}>{issue.priority}</div>
              <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{issue.title}</span>
            </div>
          ))}
          {openIssues.length === 0 && <div style={{ fontSize: '12px', color: theme.textMuted }}>No open issues.</div>}
        </Card>

        {/* 6. Conclude */}
        <Card theme={theme}>
          <SectionHeader icon={Check} title="Conclude" subtitle="5 min — recap to-dos, cascading messages, rate 1-10" color="#8b5cf6" theme={theme} help="Wrap up: recap new to-dos so everyone is clear, agree on cascading messages (what to communicate to your teams), and rate the meeting 1-10. A great L10 averages 8+. If it's consistently low, IDS the meeting itself." />
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: '12px', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>Rate this meeting:</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button key={n} onClick={() => setMeetingRating(n)} style={{
                  width: '32px', height: '32px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '700',
                  backgroundColor: meetingRating === n ? (n >= 8 ? '#22c55e' : n >= 5 ? '#f59e0b' : '#ef4444') : theme.bg,
                  color: meetingRating === n ? '#fff' : theme.textMuted,
                }}>{n}</button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Settings view (non-meeting mode)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Start Meeting CTA */}
      <Card theme={theme} style={{ textAlign: 'center', borderColor: '#8b5cf640' }}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>Level 10 Meeting</div>
        {meetings.l10_day && meetings.l10_time && (
          <div style={{ fontSize: '13px', color: '#8b5cf6', fontWeight: '600', marginBottom: '12px' }}>
            Every {meetings.l10_day} at {meetings.l10_time}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, auto)', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
          <div style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#3b82f610', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#3b82f6' }}>{scorecard.length}</div>
            <div style={{ fontSize: '10px', color: theme.textMuted }}>Metrics</div>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#22c55e10', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#22c55e' }}>{quarterRocks.length}</div>
            <div style={{ fontSize: '10px', color: theme.textMuted }}>Rocks</div>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#ef444410', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#ef4444' }}>{openIssues.length}</div>
            <div style={{ fontSize: '10px', color: theme.textMuted }}>Issues</div>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#8b5cf610', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#8b5cf6' }}>{activeTodos.length}</div>
            <div style={{ fontSize: '10px', color: theme.textMuted }}>To-Dos</div>
          </div>
        </div>
        <button onClick={() => { setMeetingMode(true); setMeetingSeconds(90 * 60); setMeetingRating(0) }} style={{
          padding: '12px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: '700',
          border: 'none', cursor: 'pointer', backgroundColor: '#8b5cf6', color: '#fff',
          display: 'inline-flex', alignItems: 'center', gap: '8px',
        }}>
          <Play size={16} /> Start L10 Meeting
        </button>
      </Card>

      {/* Meeting Settings */}
      <Card theme={theme}>
        <SectionHeader icon={Clock} title="Meeting Schedule" subtitle="Same day, same time, every week" color="#8b5cf6" theme={theme} help="Consistency is key — pick a day and time for your weekly L10 and never move it. Most teams choose Tuesday-Thursday mornings. The meeting starts on time and ends on time, every week." />
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Day</label>
            <select value={meetings.l10_day} onChange={e => save('meetings', { ...meetings, l10_day: e.target.value })} style={{
              padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.text,
            }}>
              <option value="">Select day...</option>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Time</label>
            <input type="time" value={meetings.l10_time || ''} onChange={e => save('meetings', { ...meetings, l10_time: e.target.value })} style={{
              padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.text,
            }} />
          </div>
        </div>
      </Card>

      {/* Quarterly & Annual */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
        <Card theme={theme}>
          <SectionHeader icon={Calendar} title="Quarterly" subtitle="Full-day every 90 days" color="#22c55e" theme={theme} help="Every 90 days, the leadership team steps back for a full-day session to review last quarter's Rocks, set new ones, update the V/TO, and clear the big Issues. This is where strategic decisions happen." />
          <input type="date" value={meetings.quarterly_next || ''} onChange={e => save('meetings', { ...meetings, quarterly_next: e.target.value })} style={{
            padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.text, width: '100%',
          }} />
          {meetings.quarterly_next && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Timer size={14} color="#22c55e" />
              <CountdownTimer targetDate={meetings.quarterly_next} theme={theme} />
            </div>
          )}
        </Card>
        <Card theme={theme}>
          <SectionHeader icon={Calendar} title="Annual" subtitle="2-day offsite for V/TO" color="#3b82f6" theme={theme} help="Once a year, the leadership team goes offsite for 2 days to work ON the business. Review and refresh the entire V/TO, set the 1-Year Plan, evaluate the team (People Analyzer), and align on the big picture." />
          <input type="date" value={meetings.annual_next || ''} onChange={e => save('meetings', { ...meetings, annual_next: e.target.value })} style={{
            padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.text, width: '100%',
          }} />
          {meetings.annual_next && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Timer size={14} color="#3b82f6" />
              <CountdownTimer targetDate={meetings.annual_next} theme={theme} />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// DASHBOARD — 90-DAY ROLLING METRICS
// ════════════════════════════════════════════════════════════════════

function DashboardTab({ data, theme, employees, storeData, entities, isMobile }) {
  const scorecard = data.scorecard || []
  const [dashEntity, setDashEntity] = useState('')

  // Compute 13-week history for each auto-sourced metric
  const weeklyData = useMemo(() => {
    const weeks = []
    for (let i = 12; i >= 0; i--) weeks.push(getWeekRange(i))

    return scorecard.map(m => {
      const isAuto = m.source && m.source !== 'manual' && AUTO_SOURCES[m.source]
      if (!isAuto) return { metric: m, values: [], avg: null }

      // Use metric's own entity, or the dashboard-level filter
      const entity = m.entity || dashEntity || null

      const src = AUTO_SOURCES[m.source]
      const values = weeks.map(w => ({
        label: w.label,
        value: src.compute(storeData, w.start, w.end, w.startDate, w.endDate, entity),
      }))
      const nonZero = values.filter(v => v.value > 0)
      const avg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v.value, 0) / nonZero.length : 0
      return { metric: m, values, avg, format: src.format }
    })
  }, [scorecard, storeData, dashEntity])

  const autoMetrics = weeklyData.filter(d => d.values.length > 0)

  if (autoMetrics.length === 0) {
    return (
      <Card theme={theme}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Activity size={32} color={theme.textMuted} style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>No Live Metrics Yet</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            Add auto-sourced metrics in the Scorecard tab to see 90-day trends here.
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Division filter */}
      {entities.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Business Unit:</span>
          <button onClick={() => setDashEntity('')} style={{
            padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
            border: !dashEntity ? 'none' : `1px solid ${theme.border}`,
            backgroundColor: !dashEntity ? theme.accent : 'transparent',
            color: !dashEntity ? '#fff' : theme.textMuted, cursor: 'pointer',
          }}>All</button>
          {entities.map(e => (
            <button key={e} onClick={() => setDashEntity(e)} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
              border: dashEntity === e ? 'none' : `1px solid ${theme.border}`,
              backgroundColor: dashEntity === e ? theme.accent : 'transparent',
              color: dashEntity === e ? '#fff' : theme.textMuted, cursor: 'pointer',
            }}>{e}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {autoMetrics.map(({ metric: m, values, avg, format }) => {
          const current = values[values.length - 1]?.value || 0
          const prev = values[values.length - 2]?.value || 0
          const trend = prev > 0 ? ((current - prev) / prev) * 100 : 0
          const goal = parseFloat(m.goal)
          const hitGoal = !isNaN(goal) && (m.type === 'lte' ? current <= goal : current >= goal)
          const maxVal = Math.max(...values.map(v => v.value), 1)

          return (
            <Card key={m.id} theme={theme}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600' }}>{m.metric}</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: hitGoal ? '#22c55e' : theme.text }}>
                    {formatMetricValue(current, format)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {trend !== 0 && (
                    <div style={{
                      fontSize: '12px', fontWeight: '700',
                      color: (m.type === 'lte' ? trend < 0 : trend > 0) ? '#22c55e' : '#ef4444',
                    }}>
                      {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: theme.textMuted }}>vs last week</div>
                </div>
              </div>

              {/* Mini bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '48px', marginBottom: '8px' }}>
                {values.map((v, i) => (
                  <div key={i} style={{
                    flex: 1, borderRadius: '2px 2px 0 0',
                    height: `${Math.max(2, (v.value / maxVal) * 100)}%`,
                    backgroundColor: i === values.length - 1 ? '#8b5cf6' : '#8b5cf625',
                    transition: 'height 0.3s',
                  }} title={`${v.label}: ${formatMetricValue(v.value, format)}`} />
                ))}
              </div>

              {/* 90-day avg + goal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: theme.textMuted }}>90d avg: <strong style={{ color: theme.text }}>{formatMetricValue(avg, format)}</strong></span>
                {m.goal && <span style={{ color: theme.textMuted }}>Goal: <strong style={{ color: hitGoal ? '#22c55e' : '#ef4444' }}>{m.goal}</strong></span>}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// PEOPLE — ACCOUNTABILITY CHART + GWC + PEOPLE ANALYZER + 5-5-5
// ════════════════════════════════════════════════════════════════════

function SeatCard({ seat, employees, theme, color, onUpdate, onRemove }) {
  const person = employees.find(e => String(e.id) === String(seat.person_id))
  const gwc = seat.gwc || { g: null, w: null, c: null }
  const gwcAll = gwc.g === true && gwc.w === true && gwc.c === true
  const gwcLabels = { g: 'Get It', w: 'Want It', c: 'Capacity' }

  return (
    <div style={{
      padding: '0', borderRadius: '12px', backgroundColor: theme.bgCard || '#fff',
      border: `2px solid ${color}30`, position: 'relative', overflow: 'hidden',
      minWidth: '220px',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{seat.seat}</span>
        <button onClick={onRemove} style={{ padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff80' }}><X size={12} /></button>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {/* Person */}
        <select value={seat.person_id || ''} onChange={e => onUpdate({ person_id: e.target.value || null })} style={{
          width: '100%', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`,
          fontSize: '13px', fontWeight: '600', color: person ? theme.text : theme.textMuted,
          backgroundColor: theme.bg, marginBottom: '10px',
        }}>
          <option value="">Assign person...</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        {/* 5 Roles */}
        <div style={{ fontSize: '10px', fontWeight: '700', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>5 Roles</div>
        {[0, 1, 2, 3, 4].map(i => (
          <LocalInput key={i} value={(seat.roles || [])[i] || ''} onChange={v => {
            const roles = [...(seat.roles || ['', '', '', '', ''])]
            while (roles.length < 5) roles.push('')
            roles[i] = v
            onUpdate({ roles })
          }} placeholder={`Role ${i + 1}`} style={{
            width: '100%', padding: '3px 8px', fontSize: '12px', color: theme.text,
            border: 'none', borderBottom: `1px solid ${theme.border}`, outline: 'none',
            backgroundColor: 'transparent', marginBottom: '1px',
          }} />
        ))}

        {/* GWC */}
        {person && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '4px' }}>
            {['g', 'w', 'c'].map(key => (
              <button key={key} onClick={() => {
                const val = gwc[key] === true ? false : gwc[key] === false ? null : true
                onUpdate({ gwc: { ...gwc, [key]: val } })
              }} title={`${gwcLabels[key]}: ${gwc[key] === true ? 'Yes' : gwc[key] === false ? 'No' : 'Not rated'}`} style={{
                flex: 1, padding: '4px', borderRadius: '4px', fontSize: '10px', fontWeight: '700',
                border: `1px solid ${gwc[key] === true ? '#22c55e40' : gwc[key] === false ? '#ef444440' : theme.border}`,
                backgroundColor: gwc[key] === true ? '#22c55e10' : gwc[key] === false ? '#ef444410' : 'transparent',
                color: gwc[key] === true ? '#22c55e' : gwc[key] === false ? '#ef4444' : theme.textMuted,
                cursor: 'pointer', textAlign: 'center',
              }}>
                {key.toUpperCase()}: {gwc[key] === true ? 'Y' : gwc[key] === false ? 'N' : '?'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PeopleTab({ data, save, theme, employees, isMobile }) {
  const chart = data.accountability || []
  const analyzer = data.people_analyzer || {}
  const coreValues = data.core_values || []
  const convos = data.quarterly_convos || []
  const [subTab, setSubTab] = useState('chart')
  const [adding, setAdding] = useState(false)
  const [newSeat, setNewSeat] = useState({ seat: '', level: 2 })
  const [convoEmployee, setConvoEmployee] = useState('')

  const seatColors = ['#8b5cf6', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#f97316', '#6366f1', '#14b8a6']

  const updateSeat = (id, changes) => save('accountability', chart.map(s => s.id === id ? { ...s, ...changes } : s))
  const removeSeat = (id) => save('accountability', chart.filter(s => s.id !== id))

  const addSeat = () => {
    if (!newSeat.seat.trim()) return
    save('accountability', [...chart, {
      id: crypto.randomUUID(),
      seat: newSeat.seat.trim(),
      person_id: null,
      roles: ['', '', '', '', ''],
      gwc: { g: null, w: null, c: null },
      level: newSeat.level,
    }])
    setNewSeat({ seat: '', level: 2 })
    setAdding(false)
  }

  const initDefault = () => {
    save('accountability', [
      { id: crypto.randomUUID(), seat: 'Visionary', person_id: null, roles: ['', '', '', '', ''], gwc: { g: null, w: null, c: null }, level: 0 },
      { id: crypto.randomUUID(), seat: 'Integrator', person_id: null, roles: ['', '', '', '', ''], gwc: { g: null, w: null, c: null }, level: 1 },
      { id: crypto.randomUUID(), seat: 'Sales/Marketing', person_id: null, roles: ['', '', '', '', ''], gwc: { g: null, w: null, c: null }, level: 2 },
      { id: crypto.randomUUID(), seat: 'Operations', person_id: null, roles: ['', '', '', '', ''], gwc: { g: null, w: null, c: null }, level: 2 },
      { id: crypto.randomUUID(), seat: 'Finance', person_id: null, roles: ['', '', '', '', ''], gwc: { g: null, w: null, c: null }, level: 2 },
    ])
  }

  // People Analyzer
  const updateAnalyzer = (empId, field, val) => {
    const updated = { ...analyzer, [empId]: { ...(analyzer[empId] || {}), [field]: val } }
    save('people_analyzer', updated)
  }

  const ratingCycle = (current) => current === '+' ? '+/-' : current === '+/-' ? '-' : '+'
  const ratingColor = (r) => r === '+' ? '#22c55e' : r === '-' ? '#ef4444' : '#f59e0b'

  // 5-5-5 Quarterly
  const selectedEmployee = employees.find(e => String(e.id) === String(convoEmployee))
  const selectedSeat = chart.find(s => String(s.person_id) === String(convoEmployee))
  const existingConvo = convos.find(c => String(c.employee_id) === String(convoEmployee))

  const saveConvo = (updates) => {
    const idx = convos.findIndex(c => String(c.employee_id) === String(convoEmployee))
    if (idx >= 0) {
      const updated = [...convos]
      updated[idx] = { ...updated[idx], ...updates }
      save('quarterly_convos', updated)
    } else {
      save('quarterly_convos', [...convos, {
        id: crypto.randomUUID(),
        employee_id: convoEmployee,
        date: new Date().toISOString().slice(0, 10),
        values_ratings: coreValues.map(() => null),
        roles_ratings: [null, null, null, null, null],
        rocks_ratings: [],
        ...updates,
      }])
    }
  }

  const subTabs = [
    { id: 'chart', label: 'Accountability Chart', icon: Layers },
    { id: 'analyzer', label: 'People Analyzer', icon: UserCheck },
    { id: 'five', label: '5-5-5', icon: Star },
  ]

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {subTabs.map(st => (
          <button key={st.id} onClick={() => setSubTab(st.id)} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
            border: subTab === st.id ? 'none' : `1px solid ${theme.border}`,
            backgroundColor: subTab === st.id ? theme.accent : 'transparent',
            color: subTab === st.id ? '#fff' : theme.textMuted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            <st.icon size={13} /> {isMobile ? st.label.split(' ')[0] : st.label}
          </button>
        ))}
      </div>

      {/* ─── Accountability Chart ─── */}
      {subTab === 'chart' && (
        <div>
          {chart.length === 0 && !adding ? (
            <Card theme={theme} style={{ textAlign: 'center', padding: '32px' }}>
              <Layers size={32} color={theme.textMuted} style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Build Your Accountability Chart</div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>Start with the standard EOS structure: Visionary, Integrator, and functional seats.</div>
              <button onClick={initDefault} style={{
                padding: '10px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                border: 'none', cursor: 'pointer', backgroundColor: '#8b5cf6', color: '#fff',
              }}>Create Default Chart</button>
            </Card>
          ) : (
            <>
              {/* Level 0: Visionary */}
              {chart.filter(s => (s.level || 0) === 0).length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  {chart.filter(s => (s.level || 0) === 0).map((seat, i) => (
                    <SeatCard key={seat.id} seat={seat} employees={employees} theme={theme}
                      color={seatColors[0]} onUpdate={c => updateSeat(seat.id, c)} onRemove={() => removeSeat(seat.id)} />
                  ))}
                </div>
              )}

              {/* Connector line */}
              {chart.filter(s => (s.level || 0) === 0).length > 0 && chart.filter(s => s.level === 1).length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <div style={{ width: '2px', height: '24px', backgroundColor: theme.border }} />
                </div>
              )}

              {/* Level 1: Integrator */}
              {chart.filter(s => s.level === 1).length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  {chart.filter(s => s.level === 1).map(seat => (
                    <SeatCard key={seat.id} seat={seat} employees={employees} theme={theme}
                      color={seatColors[1]} onUpdate={c => updateSeat(seat.id, c)} onRemove={() => removeSeat(seat.id)} />
                  ))}
                </div>
              )}

              {/* Connector line to departments */}
              {chart.filter(s => s.level === 1).length > 0 && chart.filter(s => (s.level || 0) >= 2).length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <div style={{ width: '2px', height: '24px', backgroundColor: theme.border }} />
                </div>
              )}

              {/* Level 2+: Functional seats */}
              {chart.filter(s => (s.level || 0) >= 2).length > 0 && (
                <div style={{
                  display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap',
                  position: 'relative', paddingTop: '0',
                }}>
                  {chart.filter(s => (s.level || 0) >= 2).map((seat, i) => (
                    <SeatCard key={seat.id} seat={seat} employees={employees} theme={theme}
                      color={seatColors[(i + 2) % seatColors.length]}
                      onUpdate={c => updateSeat(seat.id, c)} onRemove={() => removeSeat(seat.id)} />
                  ))}
                </div>
              )}

              {/* Add seat */}
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                {adding ? (
                  <Card theme={theme} style={{ border: `2px solid #8b5cf640`, maxWidth: '360px', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <InlineInput value={newSeat.seat} onChange={v => setNewSeat(p => ({ ...p, seat: v }))} placeholder="Seat name (e.g., Head of Sales)" theme={theme} />
                      <select value={newSeat.level} onChange={e => setNewSeat(p => ({ ...p, level: Number(e.target.value) }))} style={{
                        padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '13px', backgroundColor: theme.bg, color: theme.textSecondary,
                      }}>
                        <option value={0}>Level: Visionary</option>
                        <option value={1}>Level: Integrator</option>
                        <option value={2}>Level: Department Head</option>
                        <option value={3}>Level: Sub-department</option>
                      </select>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <SmallBtn onClick={() => setAdding(false)} theme={theme}>Cancel</SmallBtn>
                        <SmallBtn onClick={addSeat} color="#8b5cf6" theme={theme}><Plus size={12} /> Add</SmallBtn>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <SmallBtn onClick={() => setAdding(true)} color="#8b5cf6" theme={theme}><Plus size={12} /> Add Seat</SmallBtn>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── People Analyzer ─── */}
      {subTab === 'analyzer' && (
        <Card theme={theme}>
          <SectionHeader icon={UserCheck} title="People Analyzer" subtitle="Rate each person on core values + GWC" color="#f59e0b" theme={theme} help="The People Analyzer rates each team member on your Core Values (+, +/-, -) and GWC (Gets it, Wants it, Capacity to do it). Use it quarterly to ensure you have the Right People in the Right Seats. The bar is 'mostly +' on values and yes on all three GWC." />
          {coreValues.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
              Add core values in the V/TO tab first.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: `2px solid ${theme.border}`, color: theme.textMuted, fontWeight: '700', fontSize: '10px', textTransform: 'uppercase' }}>Person</th>
                    {coreValues.map((cv, i) => (
                      <th key={i} style={{ textAlign: 'center', padding: '8px', borderBottom: `2px solid ${theme.border}`, color: theme.textMuted, fontWeight: '700', fontSize: '10px', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cv.value}>
                        {cv.value?.slice(0, 8)}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center', padding: '8px', borderBottom: `2px solid ${theme.border}`, color: theme.textMuted, fontWeight: '700', fontSize: '10px', borderLeft: `2px solid ${theme.border}` }}>+/=/-</th>
                    <th style={{ textAlign: 'center', padding: '8px', borderBottom: `2px solid ${theme.border}`, color: '#22c55e', fontWeight: '700', fontSize: '10px' }}>GWC</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.filter(e => e.active !== false).map(emp => {
                    const ratings = analyzer[emp.id] || {}
                    const valueRatings = coreValues.map((cv, i) => ratings[`v${i}`] || null)
                    const plusCount = valueRatings.filter(r => r === '+').length
                    const minusCount = valueRatings.filter(r => r === '-').length
                    const bar = `${plusCount}/${valueRatings.filter(r => r === '+/-').length}/${minusCount}`
                    const gwcPass = ratings.gwc_g === true && ratings.gwc_w === true && ratings.gwc_c === true
                    return (
                      <tr key={emp.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '8px', fontWeight: '600', color: theme.text, whiteSpace: 'nowrap' }}>{emp.name}</td>
                        {coreValues.map((cv, i) => {
                          const r = ratings[`v${i}`]
                          return (
                            <td key={i} style={{ textAlign: 'center', padding: '4px' }}>
                              <button onClick={() => updateAnalyzer(emp.id, `v${i}`, r ? ratingCycle(r) : '+')} style={{
                                width: '32px', height: '28px', borderRadius: '4px', fontSize: '12px', fontWeight: '800',
                                border: `1px solid ${r ? ratingColor(r) + '40' : theme.border}`,
                                backgroundColor: r ? ratingColor(r) + '10' : 'transparent',
                                color: r ? ratingColor(r) : theme.textMuted,
                                cursor: 'pointer',
                              }}>
                                {r || '?'}
                              </button>
                            </td>
                          )
                        })}
                        <td style={{ textAlign: 'center', padding: '8px', fontSize: '11px', fontWeight: '600', color: theme.textSecondary, borderLeft: `2px solid ${theme.border}` }}>{bar}</td>
                        <td style={{ textAlign: 'center', padding: '4px' }}>
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                            {['g', 'w', 'c'].map(key => (
                              <button key={key} onClick={() => {
                                const cur = ratings[`gwc_${key}`]
                                updateAnalyzer(emp.id, `gwc_${key}`, cur === true ? false : cur === false ? null : true)
                              }} style={{
                                width: '22px', height: '22px', borderRadius: '3px', fontSize: '9px', fontWeight: '800',
                                border: 'none', cursor: 'pointer',
                                backgroundColor: ratings[`gwc_${key}`] === true ? '#22c55e20' : ratings[`gwc_${key}`] === false ? '#ef444420' : theme.bg,
                                color: ratings[`gwc_${key}`] === true ? '#22c55e' : ratings[`gwc_${key}`] === false ? '#ef4444' : theme.textMuted,
                              }}>
                                {key.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: theme.bg, fontSize: '11px', color: theme.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: theme.text }}>How to use:</strong> Click each cell to cycle through <strong style={{ color: '#22c55e' }}>+</strong> (matches), <strong style={{ color: '#f59e0b' }}>+/-</strong> (sometimes), <strong style={{ color: '#ef4444' }}>-</strong> (doesn't match). GWC = <strong>G</strong>et it (understands the role), <strong>W</strong>ant it (truly wants it), <strong>C</strong>apacity (time, skills, knowledge). A person is a fit when all values are + and all GWC are Y.
          </div>
        </Card>
      )}

      {/* ─── 5-5-5 Quarterly Conversation ─── */}
      {subTab === 'five' && (
        <Card theme={theme}>
          <SectionHeader icon={Star} title="5-5-5 Quarterly Conversation" subtitle="Review core values, roles, and rocks with each direct report" color="#f59e0b" theme={theme} help="The 5-5-5 is a 30-minute quarterly check-in with each direct report. Review 5 Core Values (are they living them?), 5 Roles (from their Accountability Chart seat), and their quarterly Rocks. It's a structured conversation — not a performance review — that keeps everyone aligned." />

          <div style={{ marginBottom: '16px' }}>
            <select value={convoEmployee} onChange={e => setConvoEmployee(e.target.value)} style={{
              padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
              fontSize: '13px', backgroundColor: theme.bg, color: theme.text, minWidth: '200px',
            }}>
              <option value="">Select a team member...</option>
              {employees.filter(e => e.active !== false).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {selectedEmployee ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 5 Core Values */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Heart size={14} color="#ef4444" /> 5 Core Values
                </div>
                {coreValues.length > 0 ? coreValues.map((cv, i) => {
                  const rating = existingConvo?.values_ratings?.[i]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{cv.value}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['+', '+/-', '-'].map(r => (
                          <button key={r} onClick={() => {
                            const ratings = [...(existingConvo?.values_ratings || coreValues.map(() => null))]
                            ratings[i] = r
                            saveConvo({ values_ratings: ratings })
                          }} style={{
                            padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                            border: rating === r ? 'none' : `1px solid ${theme.border}`,
                            backgroundColor: rating === r ? ratingColor(r) + '15' : 'transparent',
                            color: rating === r ? ratingColor(r) : theme.textMuted,
                            cursor: 'pointer',
                          }}>{r}</button>
                        ))}
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>Add core values in the V/TO tab first.</div>
                )}
              </div>

              {/* 5 Roles */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} color="#8b5cf6" /> 5 Roles (from their seat)
                </div>
                {selectedSeat ? (selectedSeat.roles || []).filter(r => r.trim()).map((role, i) => {
                  const rating = existingConvo?.roles_ratings?.[i]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{role}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['+', '+/-', '-'].map(r => (
                          <button key={r} onClick={() => {
                            const ratings = [...(existingConvo?.roles_ratings || [null, null, null, null, null])]
                            ratings[i] = r
                            saveConvo({ roles_ratings: ratings })
                          }} style={{
                            padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                            border: rating === r ? 'none' : `1px solid ${theme.border}`,
                            backgroundColor: rating === r ? ratingColor(r) + '15' : 'transparent',
                            color: rating === r ? ratingColor(r) : theme.textMuted,
                            cursor: 'pointer',
                          }}>{r}</button>
                        ))}
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>This person isn't assigned to a seat yet. Assign them in the Accountability Chart.</div>
                )}
              </div>

              {/* Rocks review — pull from current quarter */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={14} color="#22c55e" /> Rocks (Q{getCurrentQuarter()} {getCurrentYear()})
                </div>
                {(() => {
                  const q = getCurrentQuarter(), y = getCurrentYear()
                  const empRocks = (data.rocks || []).filter(r => r.quarter === q && r.year === y && String(r.owner_id) === String(convoEmployee))
                  if (empRocks.length === 0) return <div style={{ fontSize: '12px', color: theme.textMuted }}>No rocks assigned this quarter.</div>
                  return empRocks.map(rock => {
                    const statusC = { 'on-track': '#22c55e', 'at-risk': '#f59e0b', 'off-track': '#ef4444', done: '#22c55e' }
                    return (
                      <div key={rock.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700',
                          backgroundColor: (statusC[rock.status] || theme.textMuted) + '15',
                          color: statusC[rock.status] || theme.textMuted,
                        }}>{rock.status === 'done' ? 'Done' : rock.status === 'on-track' ? 'On Track' : rock.status === 'at-risk' ? 'At Risk' : 'Off Track'}</span>
                        <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{rock.title}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', color: theme.textMuted, fontSize: '13px' }}>
              Select a team member above to start the 5-5-5 quarterly conversation.
            </div>
          )}

          <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '8px', backgroundColor: theme.bg, fontSize: '11px', color: theme.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: theme.text }}>5-5-5:</strong> Each quarter, sit down with every direct report and review: their alignment with the <strong>5 core values</strong>, performance on their <strong>5 roles/responsibilities</strong>, and progress on their <strong>quarterly rocks</strong>. Rate each + / +/- / -. Three consecutive - ratings on a core value means the person may not be a fit.
          </div>
        </Card>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TOOLBOX — EOS FRAMEWORKS & TOOLS
// ════════════════════════════════════════════════════════════════════

function ToolboxTab({ theme, isMobile }) {
  const [expanded, setExpanded] = useState('smart')

  const tools = [
    {
      id: 'smart', icon: Target, color: '#22c55e', title: 'SMART Rocks',
      subtitle: 'How to set rocks that actually get done',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { letter: 'S', word: 'Specific', desc: 'Clearly define what "done" looks like. Not "Improve sales" but "Close 20 new accounts in Q1."' },
            { letter: 'M', word: 'Measurable', desc: 'Attach a number. If you can\'t measure it, you can\'t manage it.' },
            { letter: 'A', word: 'Attainable', desc: 'Stretch but realistic. Should be 70-80% confident you can hit it.' },
            { letter: 'R', word: 'Realistic', desc: 'Does this person have the time, resources, and authority to accomplish this?' },
            { letter: 'T', word: 'Timely', desc: 'Due by end of quarter. 90 days. No extensions. Done or not done.' },
          ].map(item => (
            <div key={item.letter} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 14px', borderRadius: '8px', backgroundColor: theme.bg }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#22c55e15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: '18px', fontWeight: '900', color: '#22c55e',
              }}>{item.letter}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text }}>{item.word}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#22c55e08', border: '1px solid #22c55e20', fontSize: '12px', color: theme.textSecondary, lineHeight: 1.6 }}>
            <strong style={{ color: '#22c55e' }}>Rock test:</strong> Can someone outside the company read this rock and know exactly what it means? If not, rewrite it. A rock should be completable by one person, not a team aspiration.
          </div>
        </div>
      ),
    },
    {
      id: 'ids', icon: AlertCircle, color: '#ef4444', title: 'IDS — Issue Solving Track',
      subtitle: 'The 3-step process for solving any issue',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { step: '1', title: 'Identify', desc: 'State the real issue in one sentence. Not the symptom — the root cause. Ask "why" 3 times. Most issues discussed in meetings are symptoms of a deeper problem.', color: '#ef4444' },
            { step: '2', title: 'Discuss', desc: 'Everyone gets input. No tangents — stay on the issue. The person who raised it talks first. Others ask questions and share perspectives. No politics or ego. 10 minutes max per issue.', color: '#f59e0b' },
            { step: '3', title: 'Solve', desc: 'End with a to-do: WHO does WHAT by WHEN. One owner, one action, 7-day deadline. If it needs multiple steps, create multiple to-dos. Not "we should think about..." — concrete action.', color: '#22c55e' },
          ].map(item => (
            <div key={item.step} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', borderRadius: '10px', border: `1px solid ${item.color}25`, backgroundColor: item.color + '05' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', backgroundColor: item.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: '18px', fontWeight: '900', color: item.color,
              }}>{item.step}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: item.color, marginBottom: '4px' }}>{item.title}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: theme.bg, fontSize: '12px', color: theme.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: theme.text }}>Rules:</strong> Tackle issues in priority order (top 3 first). Don't skip to solutions. If an issue has been on the list for 3+ weeks, it's either not a real issue or you haven't identified the root cause. Kill it or reframe it.
          </div>
        </div>
      ),
    },
    {
      id: 'gwc', icon: UserCheck, color: '#3b82f6', title: 'GWC — Right Person, Right Seat',
      subtitle: 'Three questions to determine if someone fits their role',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { letter: 'G', word: 'Get It', desc: 'Do they truly understand the role, the culture, the systems, the pace, and how the job fits into the bigger picture? This is innate — you can\'t train someone to "get it."', color: '#3b82f6' },
            { letter: 'W', word: 'Want It', desc: 'Do they genuinely want this role? Not just the title or the paycheck — the actual work, the responsibilities, the challenges. A person who doesn\'t want it will drain the team.', color: '#8b5cf6' },
            { letter: 'C', word: 'Capacity', desc: 'Do they have the time, skills, knowledge, and emotional bandwidth to do the job? Capacity can sometimes be developed. Get It and Want It cannot.', color: '#22c55e' },
          ].map(item => (
            <div key={item.letter} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px', borderRadius: '10px', border: `1px solid ${item.color}25`, backgroundColor: item.color + '05' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', backgroundColor: item.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: '20px', fontWeight: '900', color: item.color,
              }}>{item.letter}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: item.color, marginBottom: '4px' }}>{item.word}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#3b82f608', border: '1px solid #3b82f620', fontSize: '12px', color: theme.textSecondary, lineHeight: 1.6 }}>
            <strong style={{ color: '#3b82f6' }}>All three must be YES.</strong> If any one is a No, you have a people issue. The three options: move them to a different seat, help them develop (only works for Capacity), or let them go. The longer you wait, the more damage is done.
          </div>
        </div>
      ),
    },
    {
      id: 'leadership', icon: Compass, color: '#8b5cf6', title: 'EOS Leadership Practices',
      subtitle: 'The 4 things great leaders do',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { num: '1', title: 'Give Clear Direction', desc: 'People can\'t hit a target they can\'t see. Communicate the vision, the plan, and each person\'s role in achieving it. Repeat it constantly.' },
            { num: '2', title: 'Provide the Necessary Tools', desc: 'Your people need the right equipment, training, software, and support. Don\'t expect results without investment.' },
            { num: '3', title: 'Let Go of the Vine', desc: 'Delegate and trust. Stop doing their job for them. You hired adults — let them own their responsibilities. Micromanagement kills culture.' },
            { num: '4', title: 'Act with the Greater Good in Mind', desc: 'Every decision should serve the company, not egos. When you make the tough calls — especially people decisions — the team respects you more.' },
          ].map(item => (
            <div key={item.num} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 14px', borderRadius: '8px', backgroundColor: theme.bg }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#8b5cf615',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: '13px', fontWeight: '800', color: '#8b5cf6',
              }}>{item.num}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text }}>{item.title}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'management', icon: Users, color: '#f59e0b', title: 'EOS Management Practices',
      subtitle: 'The 5 practices every manager must follow',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { num: '1', title: 'Keep Expectations Clear', desc: 'Every person should know exactly what is expected of them — their roles, their rocks, their measurables. Write them down. Review them quarterly.' },
            { num: '2', title: 'Communicate Well', desc: 'Weekly L10s. Quarterly conversations. Open door. The right amount of communication — not too much, not too little. Make sure nothing falls through the cracks.' },
            { num: '3', title: 'Maintain the Right Meeting Pulse', desc: 'Weekly L10 for the leadership team. Weekly departmental meetings for managers. Same day, same time, same agenda. The pulse keeps the organization aligned.' },
            { num: '4', title: 'Have Quarterly Conversations (5-5-5)', desc: 'Every 90 days, sit with each direct report. Review core values, roles/responsibilities, and rocks. Give and receive honest feedback. This replaces the dreaded annual review.' },
            { num: '5', title: 'Reward and Recognize', desc: 'Catch people doing things right. Public praise for core value behavior. Compensation that reflects contribution. People leave managers, not companies — be the manager they stay for.' },
          ].map(item => (
            <div key={item.num} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 14px', borderRadius: '8px', backgroundColor: theme.bg }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f59e0b15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: '13px', fontWeight: '800', color: '#f59e0b',
              }}>{item.num}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text }}>{item.title}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {tools.map(tool => {
        const isOpen = expanded === tool.id
        return (
          <Card key={tool.id} theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
            <button onClick={() => setExpanded(isOpen ? null : tool.id)} style={{
              width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px',
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', backgroundColor: tool.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <tool.icon size={18} color={tool.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text }}>{tool.title}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{tool.subtitle}</div>
              </div>
              <ChevronDown size={16} color={theme.textMuted} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {isOpen && (
              <div style={{ padding: '0 18px 18px' }}>
                {tool.content}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// MAIN EOS PAGE
// ════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity, color: '#6366f1', hint: '90-day trends' },
  { id: 'vto', label: 'V/TO', icon: Eye, color: '#5a6349', hint: 'Vision / Traction Organizer' },
  { id: 'rocks', label: 'Rocks', icon: Target, color: '#22c55e', hint: 'Quarterly priorities' },
  { id: 'scorecard', label: 'Scorecard', icon: BarChart3, color: '#3b82f6', hint: 'Weekly metrics' },
  { id: 'issues', label: 'Issues', icon: AlertCircle, color: '#ef4444', hint: 'IDS & To-Dos' },
  { id: 'l10', label: 'L10', icon: Clock, color: '#8b5cf6', hint: 'Level 10 meeting' },
  { id: 'people', label: 'People', icon: Users, color: '#f59e0b', hint: 'Accountability, GWC, 5-5-5' },
  { id: 'toolbox', label: 'Toolbox', icon: BookOpen, color: '#14b8a6', hint: 'SMART, IDS, GWC, leadership' },
]

export default function EOS() {
  const companyId = useStore(s => s.companyId)
  const employees = useStore(s => s.employees) || []
  const settings = useStore(s => s.settings) || []
  const fetchSettings = useStore(s => s.fetchSettings)
  const jobs = useStore(s => s.jobs) || []
  const leads = useStore(s => s.leads) || []
  const invoices = useStore(s => s.invoices) || []
  const payments = useStore(s => s.payments) || []
  const appointments = useStore(s => s.appointments) || []
  const timeLogs = useStore(s => s.timeLogs) || []
  const expenses = useStore(s => s.expenses) || []
  const quotes = useStore(s => s.quotes) || []
  const leadPayments = useStore(s => s.leadPayments) || []
  const businessUnits = useStore(s => s.businessUnits) || []
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Fetch submittal records for scorecard
  const [submittals, setSubmittals] = useState([])
  useEffect(() => {
    if (!companyId) return
    supabase.from('file_attachments')
      .select('id, job_id, created_at')
      .eq('company_id', companyId)
      .eq('photo_context', 'submittal')
      .then(({ data }) => setSubmittals(data || []))
  }, [companyId])

  const storeData = useMemo(() => ({
    jobs, leads, invoices, payments, appointments, timeLogs, expenses, quotes, leadPayments, submittals,
  }), [jobs, leads, invoices, payments, appointments, timeLogs, expenses, quotes, leadPayments, submittals])

  // Build entity list from service types + business units (deduplicated)
  const entities = useMemo(() => {
    const set = new Set()
    const extractName = (item) => typeof item === 'string' ? item : (item?.name || item?.label || null)
    businessUnits.forEach(s => { const n = extractName(s); if (n) set.add(n) })
    // Also scan actual job data for business_unit values not in settings
    jobs.forEach(j => { if (j.business_unit) set.add(j.business_unit) })
    return [...set].sort()
  }, [businessUnits, jobs])

  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [eosData, setEosData] = useState({})
  const isMobile = useIsMobile()
  const saveTimerRef = useRef({})

  // Load all EOS settings
  useEffect(() => {
    if (!settings.length) { setLoading(false); return }
    const data = {}
    Object.entries(EOS_KEYS).forEach(([key, settingKey]) => {
      const setting = settings.find(s => s.key === settingKey)
      if (setting?.value) {
        try { data[key] = JSON.parse(setting.value) } catch { data[key] = setting.value }
      }
    })
    setEosData(data)
    setLoading(false)
  }, [settings])

  // Debounced save to settings table
  const save = useCallback((key, value) => {
    // Optimistic local update
    setEosData(prev => ({ ...prev, [key]: value }))

    // Debounce the actual DB save
    const settingKey = EOS_KEYS[key]
    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key])
    saveTimerRef.current[key] = setTimeout(async () => {
      const valueStr = JSON.stringify(value)
      const existing = settings.find(s => s.key === settingKey)
      if (existing) {
        await supabase.from('settings').update({ value: valueStr, updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('settings').insert({ company_id: companyId, key: settingKey, value: valueStr })
      }
      fetchSettings()
    }, 800)
  }, [companyId, settings, fetchSettings])

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading EOS...</div>
  }

  // Health score — how much of the V/TO is filled out
  const healthChecks = [
    (eosData.core_values || []).length >= 3,
    !!(eosData.core_focus?.purpose && eosData.core_focus?.niche),
    !!eosData.ten_year,
    !!(eosData.marketing?.target_market && eosData.marketing?.guarantee),
    !!(eosData.three_year?.revenue),
    !!(eosData.one_year?.revenue),
    (eosData.rocks || []).length >= 3,
    (eosData.scorecard || []).length >= 5,
    (eosData.accountability || []).length >= 3,
    !!(eosData.meetings?.l10_day),
  ]
  const healthPct = Math.round((healthChecks.filter(Boolean).length / healthChecks.length) * 100)

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '800', color: theme.text, margin: 0 }}>EOS</h1>
            <HelpBadge text="EOS (Entrepreneurial Operating System) is a complete set of tools and concepts for running your business. It helps you get everyone on the same page with a shared vision, build accountability, track what matters weekly, solve issues permanently, and execute on quarterly priorities. Start with the V/TO to define your vision, then set Rocks, build a Scorecard, and run weekly L10 meetings." />
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>Entrepreneurial Operating System</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ProgressRing percent={healthPct} size={44} stroke={3} color={healthPct >= 80 ? '#22c55e' : healthPct >= 50 ? '#f59e0b' : '#ef4444'} theme={theme} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: healthPct >= 80 ? '#22c55e' : healthPct >= 50 ? '#f59e0b' : '#ef4444' }}>
              {healthPct >= 80 ? 'Strong' : healthPct >= 50 ? 'Getting There' : 'Needs Work'}
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted }}>EOS Health</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: isMobile ? '4px' : '6px', overflowX: 'auto',
        marginBottom: '20px', paddingBottom: '4px',
        borderBottom: `1px solid ${theme.border}`,
        WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(tab => {
          const active = tab.id === activeTab
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: isMobile ? '8px 12px' : '10px 16px',
              borderRadius: '8px 8px 0 0', fontSize: isMobile ? '12px' : '13px', fontWeight: '600',
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              backgroundColor: active ? tab.color + '12' : 'transparent',
              color: active ? tab.color : theme.textMuted,
              borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}>
              <tab.icon size={isMobile ? 14 : 16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' && <DashboardTab data={eosData} theme={theme} employees={employees} storeData={storeData} entities={entities} isMobile={isMobile} />}
      {activeTab === 'vto' && <VTOTab data={eosData} save={save} theme={theme} employees={employees} isMobile={isMobile} />}
      {activeTab === 'rocks' && <RocksTab data={eosData} save={save} theme={theme} employees={employees} entities={entities} isMobile={isMobile} />}
      {activeTab === 'scorecard' && <ScorecardTab data={eosData} save={save} theme={theme} employees={employees} storeData={storeData} entities={entities} isMobile={isMobile} />}
      {activeTab === 'issues' && <IssuesTab data={eosData} save={save} theme={theme} employees={employees} isMobile={isMobile} />}
      {activeTab === 'l10' && <L10Tab data={eosData} save={save} theme={theme} employees={employees} storeData={storeData} entities={entities} isMobile={isMobile} />}
      {activeTab === 'people' && <PeopleTab data={eosData} save={save} theme={theme} employees={employees} isMobile={isMobile} />}
      {activeTab === 'toolbox' && <ToolboxTab theme={theme} isMobile={isMobile} />}
    </div>
  )
}
