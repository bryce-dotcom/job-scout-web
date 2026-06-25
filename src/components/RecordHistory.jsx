// Salesforce-style record activity/history. The DB already writes every change
// to `audit_log` (action, table_name, record_id, user_email, old/new values).
// This surfaces that as a click-to-view timeline on any record — answering
// "who changed this, and when" (Doug 79eb2107: jobs moving on their own;
// Alayda 435f9395: see who/when info changes + when documents are sent).
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from './Layout'
import { History, X, Plus, Pencil, Trash2, ArrowRight, RefreshCw, Send, Clock } from 'lucide-react'
import { formatZonedDateTime, DEFAULT_TZ } from '../lib/dateTz'

// Only these fields per table show up in the timeline — keeps it meaningful
// instead of flooding with every column on a full-row snapshot. (Salesforce
// likewise tracks a chosen field set.)
const TRACKED = {
  jobs: {
    status: 'Status', start_date: 'Start', end_date: 'End', job_title: 'Title',
    assigned_team: 'Crew', job_total: 'Job Total', allotted_time_hours: 'Allotted Hours',
    job_address: 'Address', business_unit: 'Business Unit', recurrence: 'Recurrence',
    salesperson_id: 'Salesperson', pm_id: 'Project Manager',
  },
  invoices: {
    payment_status: 'Payment Status', amount: 'Amount', due_date: 'Due Date',
    discount_applied: 'Discount', sent_to_email: 'Sent To', invoice_date: 'Invoice Date',
  },
  quotes: {
    status: 'Status', quote_amount: 'Estimate Total', estimate_name: 'Name',
    sent_to_email: 'Sent To', service_date: 'Service Date',
  },
  leads: {
    status: 'Status', customer_name: 'Customer', business_name: 'Business',
    salesperson_id: 'Salesperson', appointment_id: 'Appointment',
  },
}
const MONEY_FIELDS = new Set(['job_total', 'amount', 'quote_amount', 'discount_applied', 'allotted_time_hours'])
const DATE_FIELDS = new Set(['start_date', 'end_date', 'due_date', 'invoice_date', 'service_date'])

function prettyActor(email, employees) {
  if (!email || email === 'system') return 'System'
  const emp = (employees || []).find((e) => e.email && e.email.toLowerCase() === String(email).toLowerCase())
  if (emp?.name) return emp.name
  const name = String(email).split('@')[0].replace(/[._]/g, ' ')
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

function relTime(iso) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return null
}

function fmtVal(field, v, tz, employees) {
  if (v === null || v === undefined || v === '') return '—'
  if (DATE_FIELDS.has(field)) {
    const s = formatZonedDateTime(v, tz, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    return s || String(v)
  }
  if (MONEY_FIELDS.has(field)) {
    const n = parseFloat(v)
    if (!isNaN(n)) return field === 'allotted_time_hours' ? `${n}h` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }
  if ((field === 'salesperson_id' || field === 'pm_id') && employees) {
    const emp = employees.find((e) => String(e.id) === String(v))
    if (emp?.name) return emp.name
  }
  return String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v)
}

function diffTracked(tableName, ov, nv) {
  const map = TRACKED[tableName] || {}
  const out = []
  for (const field of Object.keys(map)) {
    const a = ov?.[field], b = nv?.[field]
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field, label: map[field], from: a, to: b })
  }
  return out
}

// One row -> a display event, or null if it's noise (an UPDATE that touched no
// tracked field).
function toEvent(tableName, r) {
  const ov = r.old_values || r.old_data || {}
  const nv = r.new_values || r.new_data || {}
  const action = (r.action || '').toLowerCase()
  if (action === 'insert') return { kind: 'created', diffs: [] }
  if (action === 'delete') return { kind: 'deleted', diffs: [] }
  // A 'status_change' row stores only a PARTIAL old snapshot (just the changed
  // field), which makes untouched fields look changed — trust only `status`.
  // The DB also writes a full UPDATE row for the same change; the dedup below
  // keeps whichever is richer so we never render the change twice.
  if (action === 'status_change') {
    if (JSON.stringify(ov?.status) === JSON.stringify(nv?.status)) return null
    return { kind: 'status', diffs: [{ field: 'status', label: 'Status', from: ov?.status, to: nv?.status }] }
  }
  const diffs = diffTracked(tableName, ov, nv)
  if (!diffs.length) return null
  if (diffs.length === 1 && diffs[0].field === 'status') return { kind: 'status', diffs }
  if (diffs.some((d) => d.field === 'sent_to_email' && d.to)) return { kind: 'sent', diffs }
  return { kind: 'updated', diffs }
}

const KIND_ICON = { created: Plus, deleted: Trash2, status: RefreshCw, sent: Send, updated: Pencil }

export function RecordHistory({ tableName, recordId, tz = DEFAULT_TZ }) {
  const theme = useTheme()
  const employees = useStore((s) => s.employees) || []
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id, action, user_email, old_values, new_values, old_data, new_data, created_at')
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false })
        .limit(300)
      if (alive) setRows(data || [])
    })()
    return () => { alive = false }
  }, [tableName, recordId])

  if (rows === null) return <div style={{ padding: 24, color: theme.textMuted, fontSize: 14 }}>Loading history…</div>

  // The DB logs a status change as TWO rows at the same instant (a
  // 'status_change' and a full 'UPDATE'). Collapse rows by (timestamp, actor),
  // keeping the richer one, so each real change shows exactly once.
  const byKey = new Map()
  for (const r of rows) {
    const ev = toEvent(tableName, r)
    if (!ev) continue
    const key = `${r.created_at}|${r.user_email || ''}`
    const prev = byKey.get(key)
    if (!prev || ev.diffs.length > prev.diffs.length) byKey.set(key, { ...ev, ...r })
  }
  const events = [...byKey.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  if (!events.length) return <div style={{ padding: 24, color: theme.textMuted, fontSize: 14 }}>No tracked changes recorded yet.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {events.map((e, i) => {
        const Icon = KIND_ICON[e.kind] || Pencil
        const actor = prettyActor(e.user_email, employees)
        const rel = relTime(e.created_at)
        const abs = formatZonedDateTime(e.created_at, tz, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        return (
          <div key={e.id || i} style={{ display: 'flex', gap: 12, padding: '12px 4px', borderBottom: i < events.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
            <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={15} color={theme.accent} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: theme.text }}>
                <strong style={{ fontWeight: 600 }}>{actor}</strong>{' '}
                {e.kind === 'created' && 'created this record'}
                {e.kind === 'deleted' && 'deleted this record'}
                {e.kind === 'status' && 'changed status'}
                {e.kind === 'sent' && 'sent this to the customer'}
                {e.kind === 'updated' && (e.diffs.length === 1 ? `updated ${e.diffs[0].label}` : `made ${e.diffs.length} changes`)}
              </div>
              {e.diffs.map((d) => (
                <div key={d.field} style={{ fontSize: 13, color: theme.textSecondary, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: theme.textMuted }}>{d.label}:</span>
                  <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{fmtVal(d.field, d.from, tz, employees)}</span>
                  <ArrowRight size={12} color={theme.textMuted} />
                  <span style={{ fontWeight: 600, color: theme.text }}>{fmtVal(d.field, d.to, tz, employees)}</span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={11} /> {rel ? `${rel} · ${abs}` : abs}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Button + modal wrapper — drop-in for any record page. "Viewable upon a click."
export function RecordHistoryButton({ tableName, recordId, tz = DEFAULT_TZ, label = 'History', style = {} }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', minHeight: 40, background: theme.bgCard, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 14, cursor: 'pointer', ...style }}
        title="See who changed this record and when"
      >
        <History size={16} /> {label}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', height: '100%', background: theme.bg, boxShadow: '-8px 0 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: theme.text }}>
                <History size={18} color={theme.accent} /> Activity
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 4 }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 24px' }}>
              <RecordHistory tableName={tableName} recordId={recordId} tz={tz} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
