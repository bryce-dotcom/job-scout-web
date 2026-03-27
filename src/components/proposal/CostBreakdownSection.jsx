import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function CostBreakdownSection({ section, lineItems, auditSummary, certified, brandName }) {
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

  // Per-area wattage reduction data for audit bar chart
  const areas = auditSummary?.areas || []
  const hasAreaData = certified && areas.length > 0

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      backgroundColor: proposalTheme.bgCard,
    }}>
      <div style={{ maxWidth: proposalTheme.maxWidth, margin: '0 auto' }}>
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
                  Investment Grade Breakdown {brandName ? `— ${brandName}` : ''}
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

        {/* Per-area wattage comparison chart from audit data */}
        {hasAreaData && (
          <ProposalSection delay={0.3}>
            <div style={{ marginTop: '40px' }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: proposalTheme.text,
                margin: '0 0 8px',
                textAlign: 'center',
              }}>
                Energy Reduction by Area
              </h3>
              <p style={{
                color: proposalTheme.textMuted,
                fontSize: '14px',
                textAlign: 'center',
                margin: '0 0 24px',
              }}>
                Wattage comparison: existing vs. proposed LED fixtures
              </p>
              <div style={{
                backgroundColor: proposalTheme.bg,
                borderRadius: proposalTheme.cardRadius,
                border: `1px solid ${proposalTheme.border}`,
                padding: '24px 16px 16px',
              }}>
                <div style={{ width: '100%', height: Math.max(200, areas.length * 60) + 'px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={areas.map(a => ({
                        name: a.area_name || 'Area',
                        existing: a.total_existing_watts || (a.fixture_count * a.existing_wattage) || 0,
                        proposed: a.total_led_watts || (a.fixture_count * a.led_wattage) || 0,
                      }))}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={proposalTheme.border} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `${v}W`}
                        tick={{ fontSize: 12, fill: proposalTheme.textMuted }}
                        axisLine={{ stroke: proposalTheme.border }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: proposalTheme.textMuted }}
                        axisLine={{ stroke: proposalTheme.border }}
                        width={70}
                      />
                      <Tooltip
                        formatter={(value, name) => [`${value}W`, name === 'existing' ? 'Existing' : 'Proposed LED']}
                        contentStyle={{
                          backgroundColor: proposalTheme.bgCard,
                          border: `1px solid ${proposalTheme.border}`,
                          borderRadius: '8px',
                          fontSize: '13px',
                        }}
                      />
                      <Bar dataKey="existing" fill="#c0392b" name="Existing" radius={[0, 4, 4, 0]} animationDuration={1000} />
                      <Bar dataKey="proposed" fill={proposalTheme.accent} name="Proposed LED" radius={[0, 4, 4, 0]} animationDuration={1000} animationBegin={300} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Area detail table */}
                <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${proposalTheme.border}` }}>
                        {['Area', 'Fixtures', 'Existing W', 'LED W', 'Reduced', 'Rebate Est.'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: proposalTheme.textMuted, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {areas.map((a, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${proposalTheme.border}` }}>
                          <td style={{ padding: '8px 12px', color: proposalTheme.text, fontWeight: '500' }}>{a.area_name || 'Area'}</td>
                          <td style={{ padding: '8px 12px', color: proposalTheme.textSecondary }}>{a.fixture_count}</td>
                          <td style={{ padding: '8px 12px', color: '#c0392b' }}>{a.existing_wattage}W</td>
                          <td style={{ padding: '8px 12px', color: proposalTheme.accent }}>{a.led_wattage}W</td>
                          <td style={{ padding: '8px 12px', color: proposalTheme.success, fontWeight: '600' }}>{a.area_watts_reduced}W</td>
                          <td style={{ padding: '8px 12px', color: proposalTheme.textSecondary }}>{a.area_rebate_estimate ? formatCurrency(a.area_rebate_estimate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ProposalSection>
        )}
      </div>
    </div>
  )
}
