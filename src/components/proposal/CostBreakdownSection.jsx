import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function CostBreakdownSection({ section, lineItems }) {
  if (!lineItems || lineItems.length === 0) return null

  // Group by category or item name
  const grouped = {}
  lineItems.forEach(li => {
    const key = li.category || li.item_name || li.description || 'Other'
    if (!grouped[key]) grouped[key] = 0
    grouped[key] += parseFloat(li.total || li.line_total) || 0
  })

  const data = Object.entries(grouped).map(([name, value]) => ({ name, value }))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const colors = proposalTheme.chartColors

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      backgroundColor: proposalTheme.bgCard,
    }}>
      <div style={{ maxWidth: proposalTheme.maxWidth, margin: '0 auto' }}>
        <ProposalSection>
          <h2 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: proposalTheme.text,
            margin: '0 0 8px',
            textAlign: 'center',
            fontFamily: proposalTheme.fontFamily,
          }}>
            Investment Breakdown
          </h2>
          <p style={{
            color: proposalTheme.textMuted,
            fontSize: proposalTheme.bodySize,
            textAlign: 'center',
            margin: '0 0 40px',
          }}>
            {section?.content || 'How your investment is distributed'}
          </p>
        </ProposalSection>

        <ProposalSection delay={0.15}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
          }}>
            <div style={{ width: '280px', height: '280px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1200}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: proposalTheme.bgCard,
                      border: `1px solid ${proposalTheme.border}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '200px' }}>
              {data.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '4px',
                    backgroundColor: colors[i % colors.length],
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <p style={{
                      color: proposalTheme.text,
                      fontSize: '14px',
                      fontWeight: '500',
                      margin: 0,
                    }}>{item.name}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{
                      color: proposalTheme.text,
                      fontSize: '14px',
                      fontWeight: '600',
                      margin: 0,
                    }}>{formatCurrency(item.value)}</p>
                    <p style={{
                      color: proposalTheme.textMuted,
                      fontSize: '12px',
                      margin: 0,
                    }}>{total > 0 ? Math.round((item.value / total) * 100) : 0}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ProposalSection>
      </div>
    </div>
  )
}
