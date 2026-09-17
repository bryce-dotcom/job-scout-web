// Year-end: straight-line depreciation for the assets that have a life set.
import { Landmark } from 'lucide-react'
import HelpBadge from '../../components/HelpBadge'
import { depreciationSchedule } from '../../lib/depreciation'

export default function DepreciationCard({ theme, statCardStyle, formatCurrency, assets = [], year }) {
  const s = depreciationSchedule(assets, year)
  if (s.rows.length === 0) return null
  return (
    <div style={{ ...statCardStyle, marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: '700', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Landmark size={16} style={{ color: theme.accent }} /> Depreciation — {year}
        <HelpBadge text="Straight-line book depreciation: (cost − salvage) ÷ life, from the month the asset went into service. This is the Form 1065 Line 16a figure for the year; your CPA may elect Section 179 or bonus depreciation instead, which this does not model. Set life and dates on each asset under Accounts → Balance sheet items." />
      </h3>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: theme.textSecondary, marginBottom: '8px' }}>
        <span><strong style={{ color: theme.text }}>{formatCurrency(s.totalYearExpense)}</strong> expense this year</span>
        <span>{formatCurrency(s.totalBookValue)} book value at year end</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {s.rows.map(r => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto auto', gap: '10px', fontSize: '12px', color: theme.textSecondary }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name} <span style={{ color: theme.textMuted }}>· {formatCurrency(r.cost)} over {r.lifeYears} yr{r.fullyDepreciated ? ' · fully depreciated' : ''}</span></span>
            <span style={{ fontWeight: 600, color: theme.text }}>{formatCurrency(r.yearExpense)}</span>
            <span style={{ minWidth: '90px', textAlign: 'right' }}>{formatCurrency(r.bookValue)} left</span>
          </div>
        ))}
      </div>
    </div>
  )
}
