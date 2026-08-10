// "Remit your payroll taxes" — the per-payroll action panel in the Payroll Inbox.
//
// JobScout calculates each payroll's tax liabilities and prints a deposit
// worksheet, but it does NOT send the money. This panel shows what the employer
// owes each agency (grouped by payroll run), lets them print the worksheet they
// take to EFTPS / their state portal, and mark each payment remitted.

import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { groupRemittance, remittanceTotal, buildDepositWorksheet } from '../lib/payrollRemittance'

const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] || m
  return `${mo} ${Number(day)}, ${y}`
}
const paidViaFor = (bucketId) => (bucketId.startsWith('federal') ? 'eftps' : bucketId.startsWith('state') ? 'state_portal' : 'other')

export default function PayrollRemittancePanel({ liabilities = [], theme, onChange }) {
  const t = theme || {}
  const company = useStore((s) => s.company)
  const companyId = useStore((s) => s.companyId)
  const [runs, setRuns] = useState({})   // run_id -> {pay_date, period_start, period_end}
  const [busy, setBusy] = useState(null)

  const unpaid = (liabilities || []).filter((l) => !l.paid_at)

  // Pull pay_date/period for the runs that have outstanding liabilities.
  useEffect(() => {
    const ids = [...new Set(unpaid.map((l) => l.payroll_run_id).filter(Boolean))]
    if (!ids.length || !companyId) { setRuns({}); return }
    let cancelled = false
    supabase.from('payroll_runs').select('id, pay_date, period_start, period_end')
      .eq('company_id', companyId).in('id', ids)
      .then(({ data }) => {
        if (cancelled) return
        const m = {}; for (const r of data || []) m[r.id] = r; setRuns(m)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, unpaid.map((l) => l.payroll_run_id).join(',')])

  if (!unpaid.length) return null

  // Group unpaid liabilities by payroll run (null run_id -> its own group).
  const byRun = {}
  for (const l of unpaid) {
    const k = l.payroll_run_id || 'unassigned'
    ;(byRun[k] = byRun[k] || []).push(l)
  }
  const groups = Object.entries(byRun)
    .map(([k, rows]) => ({ key: k, run: runs[k] || null, rows, buckets: groupRemittance(rows) }))
    .filter((g) => g.buckets.length)
    .sort((a, b) => String(b.run?.pay_date || '').localeCompare(String(a.run?.pay_date || '')))

  const grandTotal = remittanceTotal(groups.flatMap((g) => g.buckets))

  const printWorksheet = (g) => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    buildDepositWorksheet(doc, {
      company: company || {},
      run: g.run || { period_start: g.rows[0]?.period_start, period_end: g.rows[0]?.period_end },
      buckets: g.buckets,
    })
    const stamp = (g.run?.pay_date || g.rows[0]?.period_end || 'payroll').slice(0, 10)
    doc.save(`payroll-tax-deposit-${stamp}.pdf`)
  }

  const markPaid = async (bucket) => {
    setBusy(bucket.liabilityIds.join(','))
    const { error } = await supabase.from('payroll_tax_liabilities')
      .update({ paid_at: new Date().toISOString(), paid_via: paidViaFor(bucket.id), updated_at: new Date().toISOString() })
      .in('id', bucket.liabilityIds).eq('company_id', companyId)
    setBusy(null)
    if (error) { alert('Could not mark remitted: ' + error.message); return }
    onChange && onChange()
  }

  const card = { background: t.bgCard || '#fff', border: `1px solid ${t.border || '#d6cdb8'}`, borderRadius: 14, padding: 16, marginBottom: 12 }
  const ink = t.text || '#20261c', sub = t.textMuted || '#7d8a7f', hivis = '#b0651a'

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header + honest disclaimer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 14,
        background: 'rgba(207,122,31,0.10)', border: '1px solid rgba(207,122,31,0.35)', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 750, fontSize: 15.5, color: ink }}>Remit your payroll taxes</div>
          <div style={{ fontSize: 13, color: t.textSecondary || sub, marginTop: 3, lineHeight: 1.45 }}>
            JobScout calculates and documents these each payroll, but <b>does not send the money</b>. Print the deposit
            worksheet, pay federal taxes at eftps.gov and state taxes through your state portal, then mark each remitted.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outstanding</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: hivis }}>{fmt(grandTotal)}</div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: ink }}>
              {g.run?.pay_date ? `Pay date ${fmtDate(g.run.pay_date)}` : 'Payroll'}
              {g.run?.period_start && <span style={{ color: sub, fontWeight: 400 }}> · {fmtDate(g.run.period_start)}–{fmtDate(g.run.period_end)}</span>}
            </div>
            <button onClick={() => printWorksheet(g)} style={{ background: t.accent || '#55613c', color: '#fff', border: 0,
              borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 650, cursor: 'pointer', minHeight: 40 }}>
              Print deposit worksheet
            </button>
          </div>

          {g.buckets.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${t.border || '#eee'}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>{b.label}</div>
                <div style={{ fontSize: 11.5, color: sub }}>{b.method} · due {fmtDate(b.dueDate)}{b.agency ? ` · ${b.agency}` : ''}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}>{fmt(b.amount)}</div>
              <button onClick={() => markPaid(b)} disabled={busy === b.liabilityIds.join(',')}
                style={{ background: 'transparent', color: t.accent || '#55613c', border: `1px solid ${t.accent || '#55613c'}`,
                  borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', minHeight: 40, whiteSpace: 'nowrap' }}>
                {busy === b.liabilityIds.join(',') ? '…' : 'Mark remitted'}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
