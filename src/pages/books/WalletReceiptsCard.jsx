// Year-End / CPA: what each wallet (Venmo, Cash App, Zelle) received in the
// selected period. Venmo and Cash App business profiles file a 1099-K on
// these totals, so the CPA wants the number JobScout has next to the one the
// wallet reports. Self-contained: its own query, nothing from the page but
// the date window.
import { useState, useEffect } from 'react'
import { Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { WALLETS } from '../../lib/wallets'

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

export default function WalletReceiptsCard({ companyId, theme, statCardStyle, from, to }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!companyId || !from || !to) return
    let alive = true
    const load = async () => {
      const { data } = await supabase
        .from('payments')
        .select('amount, method, status')
        .eq('company_id', companyId)
        .in('method', WALLETS.map(w => w.method))
        .gte('date', from)
        .lte('date', to)
      if (!alive) return
      const byMethod = new Map()
      for (const p of data || []) {
        if ((p.status || 'Completed') === 'Refunded' || p.status === 'Voided') continue
        const key = String(p.method || '').toLowerCase()
        const cur = byMethod.get(key) || { count: 0, total: 0 }
        cur.count += 1
        cur.total += parseFloat(p.amount) || 0
        byMethod.set(key, cur)
      }
      setRows(WALLETS.map(w => ({ wallet: w, ...(byMethod.get(w.method.toLowerCase()) || { count: 0, total: 0 }) })))
    }
    const t = setTimeout(load, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId, from, to])

  if (!rows) return null
  const any = rows.some(r => r.count > 0)
  if (!any) return null

  return (
    <div style={{ ...statCardStyle, marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <Wallet size={16} style={{ color: theme.accent }} />
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: theme.text }}>Wallet receipts (1099-K)</h3>
        <HelpBadge text="Payments recorded with a wallet method in this period. Venmo and Cash App business profiles report these totals to the IRS on a 1099-K; give your CPA this number to reconcile against the form. Zelle does not issue a 1099-K — it is listed so the bank-side total is complete." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', gap: '10px' }}>
        {rows.map(r => (
          <div key={r.wallet.id} style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>{r.wallet.label}{r.wallet.id === 'zelle' ? ' (no 1099-K)' : ''}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{fmt(r.total)}</div>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{r.count} payment{r.count === 1 ? '' : 's'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
