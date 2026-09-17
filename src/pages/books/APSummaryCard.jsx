// Extracted from Books.jsx (2026-09-17) — self-contained; Books renders it.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// AP Aging summary card — small self-contained widget that lives next
// to the AR card on the Books overview. Loads bills lazily so it
// doesn't affect Books page load if the company doesn't use Bills.
export default function APSummaryCard({ theme, companyId, statCardStyle, formatCurrency, navigate }) {
  const [data, setData] = useState({ open: 0, overdue: 0, count: 0, loading: true })
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: bills } = await supabase
        .from('bills')
        .select('balance_due, due_date, status')
        .eq('company_id', companyId)
        .neq('status', 'paid')
        .neq('status', 'void')
      const today = new Date(); today.setHours(0,0,0,0)
      let open = 0, overdue = 0
      for (const b of bills || []) {
        const bal = parseFloat(b.balance_due) || 0
        if (bal <= 0) continue
        open += bal
        if (b.due_date && new Date(b.due_date) < today) overdue += bal
      }
      if (mounted) setData({ open, overdue, count: (bills || []).length, loading: false })
    })()
    return () => { mounted = false }
  }, [companyId])

  return (
    <div style={statCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
          Accounts Payable
        </h3>
        <button
          onClick={() => navigate('/bills')}
          style={{
            padding: '4px 10px', backgroundColor: theme.accentBg, color: theme.accent,
            border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          View Bills →
        </button>
      </div>
      {data.loading ? (
        <p style={{ color: theme.textMuted, fontSize: 12, margin: 0 }}>Loading…</p>
      ) : data.count === 0 ? (
        <p style={{ color: theme.textMuted, fontSize: 12, margin: 0, fontStyle: 'italic' }}>
          No open bills.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
            <span style={{ color: theme.text }}>Open Bills</span>
            <span style={{ fontWeight: '600', color: '#c28b38' }}>{formatCurrency(data.open)}</span>
          </div>
          {data.overdue > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: 'rgba(220,38,38,0.08)', borderRadius: '8px' }}>
              <span style={{ color: '#dc2626' }}>Overdue</span>
              <span style={{ fontWeight: '600', color: '#dc2626' }}>{formatCurrency(data.overdue)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
