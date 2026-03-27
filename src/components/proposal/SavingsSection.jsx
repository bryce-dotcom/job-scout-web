import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
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

export default function SavingsSection({ section, totalCost, annualSavings, auditSummary, certified, brandName }) {
  const years = section?.years || 5
  const savings = annualSavings || section?.annual_savings || 0
  const kwhSavings = section?.annual_kwh_savings || auditSummary?.annual_kwh_savings || 0
  const wattsReduced = section?.watts_reduced || auditSummary?.watts_reduced || 0
  const totalFixtures = section?.total_fixtures || auditSummary?.total_fixtures || 0

  if (!savings || savings <= 0) return null

  const data = []
  let cumulative = -(totalCost || 0)
  data.push({ year: 'Now', savings: cumulative, label: formatCurrency(cumulative) })

  for (let y = 1; y <= years; y++) {
    cumulative += savings
    data.push({
      year: `Year ${y}`,
      savings: Math.round(cumulative),
      label: formatCurrency(Math.round(cumulative)),
    })
  }

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
                Investment Grade Audit {brandName ? `— ${brandName}` : ''}
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
          Savings Over Time
        </h2>
        <p style={{
          color: proposalTheme.textMuted,
          fontSize: proposalTheme.bodySize,
          textAlign: 'center',
          margin: '0 0 24px',
        }}>
          {section?.content || `Projected cumulative savings over ${years} years`}
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
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={proposalTheme.accent} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={proposalTheme.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={proposalTheme.border} />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12, fill: proposalTheme.textMuted }}
                  axisLine={{ stroke: proposalTheme.border }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12, fill: proposalTheme.textMuted }}
                  axisLine={{ stroke: proposalTheme.border }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Cumulative Savings']}
                  contentStyle={{
                    backgroundColor: proposalTheme.bgCard,
                    border: `1px solid ${proposalTheme.border}`,
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="savings"
                  stroke={proposalTheme.accent}
                  strokeWidth={3}
                  fill="url(#savingsGradient)"
                  animationDuration={1500}
                  animationBegin={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </ProposalSection>
    </div>
  )
}
