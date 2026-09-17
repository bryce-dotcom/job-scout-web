// Membership revenue on the Money tab: MRR, run-rate, churn, past-due.
import { Repeat } from 'lucide-react'
import HelpBadge from '../../components/HelpBadge'
import { membershipMetrics } from '../../lib/membershipMetrics'

export default function MembershipsCard({ theme, statCardStyle, formatCurrency, memberships = [], navigate }) {
  const m = membershipMetrics(memberships)
  if (m.active === 0 && m.churned30 === 0) return null
  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Repeat size={16} style={{ color: theme.accent }} /> Memberships
          <HelpBadge text="Monthly recurring revenue from active memberships (annual and quarterly plans normalized to a month), the yearly run-rate, how many cancelled in the last 30 days, and past-due members whose Stripe charge failed. Membership payments themselves land in Money In like any other payment." />
        </h3>
        <button onClick={() => navigate('/customers')} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>Customers</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        {[
          ['Active members', String(m.active), theme.text],
          ['MRR', formatCurrency(m.mrr), theme.text],
          ['Annual run-rate', formatCurrency(m.arr), theme.text],
          ['Churn (30 days)', `${m.churned30} · ${m.churnRate}%`, m.churned30 > 0 ? '#eab308' : theme.text],
          ['Past due', m.pastDue ? `${m.pastDue} · ${formatCurrency(m.pastDueMrr)}/mo` : '0', m.pastDue > 0 ? '#ef4444' : theme.text],
        ].map(([l, v, c]) => (
          <div key={l} style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>{l}</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {m.byPlan.length > 1 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted }}>
          {m.byPlan.map(p => `${p.plan}: ${p.count} · ${formatCurrency(p.mrr)}/mo`).join(' · ')}
        </div>
      )}
    </div>
  )
}
