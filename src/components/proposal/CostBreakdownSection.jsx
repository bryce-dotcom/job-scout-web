import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

const MAX_SLICES = 8

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatNumber(n) {
  if (!n && n !== 0) return '0'
  return new Intl.NumberFormat('en-US').format(n)
}

// Extract a human-readable category from an item_name
function inferCategory(itemName) {
  if (!itemName) return 'Other'
  const lower = itemName.toLowerCase()

  const patterns = [
    { match: /panel/i, label: 'Panels' },
    { match: /highbay|high bay|high-bay/i, label: 'High Bays' },
    { match: /lowbay|low bay|low-bay/i, label: 'Low Bays' },
    { match: /troffer/i, label: 'Troffers' },
    { match: /strip|linear/i, label: 'Linear / Strip' },
    { match: /flood/i, label: 'Flood Lights' },
    { match: /wall\s?pack/i, label: 'Wall Packs' },
    { match: /canopy/i, label: 'Canopy Lights' },
    { match: /parking|pole|area\s?light/i, label: 'Area / Parking' },
    { match: /exit/i, label: 'Exit Signs' },
    { match: /downlight|can\s?light|recessed/i, label: 'Downlights' },
    { match: /tube|t8|t5|t12/i, label: 'Tubes' },
    { match: /bulb|lamp|a19|a21|br30|par/i, label: 'Lamps / Bulbs' },
    { match: /sensor|control|dimm/i, label: 'Controls / Sensors' },
    { match: /labor|install/i, label: 'Labor / Installation' },
    { match: /disposal|recycl|waste/i, label: 'Disposal / Recycling' },
  ]

  for (const p of patterns) {
    if (p.match.test(lower)) return p.label
  }
  return 'Other'
}

// Group line items into smart categories, capped at MAX_SLICES
function groupLineItems(lineItems) {
  const categoryMap = {} // category -> { total, items[] }

  lineItems.forEach(li => {
    const cat = li.category || inferCategory(li.item_name || li.description)
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, items: [] }
    const lineTotal = parseFloat(li.total || li.line_total) || 0
    categoryMap[cat].total += lineTotal
    categoryMap[cat].items.push(li)
  })

  // Sort categories by total descending
  let entries = Object.entries(categoryMap).sort((a, b) => b[1].total - a[1].total)

  // If more than MAX_SLICES, merge the smallest into "Other"
  if (entries.length > MAX_SLICES) {
    const keep = entries.slice(0, MAX_SLICES - 1)
    const rest = entries.slice(MAX_SLICES - 1)
    const otherTotal = rest.reduce((s, [, v]) => s + v.total, 0)
    const otherItems = rest.flatMap(([, v]) => v.items)
    // If one of the kept entries is already "Other", merge into it
    const existingOther = keep.findIndex(([k]) => k === 'Other')
    if (existingOther >= 0) {
      keep[existingOther][1].total += otherTotal
      keep[existingOther][1].items.push(...otherItems)
    } else {
      keep.push(['Other', { total: otherTotal, items: otherItems }])
    }
    entries = keep.sort((a, b) => b[1].total - a[1].total)
  }

  return entries // [ [categoryName, { total, items }], ... ]
}

// Financial Summary card for certified audits
function FinancialSummary({ totalCost, incentive, discount, annualSavings }) {
  const grossCost = totalCost || 0
  const rebateAmt = incentive || 0
  const discountAmt = discount || 0
  const netInvestment = grossCost - rebateAmt - discountAmt
  const payback = annualSavings > 0 ? (netInvestment / annualSavings) : null

  const rows = [
    { label: 'Gross Project Cost', value: formatCurrency(grossCost), color: proposalTheme.text, weight: '500' },
  ]
  if (rebateAmt > 0) {
    rows.push({ label: 'Utility Rebate', value: `- ${formatCurrency(rebateAmt)}`, color: proposalTheme.success, weight: '500' })
  }
  if (discountAmt > 0) {
    rows.push({ label: 'Discount', value: `- ${formatCurrency(discountAmt)}`, color: proposalTheme.success, weight: '500' })
  }
  rows.push({ label: 'Net Investment', value: formatCurrency(netInvestment), color: proposalTheme.text, weight: '700', highlight: true })
  if (annualSavings > 0) {
    rows.push({ label: 'Estimated Annual Savings', value: formatCurrency(annualSavings), color: proposalTheme.success, weight: '600' })
  }
  if (payback !== null) {
    rows.push({ label: 'Simple Payback Period', value: `${payback.toFixed(1)} years`, color: proposalTheme.accent, weight: '600' })
  }

  return (
    <ProposalSection delay={0.05}>
      <div style={{
        backgroundColor: proposalTheme.bgCard,
        border: `1px solid ${proposalTheme.border}`,
        borderRadius: proposalTheme.cardRadius,
        padding: '28px 32px',
        marginBottom: '36px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: '700',
          color: proposalTheme.text,
          margin: '0 0 20px',
          fontFamily: proposalTheme.fontFamily,
          letterSpacing: '0.2px',
        }}>
          Financial Summary
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderTop: row.highlight ? `2px solid ${proposalTheme.accent}` : (i > 0 ? `1px solid ${proposalTheme.border}` : 'none'),
              borderBottom: row.highlight ? `2px solid ${proposalTheme.accent}` : 'none',
              backgroundColor: row.highlight ? proposalTheme.accentBg : 'transparent',
              marginLeft: row.highlight ? '-12px' : '0',
              marginRight: row.highlight ? '-12px' : '0',
              paddingLeft: row.highlight ? '12px' : '0',
              paddingRight: row.highlight ? '12px' : '0',
              borderRadius: row.highlight ? '6px' : '0',
            }}>
              <span style={{
                fontSize: '15px',
                color: proposalTheme.textSecondary,
                fontWeight: row.highlight ? '600' : '400',
              }}>
                {row.label}
              </span>
              <span style={{
                fontSize: row.highlight ? '18px' : '15px',
                fontWeight: row.weight,
                color: row.color,
                fontFamily: proposalTheme.fontFamily,
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ProposalSection>
  )
}

// Expandable category row in the breakdown table
function CategoryRow({ name, data, color, grandTotal, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false)
  const pct = grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: 'pointer',
          borderBottom: `1px solid ${proposalTheme.border}`,
          backgroundColor: expanded ? 'rgba(90,99,73,0.04)' : 'transparent',
          transition: 'background-color 0.15s ease',
        }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.backgroundColor = 'rgba(90,99,73,0.03)' }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <td style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '3px',
            backgroundColor: color,
            flexShrink: 0,
          }} />
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <ChevronDown size={14} color={proposalTheme.textMuted} />
          </motion.div>
          <span style={{
            fontWeight: '600',
            fontSize: '14px',
            color: proposalTheme.text,
          }}>
            {name}
          </span>
          <span style={{
            fontSize: '12px',
            color: proposalTheme.textMuted,
            marginLeft: '4px',
          }}>
            ({data.items.length} item{data.items.length !== 1 ? 's' : ''})
          </span>
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'right', color: proposalTheme.textMuted, fontSize: '13px' }}>
          {/* qty column blank for category */}
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'right', color: proposalTheme.textMuted, fontSize: '13px' }}>
          {/* unit price blank for category */}
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700', fontSize: '14px', color: proposalTheme.text }}>
          {formatCurrency(data.total)}
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: '12px', color: proposalTheme.textMuted }}>
          {pct}%
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr
            key={`${name}-items`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <td colSpan={5} style={{ padding: 0 }}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {data.items.map((li, j) => {
                      const qty = parseFloat(li.quantity || li.qty) || 0
                      const unitPrice = parseFloat(li.unit_price || li.price) || 0
                      const lineTotal = parseFloat(li.total || li.line_total) || 0
                      return (
                        <tr key={j} style={{
                          borderBottom: j < data.items.length - 1 ? `1px solid rgba(214,205,184,0.5)` : 'none',
                          backgroundColor: 'rgba(90,99,73,0.02)',
                        }}>
                          <td style={{
                            padding: '8px 14px 8px 52px',
                            fontSize: '13px',
                            color: proposalTheme.textSecondary,
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {li.item_name || li.description || 'Line item'}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: '13px', color: proposalTheme.textMuted }}>
                            {qty > 0 ? formatNumber(qty) : '—'}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: '13px', color: proposalTheme.textMuted }}>
                            {unitPrice > 0 ? formatCurrency(unitPrice) : '—'}
                          </td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: '13px', color: proposalTheme.textSecondary }}>
                            {formatCurrency(lineTotal)}
                          </td>
                          <td style={{ padding: '8px 14px', width: '50px' }}>
                            {/* spacer for % column */}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

export default function CostBreakdownSection({
  section, lineItems, auditSummary, certified, brandName,
  incentive, discount, totalCost, annualSavings,
}) {
  if (!lineItems || lineItems.length === 0) return null

  const grouped = useMemo(() => groupLineItems(lineItems), [lineItems])
  const grandTotal = grouped.reduce((s, [, v]) => s + v.total, 0)

  const chartData = grouped.map(([name, v]) => ({ name, value: v.total }))
  const colors = proposalTheme.chartColors

  // Extend colors if we have more categories than default colors
  const extendedColors = [
    ...colors,
    '#6b8f71', '#9b7653', '#7a6b8a', '#5c8a8a',
  ]

  // Per-area wattage reduction data for audit bar chart
  const areas = auditSummary?.areas || []
  const hasAreaData = certified && areas.length > 0

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      backgroundColor: proposalTheme.bgCard,
    }}>
      <div style={{ maxWidth: proposalTheme.maxWidth, margin: '0 auto' }}>

        {/* Section header */}
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

        {/* Financial Summary — shown for certified audits or when there are rebates/discounts */}
        {((incentive > 0 || discount > 0) || (certified && (totalCost > 0 || annualSavings > 0))) && (
          <FinancialSummary
            totalCost={totalCost || grandTotal}
            incentive={incentive}
            discount={discount}
            annualSavings={annualSavings}
          />
        )}

        {/* Donut chart with legend */}
        <ProposalSection delay={0.15}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
          }}>
            <div style={{ width: '280px', height: '280px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={chartData.length > 1 ? 3 : 0}
                    dataKey="value"
                    animationBegin={200}
                    animationDuration={1200}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={extendedColors[i % extendedColors.length]} />
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
              {/* Center total label */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: '11px', color: proposalTheme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Total</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: proposalTheme.text }}>{formatCurrency(grandTotal)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '200px' }}>
              {chartData.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '4px',
                    backgroundColor: extendedColors[i % extendedColors.length],
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
                    }}>{grandTotal > 0 ? Math.round((item.value / grandTotal) * 100) : 0}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ProposalSection>

        {/* Detailed breakdown table */}
        <ProposalSection delay={0.25}>
          <div style={{
            marginTop: '40px',
            backgroundColor: proposalTheme.bg,
            borderRadius: proposalTheme.cardRadius,
            border: `1px solid ${proposalTheme.border}`,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px 12px',
              borderBottom: `1px solid ${proposalTheme.border}`,
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: proposalTheme.text,
                margin: 0,
                fontFamily: proposalTheme.fontFamily,
              }}>
                Detailed Cost Breakdown
              </h3>
              <p style={{
                fontSize: '12px',
                color: proposalTheme.textMuted,
                margin: '4px 0 0',
              }}>
                Click a category to expand individual line items
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${proposalTheme.border}`, backgroundColor: proposalTheme.bgCard }}>
                    <th style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      color: proposalTheme.textMuted,
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}>
                      Category / Item
                    </th>
                    <th style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: proposalTheme.textMuted,
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      width: '70px',
                    }}>
                      Qty
                    </th>
                    <th style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: proposalTheme.textMuted,
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      width: '100px',
                    }}>
                      Unit Price
                    </th>
                    <th style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: proposalTheme.textMuted,
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      width: '110px',
                    }}>
                      Total
                    </th>
                    <th style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: proposalTheme.textMuted,
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      width: '50px',
                    }}>
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([name, data], i) => (
                    <CategoryRow
                      key={name}
                      name={name}
                      data={data}
                      color={extendedColors[i % extendedColors.length]}
                      grandTotal={grandTotal}
                      defaultExpanded={false}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{
                    borderTop: `2px solid ${proposalTheme.accent}`,
                    backgroundColor: proposalTheme.accentBg,
                  }}>
                    <td style={{
                      padding: '14px',
                      fontWeight: '700',
                      fontSize: '15px',
                      color: proposalTheme.text,
                    }}>
                      Grand Total
                    </td>
                    <td style={{ padding: '14px' }} />
                    <td style={{ padding: '14px' }} />
                    <td style={{
                      padding: '14px',
                      textAlign: 'right',
                      fontWeight: '700',
                      fontSize: '15px',
                      color: proposalTheme.text,
                    }}>
                      {formatCurrency(grandTotal)}
                    </td>
                    <td style={{
                      padding: '14px',
                      textAlign: 'right',
                      fontSize: '12px',
                      color: proposalTheme.textMuted,
                    }}>
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </ProposalSection>

        {/* Per-area wattage comparison chart from audit data */}
        {hasAreaData && (
          <ProposalSection delay={0.35}>
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
