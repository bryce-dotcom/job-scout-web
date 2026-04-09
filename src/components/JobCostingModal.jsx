import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, DollarSign, TrendingUp, TrendingDown, Receipt,
  Clock, Package, Truck, Users, Loader, Zap
} from 'lucide-react'

const fmt = (v) => (v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function JobCostingModal({ job, theme, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (job?.id) fetchCostingData()
  }, [job?.id])

  const fetchCostingData = async () => {
    setLoading(true)
    try {
      const companyId = job.company_id

      // Fetch all data in parallel
      const [invoicesRes, expensesRes, plaidRes, allocRes, timeRes, configRes, skillRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, amount, payment_status')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('expenses')
          .select('*')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('plaid_transactions')
          .select('*')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('transaction_job_allocations')
          .select('*, txn:plaid_transactions!transaction_id(id, amount, merchant_name, user_category, ai_category, date)')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        // time_clock is the single source of truth for "hours worked on a job".
        // Payroll's edit screen adjusts these rows, so fixes flow through here.
        supabase
          .from('time_clock')
          .select('id, employee_id, job_id, clock_in, clock_out, total_hours, lunch_start, lunch_end, employee:employees!employee_id(id, name, hourly_rate, skill_level)')
          .eq('job_id', job.id)
          .eq('company_id', companyId)
          .not('clock_out', 'is', null),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'payroll_config')
          .maybeSingle(),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'skill_levels')
          .maybeSingle(),
      ])

      const invoices = invoicesRes.data || []
      const expenses = expensesRes.data || []
      const allocations = allocRes.data || []
      // Normalize time_clock rows into the { hours, employee, employee_id } shape
      // the labor/bonus logic below expects. Lunch is already baked into
      // total_hours at clock-out; fall back to (clock_out - clock_in) for any
      // row where total_hours wasn't persisted yet.
      const timeLogs = (timeRes.data || []).map((row) => {
        let hours = parseFloat(row.total_hours)
        if (!(hours > 0) && row.clock_in && row.clock_out) {
          hours = (new Date(row.clock_out) - new Date(row.clock_in)) / 36e5
          if (row.lunch_start && row.lunch_end) {
            hours -= (new Date(row.lunch_end) - new Date(row.lunch_start)) / 36e5
          }
        }
        return { ...row, hours: Math.round((hours || 0) * 100) / 100 }
      })

      // Build plaid costs from allocations (exact amounts) with fallback to legacy job_id
      const allocatedTxnIds = new Set(allocations.map(a => a.transaction_id))
      const legacyPlaidTxns = (plaidRes.data || []).filter(t => !allocatedTxnIds.has(t.id))
      // Convert allocations to plaid-like objects with the allocated amount and category from parent txn
      const allocPlaid = allocations.map(a => ({
        ...a.txn,
        amount: parseFloat(a.amount) || 0,
        _allocatedAmount: parseFloat(a.amount) || 0,
        category: a.txn?.user_category || a.txn?.ai_category,
      }))
      const plaidTxns = [
        ...legacyPlaidTxns,
        ...allocPlaid,
      ]

      // Fetch payments for all invoices
      const invoiceIds = invoices.map((i) => i.id)
      let payments = []
      if (invoiceIds.length > 0) {
        const { data: payData } = await supabase
          .from('payments')
          .select('id, amount, invoice_id')
          .in('invoice_id', invoiceIds)
        payments = payData || []
      }

      // Revenue
      const invoicedAmount = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
      const paidAmount = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const outstandingAR = invoicedAmount - paidAmount

      // Categorize expenses
      const materialKeywords = ['material', 'supplies', 'supply']
      const isMaterial = (cat) => cat && materialKeywords.some((k) => cat.toLowerCase().includes(k))
      const isSub = (cat) => cat && cat.toLowerCase() === 'subcontractor'

      const materialExpenses = expenses.filter((e) => isMaterial(e.category))
      const subExpenses = expenses.filter((e) => isSub(e.category))
      const receiptExpenses = expenses.filter((e) => e.receipt_url)
      const otherExpenses = expenses.filter((e) => !isMaterial(e.category) && !isSub(e.category))

      // Plaid transactions by category — use _allocatedAmount if set, else abs(amount)
      const plaidAmt = (t) => t._allocatedAmount != null ? t._allocatedAmount : Math.abs(parseFloat(t.amount) || 0)
      const materialPlaid = plaidTxns.filter((t) => isMaterial(t.category))
      const otherPlaid = plaidTxns.filter((t) => !isMaterial(t.category))

      // Material costs
      const materialCost =
        materialExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) +
        materialPlaid.reduce((s, t) => s + plaidAmt(t), 0)

      // Labor costs
      const laborLines = []
      const empMap = {}
      timeLogs.forEach((tl) => {
        const empId = tl.employee?.id || tl.employee_id
        const empName = tl.employee?.name || 'Unknown'
        const rate = parseFloat(tl.employee?.hourly_rate) || 0
        const hours = parseFloat(tl.hours) || 0
        if (!empMap[empId]) {
          empMap[empId] = { name: empName, rate, hours: 0, cost: 0 }
        }
        empMap[empId].hours += hours
        empMap[empId].cost += hours * rate
      })
      Object.values(empMap).forEach((e) => laborLines.push(e))
      const laborCost = laborLines.reduce((s, l) => s + l.cost, 0)

      // Subcontractor costs
      const subCost = subExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

      // Other costs
      const otherCost =
        otherExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) +
        otherPlaid.reduce((s, t) => s + plaidAmt(t), 0)

      // Bonus hours calculation
      let bonusData = null
      let payrollCfg = null
      try { payrollCfg = configRes.data?.value ? JSON.parse(configRes.data.value) : null } catch {}
      let skillLevels = []
      try {
        const parsed = skillRes.data?.value ? JSON.parse(skillRes.data.value) : []
        skillLevels = parsed.map(s => typeof s === 'string' ? { name: s, weight: 1 } : s)
      } catch {}

      const allottedHours = parseFloat(job.allotted_time_hours) || 0
      const totalActualHours = timeLogs.reduce((s, tl) => s + (parseFloat(tl.hours) || 0), 0)

      if (payrollCfg?.efficiency_bonus_enabled && allottedHours > 0 && totalActualHours < allottedHours) {
        const savedHours = allottedHours - totalActualHours
        const rate = payrollCfg.efficiency_bonus_rate || 25
        const companyCutPct = payrollCfg.company_bonus_cut_percent || 0
        const totalPool = savedHours * rate
        const companyShare = totalPool * (companyCutPct / 100)
        const crewBonus = totalPool - companyShare

        // Crew breakdown with weights
        const crewMemberIds = [...new Set(timeLogs.map(tl => tl.employee?.id || tl.employee_id))]
        const crewMembers = crewMemberIds.map(empId => {
          const tl = timeLogs.find(t => (t.employee?.id || t.employee_id) === empId)
          const skillLevel = tl?.employee?.skill_level || ''
          const found = skillLevels.find(s => s.name === skillLevel)
          const weight = found ? found.weight : 1
          return { name: tl?.employee?.name || 'Unknown', weight }
        })

        bonusData = { savedHours, rate, totalPool, companyShare, crewBonus, crewMembers }
      }

      const totalCosts = materialCost + laborCost + subCost + otherCost
      const crewBonusExpense = bonusData?.crewBonus || 0
      const totalCostsWithBonus = totalCosts + crewBonusExpense
      const totalRevenue = parseFloat(job.job_total) || 0
      const companyBonusBenefit = bonusData?.companyShare || 0
      const grossProfit = totalRevenue - totalCostsWithBonus
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

      setData({
        invoicedAmount,
        paidAmount,
        outstandingAR,
        materialCost,
        materialExpenses,
        materialPlaid,
        laborCost,
        laborLines,
        subCost,
        subExpenses,
        otherCost,
        otherExpenses,
        otherPlaid,
        receiptExpenses,
        totalCosts: totalCostsWithBonus,
        totalRevenue,
        grossProfit,
        profitMargin,
        bonusData,
      })
    } catch (err) {
      console.error('JobCostingModal fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getMarginColor = (margin) => {
    if (margin >= 20) return theme.success || '#22c55e'
    if (margin >= 10) return theme.warning || '#eab308'
    return theme.error || '#ef4444'
  }

  // Styles
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isMobile ? 0 : '24px',
  }

  const panelStyle = {
    backgroundColor: theme.bgCard || '#ffffff',
    color: theme.text || '#2c3530',
    width: isMobile ? '100%' : '100%',
    maxWidth: isMobile ? '100%' : '700px',
    height: isMobile ? '100%' : 'auto',
    maxHeight: isMobile ? '100%' : '90vh',
    borderRadius: isMobile ? 0 : '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.border || '#d6cdb8'}`,
    flexShrink: 0,
  }

  const closeButtonStyle = {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: theme.textMuted || '#7d8a7f',
    cursor: 'pointer',
  }

  const bodyStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  }

  const sectionStyle = {
    marginBottom: '24px',
  }

  const sectionHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    fontSize: '15px',
    fontWeight: 600,
    color: theme.text || '#2c3530',
  }

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    fontSize: '14px',
    borderBottom: `1px solid ${theme.border || '#d6cdb8'}22`,
  }

  const labelStyle = {
    color: theme.textSecondary || '#4d5a52',
  }

  const valueStyle = {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  }

  const subtotalRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0 4px',
    fontSize: '14px',
    fontWeight: 700,
    color: theme.text,
    borderTop: `1px solid ${theme.border || '#d6cdb8'}`,
    marginTop: '4px',
  }

  const summaryCardStyle = {
    backgroundColor: theme.bg || '#f7f5ef',
    borderRadius: '10px',
    padding: '16px',
    border: `1px solid ${theme.border || '#d6cdb8'}`,
  }

  const summaryRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: '14px',
  }

  const thumbnailStyle = {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    objectFit: 'cover',
    border: `1px solid ${theme.border || '#d6cdb8'}`,
    cursor: 'pointer',
  }

  const renderSection = (icon, title, items, subtotal, renderItem) => {
    const Icon = icon
    return (
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon size={18} color={theme.accent || '#5a6349'} />
          <span>{title}</span>
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: '13px', color: theme.textMuted, padding: '4px 0' }}>
            No {title.toLowerCase()} recorded
          </div>
        ) : (
          items.map(renderItem)
        )}
        <div style={subtotalRowStyle}>
          <span>Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <DollarSign size={20} color={theme.accent || '#5a6349'} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Job Costing</div>
              <div style={{ fontSize: '13px', color: theme.textMuted || '#7d8a7f' }}>
                {job.name || job.title || `Job #${String(job.id || '').slice(0, 8)}`}
              </div>
            </div>
          </div>
          <button style={closeButtonStyle} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px' }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} color={theme.accent} />
              <span style={{ color: theme.textMuted, fontSize: '14px' }}>Loading costing data...</span>
            </div>
          ) : data ? (
            <>
              {/* Revenue Section */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <TrendingUp size={18} color={theme.success || '#22c55e'} />
                  <span>Revenue</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Job Total</span>
                  <span style={valueStyle}>{fmt(data.totalRevenue)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Invoiced</span>
                  <span style={valueStyle}>{fmt(data.invoicedAmount)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Paid</span>
                  <span style={{ ...valueStyle, color: theme.success || '#22c55e' }}>{fmt(data.paidAmount)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Outstanding AR</span>
                  <span style={{ ...valueStyle, color: data.outstandingAR > 0 ? (theme.warning || '#eab308') : (theme.success || '#22c55e') }}>
                    {fmt(data.outstandingAR)}
                  </span>
                </div>
              </div>

              {/* Materials */}
              {renderSection(Package, 'Materials', [...data.materialExpenses, ...data.materialPlaid], data.materialCost, (item, idx) => (
                <div key={item.id || idx} style={rowStyle}>
                  <span style={{ ...labelStyle, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '12px' }}>
                    {item.description || item.name || item.merchant_name || 'Material'}
                  </span>
                  <span style={valueStyle}>{fmt(Math.abs(parseFloat(item.amount) || 0))}</span>
                </div>
              ))}

              {/* Labor */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <Clock size={18} color={theme.accent || '#5a6349'} />
                  <span>Labor</span>
                </div>
                {data.laborLines.length === 0 ? (
                  <div style={{ fontSize: '13px', color: theme.textMuted, padding: '4px 0' }}>
                    No labor recorded
                  </div>
                ) : (
                  data.laborLines.map((line, idx) => (
                    <div key={idx} style={rowStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={labelStyle}>{line.name}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>
                          {line.hours.toFixed(1)} hrs @ {fmt(line.rate)}/hr
                        </div>
                      </div>
                      <span style={valueStyle}>{fmt(line.cost)}</span>
                    </div>
                  ))
                )}
                <div style={subtotalRowStyle}>
                  <span>Subtotal</span>
                  <span>{fmt(data.laborCost)}</span>
                </div>
              </div>

              {/* Subcontractors */}
              {renderSection(Users, 'Subcontractors', data.subExpenses, data.subCost, (item, idx) => (
                <div key={item.id || idx} style={rowStyle}>
                  <span style={{ ...labelStyle, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '12px' }}>
                    {item.description || item.vendor || 'Subcontractor'}
                  </span>
                  <span style={valueStyle}>{fmt(parseFloat(item.amount) || 0)}</span>
                </div>
              ))}

              {/* Other Expenses */}
              {renderSection(Truck, 'Other Expenses', [...data.otherExpenses, ...data.otherPlaid], data.otherCost, (item, idx) => (
                <div key={item.id || idx} style={rowStyle}>
                  <div style={{ flex: 1, overflow: 'hidden', marginRight: '12px' }}>
                    <div style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description || item.name || item.merchant_name || 'Expense'}
                    </div>
                    {item.category && (
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{item.category}</div>
                    )}
                  </div>
                  <span style={valueStyle}>{fmt(Math.abs(parseFloat(item.amount) || 0))}</span>
                </div>
              ))}

              {/* Receipt Expenses */}
              {data.receiptExpenses.length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    <Receipt size={18} color={theme.accent || '#5a6349'} />
                    <span>Receipts</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {data.receiptExpenses.map((exp) => (
                      <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                        <img
                          src={exp.receipt_url}
                          alt="Receipt"
                          style={thumbnailStyle}
                          onClick={() => window.open(exp.receipt_url, '_blank')}
                        />
                        <div>
                          <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                            {exp.description || 'Receipt'}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{fmt(parseFloat(exp.amount) || 0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bonus Hours Impact */}
              {data.bonusData && (
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    <Zap size={18} color='#8b5cf6' />
                    <span>Bonus Hours Impact</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Hours Saved</span>
                    <span style={{ ...valueStyle, color: '#22c55e' }}>{data.bonusData.savedHours.toFixed(1)}h</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Total Pool ({data.bonusData.savedHours.toFixed(1)}h × {fmt(data.bonusData.rate)}/hr)</span>
                    <span style={valueStyle}>{fmt(data.bonusData.totalPool)}</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Company Retention</span>
                    <span style={{ ...valueStyle, color: '#22c55e' }}>{fmt(data.bonusData.companyShare)}</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Crew Bonus Expense</span>
                    <span style={{ ...valueStyle, color: theme.error || '#ef4444' }}>{fmt(data.bonusData.crewBonus)}</span>
                  </div>
                  {data.bonusData.crewMembers.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      {data.bonusData.crewMembers.map((m, idx) => {
                        const totalWeight = data.bonusData.crewMembers.filter(c => c.weight > 0).reduce((s, c) => s + c.weight, 0)
                        const share = m.weight > 0 && totalWeight > 0 ? data.bonusData.crewBonus * (m.weight / totalWeight) : 0
                        return (
                          <div key={idx} style={{ ...rowStyle, fontSize: '13px' }}>
                            <span style={{ color: theme.textMuted }}>
                              {m.name} {m.weight > 0 ? `(wt ${m.weight})` : '(no bonus)'}
                            </span>
                            <span style={{ fontWeight: 500, color: m.weight > 0 ? theme.text : theme.textMuted }}>
                              {m.weight > 0 ? fmt(share) : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div style={subtotalRowStyle}>
                    <span>Net Company Benefit</span>
                    <span style={{ color: '#22c55e' }}>{fmt(data.bonusData.companyShare)}</span>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={summaryCardStyle}>
                <div style={{ ...sectionHeaderStyle, marginBottom: '10px' }}>
                  <TrendingDown size={18} color={theme.accent || '#5a6349'} />
                  <span>P&L Summary</span>
                </div>
                <div style={summaryRowStyle}>
                  <span style={labelStyle}>Total Revenue</span>
                  <span style={{ ...valueStyle, color: theme.success || '#22c55e' }}>{fmt(data.totalRevenue)}</span>
                </div>
                <div style={summaryRowStyle}>
                  <span style={labelStyle}>Total Costs</span>
                  <span style={{ ...valueStyle, color: theme.error || '#ef4444' }}>{fmt(data.totalCosts)}</span>
                </div>
                <div style={{ ...summaryRowStyle, borderTop: `2px solid ${theme.border || '#d6cdb8'}`, marginTop: '6px', paddingTop: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>Gross Profit</span>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: getMarginColor(data.profitMargin) }}>
                    {fmt(data.grossProfit)}
                  </span>
                </div>
                <div style={{ ...summaryRowStyle, paddingTop: '4px' }}>
                  <span style={labelStyle}>Profit Margin</span>
                  <span style={{
                    fontWeight: 700,
                    fontSize: '16px',
                    color: getMarginColor(data.profitMargin),
                    backgroundColor: `${getMarginColor(data.profitMargin)}18`,
                    padding: '4px 10px',
                    borderRadius: '6px',
                  }}>
                    {data.profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted, fontSize: '14px' }}>
              Failed to load costing data
            </div>
          )}
        </div>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
