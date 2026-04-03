import { useState, useMemo } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  DollarSign, PieChart, BarChart3, Lightbulb, Zap,
  ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp,
  Calculator, Target
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function FrankieInsights() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const invoices = useStore(s => s.invoices) || []
  const payments = useStore(s => s.payments) || []
  const expenses = useStore(s => s.expenses) || []
  const jobs = useStore(s => s.jobs) || []

  const [whatIfOpen, setWhatIfOpen] = useState(false)
  const [priceChange, setPriceChange] = useState(0)
  const [volumeChange, setVolumeChange] = useState(0)
  const [expenseReduction, setExpenseReduction] = useState(0)

  // Compute insights
  const insights = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    const results = { anomalies: [], recommendations: [], metrics: {} }

    // Revenue analysis
    const revenue30d = payments.filter(p => new Date(p.payment_date) >= thirtyDaysAgo)
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    const revenuePrev = payments.filter(p => {
      const d = new Date(p.payment_date)
      return d >= sixtyDaysAgo && d < thirtyDaysAgo
    }).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

    // Expense analysis
    const recentExpenses = expenses.filter(e => new Date(e.expense_date) >= thirtyDaysAgo)
    const expenses30d = recentExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
    const expensesPrev = expenses.filter(e => {
      const d = new Date(e.expense_date)
      return d >= sixtyDaysAgo && d < thirtyDaysAgo
    }).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

    results.metrics = { revenue30d, revenuePrev, expenses30d, expensesPrev }

    // Expense anomaly detection
    const categoryAvgs = {}
    const categoryCurrents = {}

    // Get 90-day averages by category
    expenses.filter(e => new Date(e.expense_date) >= ninetyDaysAgo).forEach(e => {
      const cat = e.category || 'Uncategorized'
      if (!categoryAvgs[cat]) categoryAvgs[cat] = []
      categoryAvgs[cat].push(parseFloat(e.amount) || 0)
    })

    recentExpenses.forEach(e => {
      const cat = e.category || 'Uncategorized'
      categoryCurrents[cat] = (categoryCurrents[cat] || 0) + (parseFloat(e.amount) || 0)
    })

    // Find spikes (category spending > 150% of 90-day monthly average)
    Object.entries(categoryAvgs).forEach(([cat, amounts]) => {
      const monthlyAvg = amounts.reduce((a, b) => a + b, 0) / 3
      const current = categoryCurrents[cat] || 0
      if (monthlyAvg > 0 && current > monthlyAvg * 1.5 && current > 100) {
        const spike = ((current - monthlyAvg) / monthlyAvg * 100).toFixed(0)
        results.anomalies.push({
          type: 'spike',
          category: cat,
          current,
          average: monthlyAvg,
          spike: parseInt(spike),
          message: `${cat} spending is up ${spike}% vs 3-month average`,
          severity: parseInt(spike) > 200 ? 'high' : 'medium'
        })
      }
    })

    // Find duplicate-looking expenses (same vendor + similar amount within 7 days)
    const sortedExpenses = [...recentExpenses].sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date))
    for (let i = 0; i < sortedExpenses.length; i++) {
      for (let j = i + 1; j < sortedExpenses.length; j++) {
        const a = sortedExpenses[i]
        const b = sortedExpenses[j]
        const daysDiff = Math.abs(new Date(a.expense_date) - new Date(b.expense_date)) / (1000 * 60 * 60 * 24)
        if (daysDiff > 7) break
        if (a.vendor && b.vendor && a.vendor === b.vendor &&
          Math.abs((parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0)) < 1) {
          results.anomalies.push({
            type: 'duplicate',
            vendor: a.vendor,
            amount: parseFloat(a.amount),
            dates: [a.expense_date, b.expense_date],
            message: `Possible duplicate: ${a.vendor} charged ${formatCurrency(a.amount)} twice within ${daysDiff.toFixed(0)} days`,
            severity: 'medium'
          })
        }
      }
    }

    // Revenue decline alert
    if (revenuePrev > 0 && revenue30d < revenuePrev * 0.8) {
      const decline = ((revenuePrev - revenue30d) / revenuePrev * 100).toFixed(0)
      results.anomalies.push({
        type: 'revenue_decline',
        current: revenue30d,
        previous: revenuePrev,
        message: `Revenue dropped ${decline}% compared to previous 30 days`,
        severity: 'high'
      })
    }

    // Expense increase alert
    if (expensesPrev > 0 && expenses30d > expensesPrev * 1.3) {
      const increase = ((expenses30d - expensesPrev) / expensesPrev * 100).toFixed(0)
      results.anomalies.push({
        type: 'expense_increase',
        current: expenses30d,
        previous: expensesPrev,
        message: `Expenses up ${increase}% compared to previous 30 days`,
        severity: expenses30d > expensesPrev * 1.5 ? 'high' : 'medium'
      })
    }

    // Recommendations
    const unpaidInvoices = invoices.filter(inv =>
      inv.status !== 'Paid' && inv.status !== 'Void' && parseFloat(inv.balance_due) > 0
    )
    const overdue = unpaidInvoices.filter(inv => inv.due_date && new Date(inv.due_date) < now)
    const overdueTotal = overdue.reduce((s, inv) => s + (parseFloat(inv.balance_due) || 0), 0)

    if (overdueTotal > 0) {
      results.recommendations.push({
        icon: AlertTriangle,
        color: '#ef4444',
        title: `Collect ${formatCurrency(overdueTotal)} in overdue invoices`,
        detail: `${overdue.length} invoices are past due. Prioritize 90+ day accounts.`
      })
    }

    const completedJobs = jobs.filter(j => j.status === 'Complete' || j.status === 'Completed')
    const lowMarginJobs = completedJobs.filter(j => {
      const contract = parseFloat(j.contract_amount) || 0
      const cost = (parseFloat(j.labor_cost) || 0) + (parseFloat(j.material_cost) || 0) + (parseFloat(j.other_cost) || 0)
      return contract > 0 && ((contract - cost) / contract * 100) < 15
    })
    if (lowMarginJobs.length > 0) {
      results.recommendations.push({
        icon: TrendingDown,
        color: '#f59e0b',
        title: `${lowMarginJobs.length} jobs with margins below 15%`,
        detail: 'Review pricing or cost controls for these job types.'
      })
    }

    if (revenue30d > 0 && expenses30d / revenue30d > 0.85) {
      results.recommendations.push({
        icon: DollarSign,
        color: '#f97316',
        title: 'Expense ratio is above 85%',
        detail: `You're spending ${(expenses30d / revenue30d * 100).toFixed(0)}% of revenue. Target is under 70%.`
      })
    }

    if (revenue30d > revenuePrev * 1.1) {
      results.recommendations.push({
        icon: TrendingUp,
        color: '#22c55e',
        title: 'Revenue is trending up!',
        detail: `Up ${((revenue30d - revenuePrev) / (revenuePrev || 1) * 100).toFixed(0)}% from last period. Keep the momentum.`
      })
    }

    // Job profitability by type
    const jobTypeProfit = {}
    completedJobs.forEach(j => {
      const type = j.job_type || j.job_category || 'General'
      if (!jobTypeProfit[type]) jobTypeProfit[type] = { contract: 0, cost: 0, count: 0 }
      jobTypeProfit[type].contract += parseFloat(j.contract_amount) || 0
      jobTypeProfit[type].cost += (parseFloat(j.labor_cost) || 0) + (parseFloat(j.material_cost) || 0) + (parseFloat(j.other_cost) || 0)
      jobTypeProfit[type].count++
    })
    results.jobTypeProfit = Object.entries(jobTypeProfit)
      .map(([type, data]) => ({
        type,
        ...data,
        profit: data.contract - data.cost,
        margin: data.contract > 0 ? ((data.contract - data.cost) / data.contract * 100) : 0
      }))
      .sort((a, b) => b.margin - a.margin)

    return results
  }, [invoices, payments, expenses, jobs])

  // What-if calculation
  const whatIfResults = useMemo(() => {
    const { revenue30d, expenses30d } = insights.metrics
    const adjustedRevenue = revenue30d * (1 + priceChange / 100) * (1 + volumeChange / 100)
    const adjustedExpenses = expenses30d * (1 - expenseReduction / 100)
    const currentProfit = revenue30d - expenses30d
    const projectedProfit = adjustedRevenue - adjustedExpenses
    const profitChange = projectedProfit - currentProfit

    return {
      currentRevenue: revenue30d,
      projectedRevenue: adjustedRevenue,
      currentExpenses: expenses30d,
      projectedExpenses: adjustedExpenses,
      currentProfit,
      projectedProfit,
      profitChange,
      currentMargin: revenue30d > 0 ? (currentProfit / revenue30d * 100) : 0,
      projectedMargin: adjustedRevenue > 0 ? (projectedProfit / adjustedRevenue * 100) : 0,
    }
  }, [insights.metrics, priceChange, volumeChange, expenseReduction])

  const severityColors = {
    high: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', icon: AlertTriangle },
    medium: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', icon: Zap },
    low: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6', icon: Lightbulb },
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
          Financial Insights
        </h1>
        <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
          Anomaly detection, profitability analysis, and what-if scenarios
        </p>
      </div>

      {/* Anomalies */}
      {insights.anomalies.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} style={{ color: '#ef4444' }} /> Anomalies Detected
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {insights.anomalies.map((anomaly, i) => {
              const sev = severityColors[anomaly.severity] || severityColors.medium
              const SevIcon = sev.icon
              return (
                <div key={i} style={{
                  background: sev.bg,
                  border: `1px solid ${sev.border}`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <SevIcon size={20} style={{ color: sev.text, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                      {anomaly.message}
                    </div>
                    {anomaly.type === 'spike' && (
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        Current: {formatCurrency(anomaly.current)} vs Avg: {formatCurrency(anomaly.average)}/mo
                      </div>
                    )}
                    {anomaly.type === 'duplicate' && (
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        {anomaly.dates.map(d => new Date(d).toLocaleDateString()).join(' and ')}
                      </div>
                    )}
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                    background: sev.border, color: sev.text
                  }}>
                    {anomaly.severity}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {insights.anomalies.length === 0 && (
        <div style={{
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: '12px', padding: '20px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <CheckCircle2 size={24} style={{ color: '#22c55e' }} />
          <div>
            <div style={{ fontWeight: '600', color: theme.text }}>No anomalies detected</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>Your finances look stable. Keep it up!</div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={18} style={{ color: '#f59e0b' }} /> Recommendations
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '12px' }}>
            {insights.recommendations.map((rec, i) => {
              const Icon = rec.icon
              return (
                <div key={i} style={{
                  background: theme.bgCard, borderRadius: '12px',
                  border: `1px solid ${theme.border}`, padding: '16px',
                  display: 'flex', gap: '12px'
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px',
                    background: `${rec.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Icon size={18} style={{ color: rec.color }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px', marginBottom: '2px' }}>
                      {rec.title}
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>{rec.detail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Job Type Profitability */}
      {insights.jobTypeProfit && insights.jobTypeProfit.length > 0 && (
        <div style={{
          background: theme.bgCard, borderRadius: '12px',
          border: `1px solid ${theme.border}`, padding: '20px',
          marginBottom: '24px', boxShadow: theme.shadow
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: '0 0 16px' }}>
            Profitability by Job Type
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Job Type', 'Jobs', 'Revenue', 'Cost', 'Profit', 'Margin'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: '12px',
                      fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase',
                      letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insights.jobTypeProfit.map(row => (
                  <tr key={row.type}>
                    <td style={{ padding: '10px 12px', fontWeight: '500', color: theme.text, borderBottom: `1px solid ${theme.border}`, fontSize: '14px' }}>
                      {row.type}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, fontSize: '14px' }}>
                      {row.count}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, fontSize: '14px' }}>
                      {formatCurrency(row.contract)}
                    </td>
                    <td style={{ padding: '10px 12px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, fontSize: '14px' }}>
                      {formatCurrency(row.cost)}
                    </td>
                    <td style={{
                      padding: '10px 12px', fontWeight: '600', borderBottom: `1px solid ${theme.border}`, fontSize: '14px',
                      color: row.profit >= 0 ? '#22c55e' : '#ef4444'
                    }}>
                      {row.profit >= 0 ? '+' : ''}{formatCurrency(row.profit)}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '600',
                        background: row.margin >= 30 ? 'rgba(34,197,94,0.15)' : row.margin >= 15 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                        color: row.margin >= 30 ? '#22c55e' : row.margin >= 15 ? '#f59e0b' : '#ef4444'
                      }}>
                        {row.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* What-If Scenario Calculator */}
      <div style={{
        background: theme.bgCard, borderRadius: '12px',
        border: `1px solid ${theme.border}`, overflow: 'hidden',
        boxShadow: theme.shadow
      }}>
        <button
          onClick={() => setWhatIfOpen(!whatIfOpen)}
          style={{
            width: '100%', padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer',
            color: theme.text
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calculator size={20} style={{ color: theme.accent }} />
            <span style={{ fontSize: '16px', fontWeight: '700' }}>What-If Scenario Calculator</span>
          </div>
          {whatIfOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {whatIfOpen && (
          <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.border}` }}>
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: '16px 0' }}>
              Adjust the sliders to see how pricing, volume, and expense changes would impact your bottom line.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
              {/* Price Change */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'block', marginBottom: '8px' }}>
                  Price Change: <span style={{ color: priceChange > 0 ? '#22c55e' : priceChange < 0 ? '#ef4444' : theme.textMuted }}>{priceChange > 0 ? '+' : ''}{priceChange}%</span>
                </label>
                <input
                  type="range" min="-30" max="30" value={priceChange}
                  onChange={e => setPriceChange(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: theme.accent }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
                  <span>-30%</span><span>0</span><span>+30%</span>
                </div>
              </div>

              {/* Volume Change */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'block', marginBottom: '8px' }}>
                  Volume Change: <span style={{ color: volumeChange > 0 ? '#22c55e' : volumeChange < 0 ? '#ef4444' : theme.textMuted }}>{volumeChange > 0 ? '+' : ''}{volumeChange}%</span>
                </label>
                <input
                  type="range" min="-30" max="30" value={volumeChange}
                  onChange={e => setVolumeChange(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: theme.accent }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
                  <span>-30%</span><span>0</span><span>+30%</span>
                </div>
              </div>

              {/* Expense Reduction */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'block', marginBottom: '8px' }}>
                  Expense Reduction: <span style={{ color: expenseReduction > 0 ? '#22c55e' : theme.textMuted }}>{expenseReduction}%</span>
                </label>
                <input
                  type="range" min="0" max="30" value={expenseReduction}
                  onChange={e => setExpenseReduction(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: theme.accent }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
                  <span>0%</span><span>15%</span><span>30%</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div style={{
              background: theme.bg, borderRadius: '10px',
              padding: '16px', display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: '16px'
            }}>
              <div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Revenue</div>
                <div style={{ fontSize: '14px', color: theme.textMuted, textDecoration: 'line-through' }}>
                  {formatCurrency(whatIfResults.currentRevenue)}
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                  {formatCurrency(whatIfResults.projectedRevenue)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Expenses</div>
                <div style={{ fontSize: '14px', color: theme.textMuted, textDecoration: 'line-through' }}>
                  {formatCurrency(whatIfResults.currentExpenses)}
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                  {formatCurrency(whatIfResults.projectedExpenses)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Projected Profit</div>
                <div style={{
                  fontSize: '18px', fontWeight: '700',
                  color: whatIfResults.projectedProfit >= 0 ? '#22c55e' : '#ef4444'
                }}>
                  {formatCurrency(whatIfResults.projectedProfit)}
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: '600',
                  color: whatIfResults.profitChange >= 0 ? '#22c55e' : '#ef4444',
                  display: 'flex', alignItems: 'center', gap: '2px'
                }}>
                  {whatIfResults.profitChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {whatIfResults.profitChange >= 0 ? '+' : ''}{formatCurrency(whatIfResults.profitChange)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Margin</div>
                <div style={{ fontSize: '14px', color: theme.textMuted, textDecoration: 'line-through' }}>
                  {whatIfResults.currentMargin.toFixed(1)}%
                </div>
                <div style={{
                  fontSize: '18px', fontWeight: '700',
                  color: whatIfResults.projectedMargin >= 20 ? '#22c55e' : whatIfResults.projectedMargin >= 10 ? '#f59e0b' : '#ef4444'
                }}>
                  {whatIfResults.projectedMargin.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
