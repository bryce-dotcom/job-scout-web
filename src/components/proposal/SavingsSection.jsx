import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatNumber(n) {
  if (!n && n !== 0) return '0'
  return new Intl.NumberFormat('en-US').format(n)
}

export default function SavingsSection({ section, totalCost, annualSavings, auditSummary, certified, brandName, incentive, discount }) {
  const years = section?.years || 5
  const savings = annualSavings || section?.annual_savings || 0
  const kwhSavings = section?.annual_kwh_savings || auditSummary?.annual_kwh_savings || 0
  const wattsReduced = section?.watts_reduced || auditSummary?.watts_reduced || 0
  const totalFixtures = section?.total_fixtures || auditSummary?.total_fixtures || 0

  if (!savings || savings <= 0) return null

  const netCost = (totalCost || 0) - (incentive || 0) - (discount || 0)
  const data = []
  let cumulative = -netCost
  data.push({ year: 'Investment', value: cumulative, label: formatCurrency(cumulative) })

  for (let y = 1; y <= years; y++) {
    cumulative += savings
    data.push({
      year: `Year ${y}`,
      value: Math.round(cumulative),
      label: formatCurrency(Math.round(cumulative)),
    })
  }

  // Find payback year for annotation
  const paybackYear = data.findIndex(d => d.value >= 0)

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      maxWidth: proposalTheme.maxWidth,
      margin: '0 auto',
    }}>
      <ProposalSection>
        {certified && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: proposalTheme.certGoldBg,
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${proposalTheme.certGoldBorder}`,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={proposalTheme.certGold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: '700', color: proposalTheme.certGold, letterSpacing: '1px', textTransform: 'uppercase' }}>
                Investment Grade Audit {brandName ? `\u2014 ${brandName}` : ''}
              </span>
            </div>
          </div>
        )}
        <h2 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: proposalTheme.text,
          margin: '0 0 8px',
          textAlign: 'center',
          fontFamily: proposalTheme.fontFamily,
        }}>
          Cash Flow Analysis
        </h2>
        <p style={{
          color: proposalTheme.textMuted,
          fontSize: proposalTheme.bodySize,
          textAlign: 'center',
          margin: '0 0 24px',
        }}>
          {section?.content || `Projected cumulative cash flow over ${years} years`}
        </p>
      </ProposalSection>

      {/* Audit detail cards */}
      {certified && (kwhSavings > 0 || wattsReduced > 0) && (
        <ProposalSection delay={0.1}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            marginBottom: '24px',
          }}>
            {[
              { label: 'Annual kWh Savings', value: `${formatNumber(kwhSavings)} kWh` },
              { label: 'Watts Reduced', value: `${formatNumber(wattsReduced)}W` },
              { label: 'Fixtures Upgraded', value: formatNumber(totalFixtures) },
              { label: 'Annual Savings', value: formatCurrency(savings) },
            ].filter(c => c.value && c.value !== '0' && c.value !== '0W' && c.value !== '0 kWh').map(card => (
              <div key={card.label} style={{
                textAlign: 'center',
                padding: '16px 12px',
                backgroundColor: proposalTheme.bg,
                borderRadius: '10px',
                border: `1px solid ${proposalTheme.border}`,
              }}>
                <p style={{ fontSize: '20px', fontWeight: '700', color: proposalTheme.accent, margin: '0 0 4px' }}>
                  {card.value}
                </p>
                <p style={{ fontSize: '11px', color: proposalTheme.textMuted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {card.label}
                </p>
              </div>
            ))}
          </div>
        </ProposalSection>
      )}

      <ProposalSection delay={0.15}>
        <div style={{
          backgroundColor: proposalTheme.bgCard,
          borderRadius: proposalTheme.cardRadius,
          border: `1px solid ${proposalTheme.border}`,
          padding: '24px 16px 16px',
        }}>
          {/* Summary callout above chart */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            flexWrap: 'wrap',
            marginBottom: '20px',
            padding: '0 8px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: proposalTheme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Net Investment</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#c0392b' }}>{formatCurrency(netCost)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: proposalTheme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Annual Savings</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: proposalTheme.success }}>{formatCurrency(savings)}/yr</div>
            </div>
            {paybackYear > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: proposalTheme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Payback</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: proposalTheme.accent }}>Year {paybackYear}</div>
              </div>
            )}
          </div>

          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={proposalTheme.border} vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12, fill: proposalTheme.textMuted }}
                  axisLine={{ stroke: proposalTheme.border }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => {
                    const abs = Math.abs(v)
                    if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(0)}k`
                    return `${v < 0 ? '-' : ''}$${abs}`
                  }}
                  tick={{ fontSize: 12, fill: proposalTheme.textMuted }}
                  axisLine={{ stroke: proposalTheme.border }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Cumulative Cash Flow']}
                  contentStyle={{
                    backgroundColor: proposalTheme.bgCard,
                    border: `1px solid ${proposalTheme.border}`,
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                  cursor={{ fill: 'rgba(90,99,73,0.06)' }}
                />
                <ReferenceLine y={0} stroke={proposalTheme.text} strokeWidth={1.5} strokeDasharray="4 4" />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  animationDuration={1200}
                  animationBegin={200}
                  maxBarSize={60}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.value >= 0 ? proposalTheme.success : '#c0392b'}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cash flow table below chart */}
          <div style={{ marginTop: '16px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${proposalTheme.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: proposalTheme.textMuted, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Period</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: proposalTheme.textMuted, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Annual</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: proposalTheme.textMuted, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => {
                  const annual = i === 0 ? -netCost : savings
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${proposalTheme.border}` }}>
                      <td style={{ padding: '8px 12px', fontWeight: '500', color: proposalTheme.text }}>{d.year}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: annual >= 0 ? proposalTheme.success : '#c0392b', fontWeight: '500' }}>
                        {formatCurrency(annual)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: d.value >= 0 ? proposalTheme.success : '#c0392b', fontWeight: '600' }}>
                        {formatCurrency(d.value)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </ProposalSection>
    </div>
  )
}
