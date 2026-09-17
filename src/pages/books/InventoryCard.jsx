// Inventory on the Money tab: what stock is worth at cost (the balance-
// sheet number) next to what it would bill for, and cost of goods used on
// jobs this month. See lib/inventoryBooks.js.
import { useState, useEffect } from 'react'
import { Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { inventoryValue, cogsForPeriod } from '../../lib/inventoryBooks'

export default function InventoryCard({ companyId, theme, statCardStyle, formatCurrency, isThisMonth, navigate, onValue }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    const t = setTimeout(async () => {
      const [inv, prods, lines] = await Promise.all([
        supabase.from('inventory').select('*').eq('company_id', companyId).limit(20000),
        supabase.from('products_services').select('id, name, cost, unit_price').eq('company_id', companyId).limit(10000),
        supabase.from('job_lines').select('id, job_id, item_id, consumed_qty, updated_at').eq('company_id', companyId).gt('consumed_qty', 0).limit(20000),
      ])
      if (!alive) return
      setData({ inventory: inv.data || [], products: prods.data || [], jobLines: lines.data || [] })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId])

  const value = data ? inventoryValue(data) : null
  useEffect(() => { if (value && onValue) onValue(value.atCost) }, [value?.atCost]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || value.items === 0) return null
  const cogs = cogsForPeriod(data, isThisMonth)

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={16} style={{ color: theme.accent }} /> Inventory
          <HelpBadge text="Stock at cost = quantity on hand × the product's cost; that is the asset on the balance sheet. At price is what the same stock would bill for. Cost of goods used = parts consumed on jobs this month × cost. Products with no cost set are counted at $0 — fix them under Products & Services." />
        </h3>
        <button onClick={() => navigate('/inventory')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>Open Inventory</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
        {[
          ['Stock at cost', formatCurrency(value.atCost)],
          ['Stock at price', formatCurrency(value.atPrice)],
          ['Cost of goods used (month)', formatCurrency(cogs.total)],
          ['Low stock', String(value.lowStock)],
        ].map(([l, v]) => (
          <div key={l} style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{l}</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: l === 'Low stock' && value.lowStock > 0 ? '#eab308' : theme.text }}>{v}</div>
          </div>
        ))}
      </div>
      {(value.uncosted > 0 || cogs.uncosted > 0) && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted }}>
          {value.uncosted > 0 ? `${value.uncosted} stocked product${value.uncosted === 1 ? ' has' : 's have'} no cost set` : ''}
          {value.uncosted > 0 && cogs.uncosted > 0 ? ' · ' : ''}
          {cogs.uncosted > 0 ? `${cogs.uncosted} consumed line${cogs.uncosted === 1 ? '' : 's'} could not be costed` : ''}
        </div>
      )}
    </div>
  )
}
