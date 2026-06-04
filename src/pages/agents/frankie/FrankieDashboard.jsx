import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Receipt, CreditCard, AlertTriangle, Clock, ChevronRight,
  RefreshCw, MessageCircle, Bell, PieChart, Wallet, Banknote
} from 'lucide-react'
import {
  invoiceBalance, invoiceCustomerTotal, invoiceDaysOverdue, isInvoiceOpen,
  paymentDate, jobContractValue, jobIsComplete, jobCostFromLines, jobMargin,
  expenseCategoryName, hasMeaningfulData, unifiedExpenses,
} from './frankieFields'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatCurrencyShort(amount) {
  if (amount == null || isNaN(amount)) return '$0'
  if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}K`
  return formatCurrency(amount)
}

function daysOverdue(dueDate) {
  if (!dueDate) return 0
  const now = new Date()
  const due = new Date(dueDate)
  return Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)))
}

export default function FrankieDashboard() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const invoices = useStore(s => s.invoices) || []
  const payments = useStore(s => s.payments) || []
  const manualExpenses = useStore(s => s.expenses) || []
  const plaidTransactions = useStore(s => s.plaidTransactions) || []
  const jobs = useStore(s => s.jobs) || []
  const fetchInvoices = useStore(s => s.fetchInvoices)
  const fetchPayments = useStore(s => s.fetchPayments)
  const fetchExpenses = useStore(s => s.fetchExpenses)
  const fetchPlaidTransactions = useStore(s => s.fetchPlaidTransactions)
  const companyId = useStore(s => s.companyId)

  // The actual expense source — manual entries plus bank-fed debits.
  // Most tenants (HHH included) have zero manual entries and all their
  // real spend is in plaid_transactions, so reading manual_expenses
  // alone reports $0 expenses. unifiedExpenses normalizes both into
  // one stream with .expense_date / .amount / .category.name shape.
  const expenses = useMemo(
    () => unifiedExpenses(manualExpenses, plaidTransactions),
    [manualExpenses, plaidTransactions]
  )

  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (companyId) {
      fetchInvoices()
      fetchPayments()
      fetchExpenses()
      if (fetchPlaidTransactions) fetchPlaidTransactions()
    }
  }, [companyId])

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([
      fetchInvoices(),
      fetchPayments(),
      fetchExpenses(),
      fetchPlaidTransactions ? fetchPlaidTransactions() : Promise.resolve(),
    ])
    setRefreshing(false)
  }

  // Financial computations — go through frankieFields helpers so every
  // metric agrees with the rest of the app (Books, Invoices, Pipeline).
  const financials = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    // Build payments-by-invoice index so invoiceBalance is O(1) per call.
    const paymentsByInv = new Map()
    for (const p of payments) {
      if (!p.invoice_id) continue
      paymentsByInv.set(p.invoice_id, (paymentsByInv.get(p.invoice_id) || 0) + (Number(p.amount) || 0))
    }

    // Revenue (payments received in last 30 days) — uses paymentDate helper
    // so it works with the actual `date` column (not `payment_date`).
    const recentPayments = payments.filter(p => {
      const d = paymentDate(p); return d && new Date(d) >= thirtyDaysAgo
    })
    const revenue30d = recentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

    const prevPayments = payments.filter(p => {
      const d = paymentDate(p); if (!d) return false
      const t = new Date(d); return t >= sixtyDaysAgo && t < thirtyDaysAgo
    })
    const revenuePrev30d = prevPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    const revenueChange = revenuePrev30d > 0 ? ((revenue30d - revenuePrev30d) / revenuePrev30d * 100) : 0

    // Expenses (last 30 days)
    const recentExpenses = expenses.filter(e => new Date(e.expense_date) >= thirtyDaysAgo)
    const expenses30d = recentExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

    const prevExpenses = expenses.filter(e => {
      const d = new Date(e.expense_date)
      return d >= sixtyDaysAgo && d < thirtyDaysAgo
    })
    const expensesPrev30d = prevExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
    const expensesChange = expensesPrev30d > 0 ? ((expenses30d - expensesPrev30d) / expensesPrev30d * 100) : 0

    // Net cash flow
    const netCashFlow = revenue30d - expenses30d

    // Accounts Receivable — uses customer balance (gross − discount −
    // applied payments), not gross. Same math as InvoiceDetail / Books.
    // Attach balance_due on each row so downstream render code (which
    // reads inv.balance_due) sees the right value without re-computing.
    const unpaidInvoices = invoices
      .filter(inv => isInvoiceOpen(inv) && invoiceBalance(inv, paymentsByInv) > 0)
      .map(inv => ({ ...inv, balance_due: invoiceBalance(inv, paymentsByInv) }))
    const totalAR = unpaidInvoices.reduce((sum, inv) => sum + inv.balance_due, 0)

    // Overdue invoices — uses due_date if set, otherwise created_at + 30
    // (Net 30) so new tenants still get meaningful aging.
    const overdueInvoices = unpaidInvoices.filter(inv => invoiceDaysOverdue(inv, now) > 0)
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.balance_due, 0)

    // AR aging buckets
    const arAging = { current: 0, days30: 0, days60: 0, days90plus: 0 }
    unpaidInvoices.forEach(inv => {
      const overdueDays = invoiceDaysOverdue(inv, now)
      const balance = invoiceBalance(inv, paymentsByInv)
      if (overdueDays === 0) arAging.current += balance
      else if (overdueDays <= 30) arAging.days30 += balance
      else if (overdueDays <= 60) arAging.days60 += balance
      else arAging.days90plus += balance
    })

    // Burn rate (avg monthly expenses over last 3 months)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const expenses90d = expenses.filter(e => new Date(e.expense_date) >= ninetyDaysAgo)
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
    const monthlyBurnRate = expenses90d / 3

    // Expense categories — category is a relation, not a string. Use helper.
    const categoryBreakdown = {}
    recentExpenses.forEach(e => {
      const cat = expenseCategoryName(e)
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (parseFloat(e.amount) || 0)
    })
    const topCategories = Object.entries(categoryBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)

    // Total invoiced (all time) — actual column is `amount`, not `total`.
    const totalInvoiced = invoices.reduce((sum, inv) => sum + invoiceCustomerTotal(inv), 0)
    const totalCollected = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced * 100) : 0

    // Job profitability snapshot — uses jobIsComplete (handles all the
    // actual JobScout status values, not just 'Complete'/'Completed'),
    // jobContractValue (job_total column), and jobCostFromLines (walks
    // job_lines.labor_cost since jobs don't carry cost directly).
    const completedJobs = jobs.filter(jobIsComplete)
    const jobProfitability = completedJobs.slice(0, 5).map(j => {
      const contract = jobContractValue(j)
      const cost = jobCostFromLines(j.id, []) // job_lines not yet wired into store
      const profit = contract - cost
      const margin = contract > 0 ? (profit / contract * 100) : 0
      return { ...j, contract, cost, profit, margin }
    })

    return {
      revenue30d, revenueChange, expenses30d, expensesChange,
      netCashFlow, totalAR, totalOverdue, overdueInvoices,
      arAging, monthlyBurnRate, topCategories,
      collectionRate, unpaidInvoices, jobProfitability
    }
  }, [invoices, payments, expenses, jobs])

  const statCards = [
    {
      label: 'Revenue (30d)',
      value: formatCurrencyShort(financials.revenue30d),
      change: financials.revenueChange,
      icon: TrendingUp,
      color: '#22c55e'
    },
    {
      label: 'Expenses (30d)',
      value: formatCurrencyShort(financials.expenses30d),
      change: financials.expensesChange,
      icon: TrendingDown,
      color: '#f59e0b'
    },
    {
      label: 'Accounts Receivable',
      value: formatCurrencyShort(financials.totalAR),
      subtitle: `${financials.unpaidInvoices.length} unpaid`,
      icon: Receipt,
      color: '#3b82f6'
    },
    {
      label: 'Overdue',
      value: formatCurrencyShort(financials.totalOverdue),
      subtitle: `${financials.overdueInvoices.length} invoices`,
      icon: AlertTriangle,
      color: financials.totalOverdue > 0 ? '#ef4444' : '#22c55e'
    },
  ]

  const agingColors = {
    current: '#22c55e',
    days30: '#f59e0b',
    days60: '#f97316',
    days90plus: '#ef4444'
  }

  // Empty / new-tenant state — when there's no real data yet, show a
  // welcome card with the next steps so a brand-new tenant who just
  // recruited Frankie doesn't land on a dashboard full of $0s.
  const noData = !hasMeaningfulData({ invoices, payments })

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {noData && (
        <div style={{
          marginBottom: '24px',
          padding: '20px 24px',
          backgroundColor: theme.accentBg,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '700', color: theme.text }}>
            👋 Welcome to Frankie
          </h2>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: theme.textSecondary, lineHeight: 1.5 }}>
            I'm your AI CFO. I'll start tracking revenue, AR, expenses, burn rate, and job profitability as soon as you have
            data in JobScout. Three things will light me up:
          </p>
          <ol style={{ margin: '0 0 12px 18px', padding: 0, color: theme.textSecondary, fontSize: '13px', lineHeight: 1.7 }}>
            <li><strong>Send your first invoice</strong> — I'll track AR + overdue from there.</li>
            <li><strong>Record your first payment</strong> — revenue + collection rate calc light up.</li>
            <li><strong>Connect a bank account in Books</strong> — expenses + burn rate go live.</li>
          </ol>
          <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted, lineHeight: 1.5 }}>
            Once you have any of the above, this banner disappears and your real numbers replace it. No setup required on my end.
          </p>
        </div>
      )}
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Financial Dashboard
          </h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
            Real-time financial intelligence for your business
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/agents/frankie/ask')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', backgroundColor: theme.accent, color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontWeight: '600', fontSize: '14px'
            }}
          >
            <MessageCircle size={16} /> Ask Frankie
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', backgroundColor: theme.bgCard, color: theme.text,
              border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer',
              fontWeight: '500', fontSize: '14px', opacity: refreshing ? 0.6 : 1
            }}
          >
            <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} style={{
              background: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: isMobile ? '16px' : '20px',
              boxShadow: theme.shadow
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: `${card.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Icon size={20} style={{ color: card.color }} />
                </div>
                {card.change != null && card.change !== 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '2px',
                    fontSize: '12px', fontWeight: '600',
                    color: card.change > 0 ? '#22c55e' : '#ef4444'
                  }}>
                    {card.change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(card.change).toFixed(1)}%
                  </div>
                )}
              </div>
              <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
                {card.value}
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                {card.subtitle || card.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Net Cash Flow Banner */}
      <div style={{
        background: financials.netCashFlow >= 0
          ? 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))',
        borderRadius: '12px',
        border: `1px solid ${financials.netCashFlow >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
        padding: isMobile ? '16px' : '20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Net Cash Flow (30 Days)
          </div>
          <div style={{
            fontSize: isMobile ? '24px' : '32px', fontWeight: '700',
            color: financials.netCashFlow >= 0 ? '#22c55e' : '#ef4444'
          }}>
            {financials.netCashFlow >= 0 ? '+' : ''}{formatCurrency(financials.netCashFlow)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Monthly Burn Rate</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
            {formatCurrencyShort(financials.monthlyBurnRate)}/mo
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* AR Aging */}
        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px',
          boxShadow: theme.shadow
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>AR Aging</h2>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Collection Rate: <span style={{ fontWeight: '600', color: theme.text }}>{financials.collectionRate.toFixed(0)}%</span>
            </div>
          </div>
          {[
            { label: 'Current', value: financials.arAging.current, color: agingColors.current },
            { label: '1-30 Days', value: financials.arAging.days30, color: agingColors.days30 },
            { label: '31-60 Days', value: financials.arAging.days60, color: agingColors.days60 },
            { label: '90+ Days', value: financials.arAging.days90plus, color: agingColors.days90plus },
          ].map((bucket, i) => {
            const pct = financials.totalAR > 0 ? (bucket.value / financials.totalAR * 100) : 0
            return (
              <div key={i} style={{ marginBottom: i < 3 ? '12px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: theme.textSecondary }}>{bucket.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{formatCurrency(bucket.value)}</span>
                </div>
                <div style={{
                  height: '8px', borderRadius: '4px', background: `${bucket.color}15`,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%', borderRadius: '4px', background: bucket.color,
                    width: `${Math.min(pct, 100)}%`,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Top Expense Categories */}
        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px',
          boxShadow: theme.shadow
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: '0 0 16px' }}>
            Expense Breakdown (30d)
          </h2>
          {financials.topCategories.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>
              No expenses in the last 30 days
            </div>
          ) : (
            financials.topCategories.map(([cat, amount], i) => {
              const pct = financials.expenses30d > 0 ? (amount / financials.expenses30d * 100) : 0
              const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#6b7280']
              return (
                <div key={cat} style={{ marginBottom: i < financials.topCategories.length - 1 ? '12px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: theme.textSecondary }}>{cat}</span>
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>
                      {formatCurrency(amount)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div style={{
                    height: '6px', borderRadius: '3px', background: `${colors[i % colors.length]}15`,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: colors[i % colors.length],
                      width: `${pct}%`,
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Overdue Invoices */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        boxShadow: theme.shadow,
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Overdue Invoices
          </h2>
          {financials.overdueInvoices.length > 0 && (
            <button
              onClick={() => navigate('/agents/frankie/collections')}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600'
              }}
            >
              <Bell size={14} /> Manage Collections
            </button>
          )}
        </div>

        {financials.overdueInvoices.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>
            No overdue invoices — you're all caught up!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Invoice', 'Customer', 'Due Date', 'Days Late', 'Balance'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: '12px',
                      fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase',
                      letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financials.overdueInvoices.slice(0, 10).map(inv => {
                  const days = invoiceDaysOverdue(inv)
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/invoices/${inv.id}`, { state: { from: window.location.pathname } })}
                      style={{ cursor: 'pointer' }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = theme.accentBg}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: theme.text, borderBottom: `1px solid ${theme.border}` }}>
                        {inv.invoice_id || inv.invoice_number || `#${inv.id}`}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                        {inv.customer?.name || 'Unknown'}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                          backgroundColor: days > 60 ? 'rgba(239,68,68,0.15)' : days > 30 ? 'rgba(249,115,22,0.15)' : 'rgba(245,158,11,0.15)',
                          color: days > 60 ? '#ef4444' : days > 30 ? '#f97316' : '#f59e0b'
                        }}>
                          {days}d
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#ef4444', borderBottom: `1px solid ${theme.border}` }}>
                        {formatCurrency(inv.balance_due)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Job Profitability Snapshot */}
      {financials.jobProfitability.length > 0 && (
        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px',
          boxShadow: theme.shadow
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: '0 0 16px' }}>
            Recent Job Profitability
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Job', 'Contract', 'Cost', 'Profit', 'Margin'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontSize: '12px',
                      fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase',
                      letterSpacing: '0.5px', borderBottom: `1px solid ${theme.border}`
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financials.jobProfitability.map(job => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.backgroundColor = theme.accentBg}
                    onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: theme.text, borderBottom: `1px solid ${theme.border}` }}>
                      {job.job_title || job.job_id || `#${job.id}`}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                      {formatCurrency(job.contract)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                      {formatCurrency(job.cost)}
                    </td>
                    <td style={{
                      padding: '12px', fontSize: '14px', fontWeight: '600',
                      color: job.profit >= 0 ? '#22c55e' : '#ef4444',
                      borderBottom: `1px solid ${theme.border}`
                    }}>
                      {job.profit >= 0 ? '+' : ''}{formatCurrency(job.profit)}
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                        backgroundColor: job.margin >= 30 ? 'rgba(34,197,94,0.15)' : job.margin >= 15 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                        color: job.margin >= 30 ? '#22c55e' : job.margin >= 15 ? '#f59e0b' : '#ef4444'
                      }}>
                        {job.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Action Chips */}
      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap',
        marginTop: '24px', paddingTop: '24px',
        borderTop: `1px solid ${theme.border}`
      }}>
        {[
          { label: 'Ask Frankie', icon: MessageCircle, path: '/agents/frankie/ask' },
          { label: 'Collections', icon: Bell, path: '/agents/frankie/collections' },
          { label: 'Insights', icon: TrendingUp, path: '/agents/frankie/insights' },
          { label: 'Invoices', icon: Receipt, path: '/invoices' },
          { label: 'Expenses', icon: Wallet, path: '/expenses' },
        ].map(action => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '20px',
                background: theme.accentBg, color: theme.accent,
                border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '500'
              }}
            >
              <Icon size={14} /> {action.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
