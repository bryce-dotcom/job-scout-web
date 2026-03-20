import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function SavingsSection({ section, totalCost, annualSavings }) {
  const years = section?.years || 5
  const savings = annualSavings || section?.annual_savings || 0

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
          margin: '0 0 40px',
        }}>
          {section?.content || `Projected cumulative savings over ${years} years`}
        </p>
      </ProposalSection>

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
