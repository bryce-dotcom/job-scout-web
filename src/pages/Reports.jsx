import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { isAdmin as checkAdmin, isManager as checkManager } from '../lib/accessControl'
import { toast } from '../lib/toast'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  BarChart3,
  TrendingUp,
  Briefcase,
  DollarSign,
  Users,
  Package,
  Truck,
  Calendar,
  Download,
  Printer,
  ChevronRight,
  ChevronDown,
  Database,
  Filter,
  Search,
  ArrowLeft,
  ArrowUpDown,
  Shield,
  ClipboardList,
  X,
  Loader2,
  Table2,
  Boxes
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#eab308',
  info: '#3b82f6'
}

// ── Available tables for custom reports ────────────────────────────
const REPORT_TABLES = [
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'leads', label: 'Leads', icon: TrendingUp },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'invoices', label: 'Invoices', icon: DollarSign },
  { id: 'payments', label: 'Payments', icon: DollarSign },
  { id: 'expenses', label: 'Expenses', icon: DollarSign },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'products_services', label: 'Products & Services', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'time_log', label: 'Time Logs', icon: Calendar },
  { id: 'time_clock', label: 'Time Clock', icon: Calendar },
  { id: 'quotes', label: 'Estimates', icon: ClipboardList },
  { id: 'quote_lines', label: 'Estimate Lines', icon: Table2 },
  { id: 'job_lines', label: 'Job Lines', icon: Table2 },
  { id: 'fleet', label: 'Fleet', icon: Truck },
  { id: 'fleet_maintenance', label: 'Fleet Maintenance', icon: Truck },
  { id: 'lighting_audits', label: 'Lighting Audits', icon: ClipboardList },
  { id: 'lead_payments', label: 'Deposits', icon: DollarSign },
  { id: 'sales_pipeline', label: 'Sales Pipeline', icon: TrendingUp },
  { id: 'payroll_runs', label: 'Payroll Runs', icon: DollarSign },
  { id: 'paystubs', label: 'Paystubs', icon: DollarSign }
]

const reportTypes = [
  { id: 'sales', label: 'Sales Report', icon: TrendingUp, desc: 'Leads, conversions, pipeline value', access: 'manager' },
  { id: 'jobs', label: 'Jobs Report', icon: Briefcase, desc: 'Job status, revenue, time tracking', access: 'manager' },
  { id: 'financial', label: 'Financial Report', icon: DollarSign, desc: 'Invoices, payments, revenue', access: 'admin' },
  { id: 'employee', label: 'Employee Report', icon: Users, desc: 'Hours logged, jobs completed', access: 'manager' },
  { id: 'inventory', label: 'Inventory Report', icon: Package, desc: 'Stock levels, low stock items', access: 'manager' },
  { id: 'fleet', label: 'Fleet Report', icon: Truck, desc: 'Asset status, maintenance costs', access: 'manager' },
  { id: 'products-needed', label: 'Products Needed', icon: ClipboardList, desc: 'Materials needed for upcoming jobs', access: 'manager' },
  { id: 'custom', label: 'Custom Report', icon: Database, desc: 'Build a report from any data table', access: 'admin' }
]

export default function Reports() {
  const { reportType } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const leads = useStore((state) => state.leads)
  const jobs = useStore((state) => state.jobs)
  const invoices = useStore((state) => state.invoices)
  const payments = useStore((state) => state.payments)
  const employees = useStore((state) => state.employees)
  const timeLogs = useStore((state) => state.timeLogs)
  const inventory = useStore((state) => state.inventory)
  const fleet = useStore((state) => state.fleet)
  const fleetMaintenance = useStore((state) => state.fleetMaintenance)
  const salesPipeline = useStore((state) => state.salesPipeline)
  const expenses = useStore((state) => state.expenses)
  const leadPayments = useStore((state) => state.leadPayments)
  const products = useStore((state) => state.products)

  const isAdmin = checkAdmin(user)
  const isManager = checkManager(user)

  const [timeClockEntries, setTimeClockEntries] = useState([])
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) navigate('/')
  }, [companyId, navigate])

  // Fetch time_clock entries directly (paginated) for accurate employee hours reporting
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    const fetchAll = async () => {
      const all = []
      const pageSize = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('time_clock')
          .select('id, employee_id, clock_in, clock_out, lunch_start, lunch_end, total_hours, job_id')
          .eq('company_id', companyId)
          .gte('clock_in', dateRange.start)
          .lte('clock_in', dateRange.end + 'T23:59:59')
          .order('clock_in', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error || !data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      if (!cancelled) setTimeClockEntries(all)
    }
    fetchAll()
    return () => { cancelled = true }
  }, [companyId, dateRange.start, dateRange.end])

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
  const formatPercent = (val) => `${(val * 100).toFixed(1)}%`

  const filterByDate = (items, dateField) => {
    return items.filter(item => {
      const date = item[dateField]
      if (!date) return false
      return date >= dateRange.start && date <= dateRange.end
    })
  }

  // ── CSV Export ─────────────────────────────────────────────────────
  const exportCSV = (headers, rows, filename) => {
    const escape = (val) => {
      const str = String(val ?? '')
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${dateRange.start}_${dateRange.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  // ── Report Data Computations ──────────────────────────────────────

  // salesReportData moved to standalone SalesReport component

  // jobsReportData moved to standalone JobsReport component

  const financialReportData = useMemo(() => {
    const filteredInvoices = filterByDate(invoices, 'created_at')
    const filteredPayments = filterByDate(payments, 'date')
    const filteredExpenses = filterByDate(expenses || [], 'date')
    const filteredDeposits = filterByDate(leadPayments || [], 'date_created')
    const totalInvoiced = filteredInvoices.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
    const totalCollected = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    const outstanding = totalInvoiced - totalCollected
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
    const totalDeposits = filteredDeposits.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
    const netIncome = totalDeposits - totalExpenses
    const revenueByMonth = {}
    filteredPayments.forEach(p => { const m = p.date?.substring(0, 7); if (m) revenueByMonth[m] = (revenueByMonth[m] || 0) + (parseFloat(p.amount) || 0) })
    const expensesByCategory = {}
    filteredExpenses.forEach(e => { const c = e.category || 'Uncategorized'; expensesByCategory[c] = (expensesByCategory[c] || 0) + (parseFloat(e.amount) || 0) })
    const customerRevenue = {}
    filteredPayments.forEach(p => {
      const inv = invoices.find(i => i.id === p.invoice_id)
      const name = inv?.customer?.name || 'Unknown'
      customerRevenue[name] = (customerRevenue[name] || 0) + (parseFloat(p.amount) || 0)
    })
    const topCustomers = Object.entries(customerRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { totalInvoiced, totalCollected, outstanding, totalExpenses, totalDeposits, netIncome, revenueByMonth, expensesByCategory, topCustomers }
  }, [invoices, payments, expenses, leadPayments, dateRange])

  const employeeReportData = useMemo(() => {
    const empNameById = {}
    employees.forEach(e => { empNameById[e.id] = e.name })
    const hoursByEmployee = {}
    timeClockEntries.forEach(entry => {
      const empId = entry.employee_id
      const empName = empNameById[empId] || 'Unknown'
      if (!hoursByEmployee[empId]) hoursByEmployee[empId] = { name: empName, hours: 0, jobs: new Set() }
      let h = 0
      if (entry.total_hours) {
        h = entry.total_hours
      } else if (entry.clock_in && entry.clock_out) {
        h = (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60)
        if (entry.lunch_start && entry.lunch_end) {
          h -= (new Date(entry.lunch_end) - new Date(entry.lunch_start)) / (1000 * 60 * 60)
        }
        h = Math.max(0, h)
      }
      hoursByEmployee[empId].hours += h
      if (entry.job_id) hoursByEmployee[empId].jobs.add(entry.job_id)
    })
    const employeeStats = Object.values(hoursByEmployee).map(e => ({ name: e.name, hours: e.hours.toFixed(1), jobCount: e.jobs.size })).sort((a, b) => parseFloat(b.hours) - parseFloat(a.hours))
    const totalHours = Object.values(hoursByEmployee).reduce((sum, e) => sum + e.hours, 0)
    return { employeeStats, totalHours }
  }, [timeClockEntries, employees])

  const inventoryReportData = useMemo(() => {
    const totalItems = inventory.length
    const lowStock = inventory.filter(i => i.quantity < (i.min_quantity || 10))
    const totalValue = inventory.reduce((sum, i) => sum + (i.quantity * (i.product?.unit_price || i.unit_cost || 0)), 0)
    const byLocation = {}
    inventory.forEach(i => { byLocation[i.location || 'Unassigned'] = (byLocation[i.location || 'Unassigned'] || 0) + 1 })
    return { totalItems, lowStock, totalValue, byLocation }
  }, [inventory])

  const fleetReportData = useMemo(() => {
    const totalAssets = fleet.length
    const byStatus = {}
    fleet.forEach(f => { byStatus[f.status] = (byStatus[f.status] || 0) + 1 })
    const maintenanceDue = fleet.filter(f => f.next_pm_due && new Date(f.next_pm_due) <= new Date())
    const filteredMaintenance = filterByDate(fleetMaintenance, 'date')
    const maintenanceCost = filteredMaintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0)
    return { totalAssets, byStatus, maintenanceDue, maintenanceCost }
  }, [fleet, fleetMaintenance, dateRange])

  // ── Shared UI Components ──────────────────────────────────────────

  const StatCard = ({ label, value, subvalue, color }) => (
    <div style={{ padding: '20px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: '28px', fontWeight: '700', color: color || theme.text, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '13px', color: theme.textMuted }}>{label}</div>
      {subvalue && <div style={{ fontSize: '12px', color: theme.accent, marginTop: '4px' }}>{subvalue}</div>}
    </div>
  )

  const BreakdownTable = ({ title, entries, valueFormatter, valueColor }) => (
    <div>
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>{title}</h3>
      <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No data for period</div>
        ) : entries.map(([key, val], idx) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < entries.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
            <span style={{ fontSize: '14px', color: theme.textSecondary }}>{key}</span>
            <span style={{ fontSize: '14px', fontWeight: '600', color: valueColor || theme.text }}>{valueFormatter ? valueFormatter(val) : val}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const inputStyle = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bgCard,
    color: theme.text,
    fontSize: '13px'
  }

  const pillStyle = (active) => ({
    padding: '6px 14px',
    borderRadius: '20px',
    border: `1px solid ${active ? theme.accent : theme.border}`,
    backgroundColor: active ? theme.accent : 'transparent',
    color: active ? '#fff' : theme.textSecondary,
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  })

  // ── Preset Report Renderers ───────────────────────────────────────

  // Sales report is now a standalone component (SalesReport) below

  // Jobs report is now a standalone component (JobsReport) below

  const renderFinancialReport = () => {
    const d = financialReportData
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <StatCard label="Total Invoiced" value={formatCurrency(d.totalInvoiced)} />
          <StatCard label="Total Collected" value={formatCurrency(d.totalCollected)} color="#4a7c59" />
          <StatCard label="Outstanding" value={formatCurrency(d.outstanding)} color={d.outstanding > 0 ? '#c25a5a' : theme.text} />
          <StatCard label="Total Deposits" value={formatCurrency(d.totalDeposits)} />
          <StatCard label="Total Expenses" value={formatCurrency(d.totalExpenses)} color="#c25a5a" />
          <StatCard label="Net Income" value={formatCurrency(d.netIncome)} color={d.netIncome >= 0 ? '#4a7c59' : '#c25a5a'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '24px' }}>
          <BreakdownTable title="Revenue by Month" entries={Object.entries(d.revenueByMonth).sort((a, b) => a[0].localeCompare(b[0]))} valueFormatter={formatCurrency} valueColor="#4a7c59" />
          <BreakdownTable title="Expenses by Category" entries={Object.entries(d.expensesByCategory).sort((a, b) => b[1] - a[1])} valueFormatter={formatCurrency} valueColor="#c25a5a" />
          <BreakdownTable title="Top Customers" entries={d.topCustomers.map(([n, a], i) => [`${i + 1}. ${n}`, a])} valueFormatter={formatCurrency} valueColor="#4a7c59" />
        </div>
      </div>
    )
  }

  const renderEmployeeReport = () => {
    const d = employeeReportData
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <StatCard label="Total Hours Logged" value={d.totalHours.toFixed(1)} subvalue="hours" />
          <StatCard label="Active Employees" value={employees.length} />
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Hours by Employee</h3>
        <div style={{ backgroundColor: theme.bg, borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Employee</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Hours</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Jobs Worked</th>
              </tr>
            </thead>
            <tbody>
              {d.employeeStats.map(emp => (
                <tr key={emp.name} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.text }}>{emp.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: theme.text, textAlign: 'right' }}>{emp.hours}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.textSecondary, textAlign: 'right' }}>{emp.jobCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderInventoryReport = () => {
    const d = inventoryReportData
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <StatCard label="Total Items" value={d.totalItems} />
          <StatCard label="Low Stock Items" value={d.lowStock.length} color={d.lowStock.length > 0 ? '#c25a5a' : theme.text} />
          <StatCard label="Total Inventory Value" value={formatCurrency(d.totalValue)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px' }}>
          <BreakdownTable title="Items by Location" entries={Object.entries(d.byLocation)} />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#c25a5a', marginBottom: '12px' }}>Low Stock Items</h3>
            <div style={{ backgroundColor: 'rgba(194,90,90,0.05)', borderRadius: '8px', padding: '16px' }}>
              {d.lowStock.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No low stock items</div>
              ) : d.lowStock.slice(0, 10).map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: '14px', color: theme.text }}>{item.name}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#c25a5a' }}>{item.quantity} left</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderFleetReport = () => {
    const d = fleetReportData
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <StatCard label="Total Assets" value={d.totalAssets} />
          <StatCard label="Maintenance Due" value={d.maintenanceDue.length} color={d.maintenanceDue.length > 0 ? '#d4940a' : theme.text} />
          <StatCard label="Maintenance Cost" value={formatCurrency(d.maintenanceCost)} subvalue="this period" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px' }}>
          <BreakdownTable title="Assets by Status" entries={Object.entries(d.byStatus)} />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#d4940a', marginBottom: '12px' }}>Maintenance Due</h3>
            <div style={{ backgroundColor: 'rgba(244,185,66,0.1)', borderRadius: '8px', padding: '16px' }}>
              {d.maintenanceDue.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No maintenance due</div>
              ) : d.maintenanceDue.slice(0, 10).map(asset => (
                <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: '14px', color: theme.text }}>{asset.name}</span>
                  <span style={{ fontSize: '12px', color: '#d4940a' }}>Due: {asset.next_pm_due}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderReport = () => {
    switch (reportType) {
      case 'sales': return <SalesReport theme={theme} companyId={companyId} leads={leads} employees={employees} salesPipeline={salesPipeline} formatCurrency={formatCurrency} inputStyle={inputStyle} pillStyle={pillStyle} exportCSV={exportCSV} />
      case 'jobs': return <JobsReport theme={theme} companyId={companyId} jobs={jobs} employees={employees} formatCurrency={formatCurrency} inputStyle={inputStyle} pillStyle={pillStyle} exportCSV={exportCSV} />
      case 'financial': return renderFinancialReport()
      case 'employee': return renderEmployeeReport()
      case 'inventory': return renderInventoryReport()
      case 'fleet': return renderFleetReport()
      case 'products-needed': return <ProductsNeededReport theme={theme} companyId={companyId} jobs={jobs} products={products} formatCurrency={formatCurrency} inputStyle={inputStyle} pillStyle={pillStyle} exportCSV={exportCSV} />
      case 'custom': return <CustomReport theme={theme} companyId={companyId} inputStyle={inputStyle} exportCSV={exportCSV} />
      default: return null
    }
  }

  // Handle export for preset reports
  const handleExport = () => {
    switch (reportType) {
      case 'sales':
        toast.info('Use the export button within the report')
        break
      case 'jobs':
        // Export handled inside JobsReport component
        toast.info('Use the export button within the report')
        break
      case 'financial': {
        const d = financialReportData
        exportCSV(
          ['Metric', 'Amount'],
          [['Total Invoiced', d.totalInvoiced], ['Total Collected', d.totalCollected], ['Outstanding', d.outstanding], ['Expenses', d.totalExpenses], ['Net Income', d.netIncome]],
          'financial_report'
        )
        break
      }
      case 'employee': {
        const d = employeeReportData
        exportCSV(['Employee', 'Hours', 'Jobs'], d.employeeStats.map(e => [e.name, e.hours, e.jobCount]), 'employee_report')
        break
      }
      default:
        toast.info('Use the export button within the report')
    }
  }

  const handlePrint = () => window.print()

  // ── Filter visible report types by access level ───────────────────
  const visibleReports = reportTypes.filter(r => {
    if (r.access === 'admin') return isAdmin
    if (r.access === 'manager') return isManager
    return true
  })

  // ── Report Selector View ──────────────────────────────────────────
  if (!reportType) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <BarChart3 size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>Reports</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {visibleReports.map(report => (
            <div
              key={report.id}
              onClick={() => navigate(`/reports/${report.id}`)}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                padding: '24px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {report.access === 'admin' && (
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <Shield size={14} style={{ color: theme.accent, opacity: 0.5 }} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '10px',
                  backgroundColor: report.id === 'custom' ? 'rgba(90,99,73,0.2)' : theme.accentBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <report.icon size={22} style={{ color: theme.accent }} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>{report.label}</h3>
              </div>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '16px' }}>{report.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: theme.accent, fontSize: '13px', fontWeight: '500' }}>
                {report.id === 'custom' ? 'Build Report' : 'View Report'} <ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Report Detail View ────────────────────────────────────────────
  const currentReport = reportTypes.find(r => r.id === reportType)
  const showDateRange = !['custom', 'products-needed'].includes(reportType)

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentReport && <currentReport.icon size={isMobile ? 24 : 28} style={{ color: theme.accent }} />}
          <div>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>{currentReport?.label || 'Report'}</h1>
            <button onClick={() => navigate('/reports')} style={{ padding: 0, backgroundColor: 'transparent', border: 'none', color: theme.accent, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={14} /> Back to Reports
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {showDateRange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Calendar size={16} style={{ color: theme.textMuted }} />
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} style={inputStyle} />
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>to</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} style={inputStyle} />
              {/* Quick-select date ranges */}
              {[
                { label: 'This Week', fn: () => { const now = new Date(); const d = now.getDay(); const mon = new Date(now); mon.setDate(now.getDate() - (d === 0 ? 6 : d - 1)); return { start: mon.toISOString().split('T')[0], end: now.toISOString().split('T')[0] } } },
                { label: '30d', fn: () => { const now = new Date(); const ago = new Date(now); ago.setDate(now.getDate() - 30); return { start: ago.toISOString().split('T')[0], end: now.toISOString().split('T')[0] } } },
                { label: '90d', fn: () => { const now = new Date(); const ago = new Date(now); ago.setDate(now.getDate() - 90); return { start: ago.toISOString().split('T')[0], end: now.toISOString().split('T')[0] } } },
                { label: 'This Year', fn: () => { const now = new Date(); return { start: `${now.getFullYear()}-01-01`, end: now.toISOString().split('T')[0] } } },
              ].map(q => (
                <button key={q.label} onClick={() => setDateRange(q.fn())} style={{
                  padding: '4px 8px', fontSize: '11px', background: theme.accentBg, color: theme.accent,
                  border: `1px solid ${theme.border}`, borderRadius: '12px', cursor: 'pointer', fontWeight: '500'
                }}>{q.label}</button>
              ))}
            </div>
          )}
          {showDateRange && (
            <>
              <button onClick={handleExport} style={{ padding: '8px 14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500' }}>
                <Download size={16} /> Export
              </button>
              <button onClick={handlePrint} style={{ padding: '8px 14px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <Printer size={16} /> Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* Report Content */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: isMobile ? '16px' : '24px', overflowX: 'auto' }}>
        {renderReport()}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// PRODUCTS NEEDED REPORT
// ═══════════════════════════════════════════════════════════════════

const FALLBACK_STATUSES = [
  { id: 'Chillin', name: 'Chillin' },
  { id: 'Scheduled', name: 'Scheduled' },
  { id: 'In Progress', name: 'In Progress' },
  { id: 'On Hold', name: 'On Hold' },
  { id: 'Complete', name: 'Complete' }
]

// ── Sales Report Component ────────────────────────────────────────
function SalesReport({ theme, companyId, leads, employees, salesPipeline, formatCurrency, inputStyle, pillStyle, exportCSV }) {
  const navigate = useNavigate()
  const quotes = useStore((state) => state.quotes)
  const [statusFilters, setStatusFilters] = useState([])
  const [buFilter, setBuFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedLeads, setExpandedLeads] = useState(new Set())

  const allStatuses = useMemo(() => {
    const s = new Set()
    leads.forEach(l => { if (l.status) s.add(l.status) })
    return [...s].sort()
  }, [leads])

  const allSources = useMemo(() => {
    const s = new Set()
    leads.forEach(l => { if (l.lead_source) s.add(l.lead_source) })
    return [...s].sort()
  }, [leads])

  useEffect(() => {
    if (allStatuses.length > 0 && statusFilters.length === 0) {
      setStatusFilters([...allStatuses])
    }
  }, [allStatuses])

  const businessUnits = [...new Set(leads.map(l => l.business_unit).filter(Boolean))]

  // Build quote amount map: leadId -> quote_amount
  const quoteAmountMap = useMemo(() => {
    const map = {}
    ;(quotes || []).forEach(q => {
      if (q.lead_id) map[q.lead_id] = (map[q.lead_id] || 0) + (parseFloat(q.quote_amount) || 0)
    })
    return map
  }, [quotes])

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (statusFilters.length > 0 && !statusFilters.includes(l.status)) return false
      if (buFilter && l.business_unit !== buFilter) return false
      if (sourceFilter && l.lead_source !== sourceFilter) return false
      if (dateStart && (l.created_at || l.created_date || '') < dateStart) return false
      if (dateEnd && (l.created_at || l.created_date || '') > dateEnd + 'T23:59:59') return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const name = (l.customer_name || l.business_name || l.lead_id || '').toLowerCase()
        const addr = (l.address || '').toLowerCase()
        const email = (l.email || '').toLowerCase()
        if (!name.includes(q) && !addr.includes(q) && !email.includes(q) && !(l.lead_id || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [leads, statusFilters, buFilter, sourceFilter, dateStart, dateEnd, searchTerm])

  const enrichedLeads = useMemo(() => {
    return filtered.map(l => {
      const quoteAmount = quoteAmountMap[l.id] || 0
      const salesperson = employees.find(e => e.id === l.salesperson_id)
      const setter = employees.find(e => e.id === l.setter_id)
      const daysSinceCreated = l.created_at ? Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000) : null
      const daysSinceContact = l.last_contact_at ? Math.floor((Date.now() - new Date(l.last_contact_at).getTime()) / 86400000) : null
      return {
        ...l,
        quoteAmount,
        salespersonName: salesperson?.name || l.salesperson || '',
        setterName: setter?.name || '',
        daysSinceCreated,
        daysSinceContact,
        contactAttempts: l.contact_attempts || 0
      }
    })
  }, [filtered, quoteAmountMap, employees])

  const sortedLeads = useMemo(() => {
    const arr = [...enrichedLeads]
    const dir = sortDir === 'desc' ? -1 : 1
    arr.sort((a, b) => {
      switch (sortField) {
        case 'created_at': return dir * ((a.created_at || '').localeCompare(b.created_at || ''))
        case 'customer': return dir * ((a.customer_name || '').localeCompare(b.customer_name || ''))
        case 'amount': return dir * (a.quoteAmount - b.quoteAmount)
        case 'source': return dir * ((a.lead_source || '').localeCompare(b.lead_source || ''))
        case 'salesperson': return dir * ((a.salespersonName || '').localeCompare(b.salespersonName || ''))
        case 'age': return dir * ((a.daysSinceCreated || 0) - (b.daysSinceCreated || 0))
        default: return 0
      }
    })
    return arr
  }, [enrichedLeads, sortField, sortDir])

  const toggleStatus = (s) => setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleExpand = (id) => setExpandedLeads(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  // Summary stats
  const totalLeads = enrichedLeads.length
  const convertedLeads = enrichedLeads.filter(l => ['Won', 'Converted', 'Job Scheduled', 'Completed'].includes(l.status)).length
  const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0
  const totalQuoteValue = enrichedLeads.reduce((s, l) => s + l.quoteAmount, 0)
  const pipelineValue = salesPipeline.filter(d => !['Won', 'Lost', 'Completed'].includes(d.stage)).reduce((sum, d) => sum + (parseFloat(d.quote_amount) || 0), 0)
  const avgDealSize = convertedLeads > 0 ? totalQuoteValue / convertedLeads : 0

  const SortHeader = ({ field, children, align }) => (
    <th
      onClick={() => { if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('desc') } }}
      style={{ padding: '10px 12px', textAlign: align || 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {children}
        {sortField === field && <ArrowUpDown size={12} style={{ opacity: 0.6 }} />}
      </span>
    </th>
  )

  const handleExport = () => {
    exportCSV(
      ['Lead ID', 'Customer', 'Business', 'Status', 'Source', 'BU', 'Created', 'Estimate Amount', 'Salesperson', 'Setter', 'Phone', 'Email', 'Address', 'Contact Attempts', 'Days Since Created'],
      sortedLeads.map(l => [
        l.lead_id || '', l.customer_name || '', l.business_name || '', l.status || '', l.lead_source || '',
        l.business_unit || '', (l.created_at || l.created_date || '').split('T')[0] || '',
        l.quoteAmount.toFixed(2), l.salespersonName, l.setterName,
        l.phone || '', l.email || '', l.address || '', l.contactAttempts, l.daysSinceCreated ?? ''
      ]),
      'sales_report'
    )
  }

  const statusColor = (status) => {
    const s = (status || '').toLowerCase()
    if (['won', 'converted', 'job scheduled', 'completed'].includes(s)) return { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' }
    if (['lost', 'cancelled', 'dead'].includes(s)) return { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' }
    if (['new', 'new lead'].includes(s)) return { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' }
    if (['quote sent', 'proposal sent'].includes(s)) return { bg: 'rgba(168,85,247,0.12)', text: '#a855f7' }
    return { bg: theme.accentBg, text: theme.accent }
  }

  const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return '—' } }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {allStatuses.map(s => (
              <button key={s} onClick={() => toggleStatus(s)} style={{ ...pillStyle(statusFilters.includes(s)), border: 'none' }}>{s}</button>
            ))}
          </div>
        </div>

        {allSources.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
              <option value="">All Sources</option>
              {allSources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {businessUnits.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Unit</div>
            <select value={buFilter} onChange={(e) => setBuFilter(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
              <option value="">All Units</option>
              {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
            </select>
          </div>
        )}

        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} style={inputStyle} />
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>to</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} style={inputStyle} />
            {(dateStart || dateEnd) && (
              <button onClick={() => { setDateStart(''); setDateEnd('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}><X size={14} /></button>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Customer, lead ID..."
              style={{ ...inputStyle, paddingLeft: '28px', minWidth: '160px' }}
            />
          </div>
        </div>

        <button onClick={handleExport} style={{ ...pillStyle(false), display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Leads</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{totalLeads}</div>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>{convertedLeads} converted</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conversion Rate</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: conversionRate >= 30 ? '#22c55e' : conversionRate >= 15 ? '#eab308' : '#ef4444' }}>{conversionRate.toFixed(1)}%</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estimate Value</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{formatCurrency(totalQuoteValue)}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pipeline</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>{formatCurrency(pipelineValue)}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Deal</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{formatCurrency(avgDealSize)}</div>
        </div>
      </div>

      {/* Leads Table */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{ width: '24px', padding: '10px 6px 10px 14px' }}></th>
              <SortHeader field="created_at" align="left">Date</SortHeader>
              <SortHeader field="customer" align="left">Lead / Customer</SortHeader>
              <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textAlign: 'left' }}>Status</th>
              <SortHeader field="source" align="left">Source</SortHeader>
              <SortHeader field="amount">Estimate $</SortHeader>
              <SortHeader field="salesperson" align="left">Salesperson</SortHeader>
              <SortHeader field="age">Age</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sortedLeads.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No leads match filters</td></tr>
            )}
            {sortedLeads.map(l => {
              const isExpanded = expandedLeads.has(l.id)
              const sc = statusColor(l.status)
              return (
                <Fragment key={l.id}>
                  <tr
                    onClick={() => toggleExpand(l.id)}
                    style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', backgroundColor: isExpanded ? theme.accentBg : 'transparent' }}
                    onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = theme.bgCardHover }}
                    onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <td style={{ padding: '10px 6px 10px 14px', color: theme.textMuted }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                      {fmtDate(l.created_at || l.created_date)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{l.customer_name || l.business_name || l.lead_id || '—'}</div>
                      {l.business_name && l.customer_name && <div style={{ fontSize: '11px', color: theme.textMuted }}>{l.business_name}</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: sc.bg, color: sc.text
                      }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: theme.textSecondary }}>
                      {l.lead_source || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: l.quoteAmount > 0 ? '600' : '400', color: l.quoteAmount > 0 ? theme.text : theme.textMuted }}>
                      {l.quoteAmount > 0 ? formatCurrency(l.quoteAmount) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: theme.textSecondary }}>
                      {l.salespersonName || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px' }}>
                      <span style={{ color: (l.daysSinceCreated || 0) > 30 ? '#ef4444' : (l.daysSinceCreated || 0) > 14 ? '#eab308' : theme.textSecondary }}>
                        {l.daysSinceCreated != null ? `${l.daysSinceCreated}d` : '—'}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <div style={{ padding: '16px 20px 16px 44px', backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Contact Info</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px' }}>
                                {l.phone && <div><strong style={{ color: theme.textSecondary }}>Phone:</strong> <span style={{ color: theme.text }}>{l.phone}</span></div>}
                                {l.email && <div><strong style={{ color: theme.textSecondary }}>Email:</strong> <span style={{ color: theme.text }}>{l.email}</span></div>}
                                {l.address && <div><strong style={{ color: theme.textSecondary }}>Address:</strong> <span style={{ color: theme.text }}>{l.address}</span></div>}
                                {l.business_unit && <div><strong style={{ color: theme.textSecondary }}>BU:</strong> <span style={{ color: theme.text }}>{l.business_unit}</span></div>}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); navigate(`/leads/${l.id}`) }} style={{ marginTop: '8px', fontSize: '12px', color: theme.accent, background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
                                Open Lead
                              </button>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Sales Activity</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Salesperson</span><span style={{ fontWeight: '500' }}>{l.salespersonName || '—'}</span></div>
                                {l.setterName && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Setter</span><span>{l.setterName}</span></div>}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Contact Attempts</span><span>{l.contactAttempts}</span></div>
                                {l.last_contact_at && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Last Contact</span><span>{fmtDate(l.last_contact_at)} ({l.daysSinceContact}d ago)</span></div>}
                                {l.appointment_time && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Appointment</span><span>{fmtDate(l.appointment_time)}</span></div>}
                                {l.callback_date && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Callback</span><span>{fmtDate(l.callback_date)}</span></div>}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Deal Info</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Estimate Value</span><span style={{ fontWeight: '600' }}>{l.quoteAmount > 0 ? formatCurrency(l.quoteAmount) : '—'}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Estimate Generated</span><span>{l.quote_generated ? 'Yes' : 'No'}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Service Type</span><span>{l.service_type || '—'}</span></div>
                                {l.converted_at && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#22c55e' }}>Converted</span><span style={{ color: '#22c55e' }}>{fmtDate(l.converted_at)}</span></div>}
                                {l.notes && <div style={{ marginTop: '4px', padding: '6px 8px', backgroundColor: theme.bgCard, borderRadius: '6px', fontSize: '11px', color: theme.textSecondary }}>{l.notes}</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Jobs Report Component ─────────────────────────────────────────
function JobsReport({ theme, companyId, jobs, employees, formatCurrency, inputStyle, pillStyle, exportCSV }) {
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [jobLines, setJobLines] = useState([])
  const [statusFilters, setStatusFilters] = useState([])
  const [buFilter, setBuFilter] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState('start_date')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedJobs, setExpandedJobs] = useState(new Set())

  const allStatuses = useMemo(() => {
    if (storeJobStatuses && storeJobStatuses.length > 0) {
      return storeJobStatuses.map(s => typeof s === 'string' ? s : (s.id || s.name))
    }
    return FALLBACK_STATUSES.map(s => s.id)
  }, [storeJobStatuses])

  useEffect(() => {
    if (allStatuses.length > 0 && statusFilters.length === 0) {
      setStatusFilters([...allStatuses]) // start with all selected
    }
  }, [allStatuses])

  const businessUnits = [...new Set(jobs.map(j => j.business_unit).filter(Boolean))]

  // Fetch job_lines for costing data
  useEffect(() => {
    if (!companyId) return
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('job_lines')
        .select('job_id, item_id, quantity, price, item:products_services(id, name, cost, unit_price)')
        .eq('company_id', companyId)
        .limit(20000)
      setJobLines(data || [])
      setLoading(false)
    }
    load()
  }, [companyId])

  // Build job costing map: jobId -> { materialCost, revenue, lineItems }
  const jobCostingMap = useMemo(() => {
    const map = {}
    jobLines.forEach(line => {
      const jid = line.job_id
      if (!map[jid]) map[jid] = { materialCost: 0, revenue: 0, items: [] }
      const qty = parseFloat(line.quantity) || 1
      const cost = parseFloat(line.item?.cost) || 0
      const price = parseFloat(line.price) || parseFloat(line.item?.unit_price) || 0
      map[jid].materialCost += cost * qty
      map[jid].revenue += price * qty
      map[jid].items.push({
        name: line.item?.name || 'Item',
        qty,
        cost: cost * qty,
        price: price * qty
      })
    })
    return map
  }, [jobLines])

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      if (statusFilters.length > 0 && !statusFilters.includes(j.status)) return false
      if (buFilter && j.business_unit !== buFilter) return false
      if (dateStart && j.start_date && j.start_date < dateStart) return false
      if (dateEnd && j.start_date && j.start_date > dateEnd + 'T23:59:59') return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const name = (j.customer_name || j.job_title || j.job_id || '').toLowerCase()
        const addr = (j.job_address || j.address || '').toLowerCase()
        if (!name.includes(q) && !addr.includes(q) && !(j.job_id || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [jobs, statusFilters, buFilter, dateStart, dateEnd, searchTerm])

  const enrichedJobs = useMemo(() => {
    return filtered.map(j => {
      const costing = jobCostingMap[j.id] || { materialCost: 0, revenue: 0, items: [] }
      const revenue = parseFloat(j.job_total) || costing.revenue
      const materialCost = costing.materialCost
      const sundry = materialCost * 0.03
      const budget = materialCost + sundry
      const expenseAmount = parseFloat(j.expense_amount) || 0
      const totalCost = materialCost + expenseAmount
      const incentive = parseFloat(j.utility_incentive) || 0
      const discount = parseFloat(j.discount) || 0
      const profit = revenue - totalCost - discount
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0
      const allottedHours = parseFloat(j.allotted_time_hours) || parseFloat(j.calculated_allotted_time) || 0
      const trackedHours = parseFloat(j.time_tracked) || 0
      const timeEfficiency = allottedHours > 0 ? trackedHours / allottedHours : 0
      const salesperson = employees.find(e => e.id === j.salesperson_id)

      return {
        ...j,
        revenue,
        materialCost,
        sundry,
        budget,
        expenseAmount,
        totalCost,
        incentive,
        discount,
        profit,
        margin,
        allottedHours,
        trackedHours,
        timeEfficiency,
        salesperson: salesperson?.name || '',
        lineItems: costing.items
      }
    })
  }, [filtered, jobCostingMap, employees])

  // Sorted
  const sortedJobs = useMemo(() => {
    const arr = [...enrichedJobs]
    const dir = sortDir === 'desc' ? -1 : 1
    arr.sort((a, b) => {
      switch (sortField) {
        case 'start_date': return dir * ((a.start_date || '').localeCompare(b.start_date || ''))
        case 'revenue': return dir * (a.revenue - b.revenue)
        case 'cost': return dir * (a.totalCost - b.totalCost)
        case 'profit': return dir * (a.profit - b.profit)
        case 'margin': return dir * (a.margin - b.margin)
        case 'customer': return dir * ((a.customer_name || '').localeCompare(b.customer_name || ''))
        case 'time': return dir * (a.trackedHours - b.trackedHours)
        default: return 0
      }
    })
    return arr
  }, [enrichedJobs, sortField, sortDir])

  const toggleStatus = (s) => setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleExpand = (id) => setExpandedJobs(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  // Summary stats
  const totalRevenue = enrichedJobs.reduce((s, j) => s + j.revenue, 0)
  const totalMaterialCost = enrichedJobs.reduce((s, j) => s + j.materialCost, 0)
  const totalProfit = enrichedJobs.reduce((s, j) => s + j.profit, 0)
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const totalAllotted = enrichedJobs.reduce((s, j) => s + j.allottedHours, 0)
  const totalTracked = enrichedJobs.reduce((s, j) => s + j.trackedHours, 0)
  const completedJobs = enrichedJobs.filter(j => (j.status || '').toLowerCase().includes('complete')).length

  const SortHeader = ({ field, children, align }) => (
    <th
      onClick={() => { if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('desc') } }}
      style={{ padding: '10px 12px', textAlign: align || 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {children}
        {sortField === field && <ArrowUpDown size={12} style={{ opacity: 0.6 }} />}
      </span>
    </th>
  )

  const handleExport = () => {
    exportCSV(
      ['Job ID', 'Title', 'Customer', 'Status', 'BU', 'Start Date', 'Revenue', 'Material Cost', 'Expenses', 'Total Cost', 'Profit', 'Margin %', 'Incentive', 'Discount', 'Allotted Hrs', 'Tracked Hrs', 'Salesperson'],
      sortedJobs.map(j => [
        j.job_id || '', j.job_title || '', j.customer_name || '', j.status || '', j.business_unit || '',
        j.start_date?.split('T')[0] || '', j.revenue.toFixed(2), j.materialCost.toFixed(2), j.expenseAmount.toFixed(2),
        j.totalCost.toFixed(2), j.profit.toFixed(2), j.margin.toFixed(1), j.incentive.toFixed(2), j.discount.toFixed(2),
        j.allottedHours.toFixed(1), j.trackedHours.toFixed(1), j.salesperson
      ]),
      'jobs_report'
    )
  }

  const marginColor = (m) => m >= 40 ? '#22c55e' : m >= 20 ? '#eab308' : '#ef4444'
  const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return '—' } }

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <Loader2 size={32} style={{ color: theme.accent, animation: 'spin 1s linear infinite' }} />
        <p style={{ color: theme.textMuted, marginTop: '12px' }}>Loading job data...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
        {/* Status pills */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {allStatuses.map(s => (
              <button key={s} onClick={() => toggleStatus(s)} style={{ ...pillStyle(statusFilters.includes(s)), border: 'none' }}>{s}</button>
            ))}
          </div>
        </div>

        {businessUnits.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Unit</div>
            <select value={buFilter} onChange={(e) => setBuFilter(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
              <option value="">All Units</option>
              {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
            </select>
          </div>
        )}

        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} style={inputStyle} />
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>to</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} style={inputStyle} />
            {(dateStart || dateEnd) && (
              <button onClick={() => { setDateStart(''); setDateEnd('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}><X size={14} /></button>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Search</div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Customer, job ID..."
              style={{ ...inputStyle, paddingLeft: '28px', minWidth: '160px' }}
            />
          </div>
        </div>

        <button onClick={handleExport} style={{ ...pillStyle(false), display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Jobs</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{enrichedJobs.length}</div>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>{completedJobs} completed</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{formatCurrency(totalRevenue)}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Material Cost</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#c25a5a' }}>{formatCurrency(totalMaterialCost)}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Profit</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: totalProfit >= 0 ? '#22c55e' : '#ef4444' }}>{formatCurrency(totalProfit)}</div>
          <div style={{ fontSize: '11px', color: marginColor(avgMargin), fontWeight: '600' }}>{avgMargin.toFixed(1)}% margin</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{totalTracked.toFixed(0)}h</div>
          <div style={{ fontSize: '11px', color: totalTracked > totalAllotted && totalAllotted > 0 ? '#ef4444' : theme.textMuted }}>{totalAllotted.toFixed(0)}h allotted</div>
        </div>
      </div>

      {/* Jobs Table */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{ width: '24px', padding: '10px 6px 10px 14px' }}></th>
              <SortHeader field="start_date" align="left">Date</SortHeader>
              <SortHeader field="customer" align="left">Job / Customer</SortHeader>
              <th style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textAlign: 'left' }}>Status</th>
              <SortHeader field="revenue">Revenue</SortHeader>
              <SortHeader field="cost">Cost</SortHeader>
              <SortHeader field="profit">Profit</SortHeader>
              <SortHeader field="margin">Margin</SortHeader>
              <SortHeader field="time">Time</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No jobs match filters</td></tr>
            )}
            {sortedJobs.map(j => {
              const isExpanded = expandedJobs.has(j.id)
              return (
                <Fragment key={j.id}>
                  <tr
                    onClick={() => toggleExpand(j.id)}
                    style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', backgroundColor: isExpanded ? theme.accentBg : 'transparent' }}
                    onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = theme.bgCardHover }}
                    onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <td style={{ padding: '10px 6px 10px 14px', color: theme.textMuted }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                      {fmtDate(j.start_date)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{j.job_title || j.job_id || `Job #${j.id}`}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{j.customer_name || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: (j.status || '').toLowerCase().includes('complete') ? 'rgba(34,197,94,0.12)' : theme.accentBg,
                        color: (j.status || '').toLowerCase().includes('complete') ? '#22c55e' : theme.accent
                      }}>
                        {j.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.text }}>
                      {formatCurrency(j.revenue)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: theme.textSecondary }}>
                      {formatCurrency(j.totalCost)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: j.profit >= 0 ? '#22c55e' : '#ef4444' }}>
                      {formatCurrency(j.profit)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: marginColor(j.margin) }}>{j.margin.toFixed(0)}%</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px' }}>
                      <span style={{ color: j.trackedHours > j.allottedHours && j.allottedHours > 0 ? '#ef4444' : theme.textSecondary }}>
                        {j.trackedHours.toFixed(1)}h
                      </span>
                      {j.allottedHours > 0 && (
                        <span style={{ color: theme.textMuted }}> / {j.allottedHours.toFixed(1)}h</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} style={{ padding: 0 }}>
                        <div style={{ padding: '16px 20px 16px 44px', backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Job Details</div>
                              <div style={{ fontSize: '13px', color: theme.text }}><strong>ID:</strong> {j.job_id || `#${j.id}`}</div>
                              {j.business_unit && <div style={{ fontSize: '12px', color: theme.textSecondary }}><strong>BU:</strong> {j.business_unit}</div>}
                              {j.job_address && <div style={{ fontSize: '12px', color: theme.textSecondary }}><strong>Address:</strong> {j.job_address}</div>}
                              {j.salesperson && <div style={{ fontSize: '12px', color: theme.textSecondary }}><strong>Sales:</strong> {j.salesperson}</div>}
                              {j.end_date && <div style={{ fontSize: '12px', color: theme.textSecondary }}><strong>End:</strong> {fmtDate(j.end_date)}</div>}
                              <button onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${j.id}`) }} style={{ marginTop: '6px', fontSize: '12px', color: theme.accent, background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
                                Open Job
                              </button>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Costing Breakdown</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Material Cost</span><span style={{ fontWeight: '600' }}>{formatCurrency(j.materialCost)}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Sundry (3%)</span><span>{formatCurrency(j.sundry)}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Budget</span><span style={{ fontWeight: '600' }}>{formatCurrency(j.budget)}</span></div>
                                {j.expenseAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#ef4444' }}>Expenses</span><span style={{ color: '#ef4444' }}>{formatCurrency(j.expenseAmount)}</span></div>}
                                {j.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textMuted }}>Discount</span><span>-{formatCurrency(j.discount)}</span></div>}
                                {j.incentive > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4a7c59' }}>Incentive</span><span style={{ color: '#4a7c59' }}>{formatCurrency(j.incentive)}</span></div>}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${theme.border}`, paddingTop: '4px', marginTop: '2px' }}>
                                  <span style={{ fontWeight: '600', color: theme.text }}>Revenue</span>
                                  <span style={{ fontWeight: '700' }}>{formatCurrency(j.revenue)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontWeight: '600', color: j.profit >= 0 ? '#22c55e' : '#ef4444' }}>Profit</span>
                                  <span style={{ fontWeight: '700', color: j.profit >= 0 ? '#22c55e' : '#ef4444' }}>{formatCurrency(j.profit)}</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Time & Efficiency</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Allotted</span><span>{j.allottedHours.toFixed(1)}h</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Tracked</span><span style={{ color: j.trackedHours > j.allottedHours && j.allottedHours > 0 ? '#ef4444' : theme.text }}>{j.trackedHours.toFixed(1)}h</span></div>
                                {j.allottedHours > 0 && (
                                  <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: theme.textSecondary }}>Efficiency</span>
                                      <span style={{ fontWeight: '600', color: j.timeEfficiency > 1 ? '#ef4444' : '#22c55e' }}>{(j.timeEfficiency * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ height: '6px', borderRadius: '3px', backgroundColor: theme.border, marginTop: '4px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.min(j.timeEfficiency * 100, 100)}%`, borderRadius: '3px', backgroundColor: j.timeEfficiency > 1 ? '#ef4444' : '#22c55e' }} />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Line Items */}
                          {j.lineItems.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Line Items</div>
                              <div style={{ borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                                {j.lineItems.map((item, idx) => (
                                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 100px 100px', gap: '8px', padding: '6px 12px', fontSize: '12px', borderBottom: idx < j.lineItems.length - 1 ? `1px solid ${theme.border}` : 'none', backgroundColor: idx % 2 === 0 ? theme.bgCard : theme.bg }}>
                                    <span style={{ color: theme.text }}>{item.name}</span>
                                    <span style={{ textAlign: 'right', color: theme.textMuted }}>x{item.qty}</span>
                                    <span style={{ textAlign: 'right', color: theme.textSecondary }}>{formatCurrency(item.cost)}</span>
                                    <span style={{ textAlign: 'right', fontWeight: '500' }}>{formatCurrency(item.price)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Products Needed Report Component ──────────────────────────────
function ProductsNeededReport({ theme, companyId, jobs, products, formatCurrency, inputStyle, pillStyle, exportCSV }) {
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const [loading, setLoading] = useState(true)
  const [jobLines, setJobLines] = useState([])
  const [componentMap, setComponentMap] = useState({}) // parentId -> [{component_product_id, quantity}]
  const [statusFilters, setStatusFilters] = useState([])
  const [buFilter, setBuFilter] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [groupBy, setGroupBy] = useState('product') // 'product' | 'job' | 'status'
  const [expandedJobs, setExpandedJobs] = useState(new Set())
  const [showComponents, setShowComponents] = useState(true)
  const [sortField, setSortField] = useState('qty')
  const [sortDir, setSortDir] = useState('desc')

  // Use DB-driven job statuses from store, fall back to defaults
  const allStatuses = useMemo(() => {
    if (storeJobStatuses && storeJobStatuses.length > 0) {
      return storeJobStatuses.map(s => typeof s === 'string' ? s : (s.id || s.name))
    }
    return FALLBACK_STATUSES.map(s => s.id)
  }, [storeJobStatuses])

  // Set default filters once statuses are available
  useEffect(() => {
    if (allStatuses.length > 0 && statusFilters.length === 0) {
      // Pre-select active statuses (exclude terminal ones like Complete/Completed/Cancelled)
      const terminal = ['complete', 'completed', 'cancelled', 'canceled', 'closed']
      const defaults = allStatuses.filter(s => !terminal.includes(s.toLowerCase()))
      setStatusFilters(defaults.length > 0 ? defaults : allStatuses)
    }
  }, [allStatuses])

  const businessUnits = [...new Set(jobs.map(j => j.business_unit).filter(Boolean))]

  // Fetch all job_lines with product data + product_components for the company
  useEffect(() => {
    if (!companyId) return
    const load = async () => {
      setLoading(true)
      const [linesRes, compRes] = await Promise.all([
        supabase
          .from('job_lines')
          .select('*, item:products_services(id, name, type, cost, unit_price, business_unit, item_id), job:jobs!job_id(id, job_id, job_title, status, start_date, end_date, business_unit, customer_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(10000),
        supabase
          .from('product_components')
          .select('*')
          .eq('company_id', companyId)
      ])
      setJobLines(linesRes.data || [])
      // Build component lookup: parentId -> [{ component_product_id, quantity }]
      const cMap = {}
      ;(compRes.data || []).forEach(pc => {
        if (!cMap[pc.parent_product_id]) cMap[pc.parent_product_id] = []
        cMap[pc.parent_product_id].push({ component_product_id: pc.component_product_id, quantity: pc.quantity })
      })
      setComponentMap(cMap)
      setLoading(false)
    }
    load()
  }, [companyId])

  const filtered = useMemo(() => {
    return jobLines.filter(line => {
      if (!line.job) return false
      if (statusFilters.length > 0 && !statusFilters.includes(line.job.status)) return false
      if (buFilter && line.job.business_unit !== buFilter) return false
      if (dateStart && line.job.start_date && line.job.start_date < dateStart) return false
      if (dateEnd && line.job.start_date && line.job.start_date > dateEnd + 'T23:59:59') return false
      return true
    })
  }, [jobLines, statusFilters, buFilter, dateStart, dateEnd])

  // Aggregate by product (with component expansion)
  const productAggregation = useMemo(() => {
    const map = {}
    const addToMap = (pid, name, productItemId, cost, qty, price, jobId, type, isComponent, parentName) => {
      if (!map[pid]) map[pid] = { name, productId: productItemId, totalQty: 0, totalCost: 0, totalRevenue: 0, jobCount: new Set(), type, isComponent: false, parentNames: new Set() }
      map[pid].totalQty += qty
      map[pid].totalCost += cost * qty
      map[pid].totalRevenue += price * qty
      map[pid].jobCount.add(jobId)
      if (isComponent) {
        map[pid].isComponent = true
        if (parentName) map[pid].parentNames.add(parentName)
      }
    }

    filtered.forEach(line => {
      const pid = line.item_id || line.item?.id || 'unknown'
      const name = line.item?.name || line.description || 'Unknown Product'
      const cost = parseFloat(line.item?.cost) || 0
      const qty = parseFloat(line.quantity) || 1
      const price = parseFloat(line.price) || parseFloat(line.item?.unit_price) || 0
      const itemId = line.item?.id
      const components = itemId ? (componentMap[itemId] || []) : []
      const isBundle = showComponents && components.length > 0

      // Always add the parent line item
      addToMap(pid, name, line.item?.item_id || '', cost, qty, price, line.job?.id, line.item?.type || '', false, null)
      if (isBundle) map[pid].isBundle = true

      // If bundle + showComponents, also add component products
      if (isBundle) {
        components.forEach(comp => {
          const cp = products.find(p => p.id === comp.component_product_id)
          if (!cp) return
          const compCost = parseFloat(cp.cost) || 0
          const compQty = comp.quantity * qty
          addToMap(`comp-${cp.id}`, cp.name, cp.item_id || '', compCost, compQty, 0, line.job?.id, cp.type || '', true, name)
        })
      }
    })
    let arr = Object.entries(map).map(([id, d]) => ({ id, ...d, jobCount: d.jobCount.size, parentNames: [...d.parentNames] }))
    // Sort
    if (sortField === 'qty') arr.sort((a, b) => sortDir === 'desc' ? b.totalQty - a.totalQty : a.totalQty - b.totalQty)
    else if (sortField === 'cost') arr.sort((a, b) => sortDir === 'desc' ? b.totalCost - a.totalCost : a.totalCost - b.totalCost)
    else if (sortField === 'name') arr.sort((a, b) => sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name))
    else if (sortField === 'jobs') arr.sort((a, b) => sortDir === 'desc' ? b.jobCount - a.jobCount : a.jobCount - b.jobCount)
    return arr
  }, [filtered, sortField, sortDir, componentMap, products, showComponents])

  // Aggregate by job — DEDUP products within each job so the PM sees
  // "order 138 highbays" instead of 6 separate lines for the same SKU.
  // Components from bundles are also deduped if shown.
  const jobAggregation = useMemo(() => {
    const map = {}
    filtered.forEach(line => {
      const jid = line.job?.id
      if (!jid) return
      if (!map[jid]) map[jid] = { id: jid, jobId: line.job.job_id, title: line.job.job_title || line.job.job_id, status: line.job.status, customer: line.job.customer_name || '', startDate: line.job.start_date, lineCount: 0, totalCost: 0, totalRevenue: 0, itemMap: {} }
      const qty = parseFloat(line.quantity) || 1
      const cost = parseFloat(line.item?.cost) || 0
      const price = parseFloat(line.price) || parseFloat(line.item?.unit_price) || 0
      const itemId = line.item?.id
      const components = itemId ? (componentMap[itemId] || []) : []
      const isBundle = showComponents && components.length > 0

      map[jid].lineCount += qty
      map[jid].totalCost += cost * qty
      map[jid].totalRevenue += price * qty

      // Dedup: merge matching products by item_id (or by name for orphan lines)
      const key = itemId || `name:${line.item?.name || line.description || 'Unknown'}`
      if (!map[jid].itemMap[key]) {
        map[jid].itemMap[key] = {
          id: key,
          name: line.item?.name || line.description || 'Unknown',
          productId: line.item?.item_id || '',
          qty: 0,
          cost: 0,
          price: 0,
          type: line.item?.type || '',
          isBundle,
          componentMap: {},
        }
      }
      map[jid].itemMap[key].qty += qty
      map[jid].itemMap[key].cost += cost * qty
      map[jid].itemMap[key].price += price * qty

      // Dedup components within the job too
      if (isBundle) {
        components.forEach(comp => {
          const cp = products.find(p => p.id === comp.component_product_id)
          if (!cp) return
          const compCost = parseFloat(cp.cost) || 0
          const compQty = comp.quantity * qty
          const compKey = cp.id
          if (!map[jid].itemMap[key].componentMap[compKey]) {
            map[jid].itemMap[key].componentMap[compKey] = { name: cp.name, productId: cp.item_id || '', qty: 0, cost: 0, type: cp.type || '' }
          }
          map[jid].itemMap[key].componentMap[compKey].qty += compQty
          map[jid].itemMap[key].componentMap[compKey].cost += compCost * compQty
        })
      }
    })

    // Flatten itemMap → items array, sort by qty descending within each job
    return Object.values(map).map(j => ({
      ...j,
      items: Object.values(j.itemMap)
        .map(item => ({
          ...item,
          components: Object.values(item.componentMap),
        }))
        .sort((a, b) => b.qty - a.qty),
    })).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [filtered, componentMap, products, showComponents])

  // Aggregate by status (with component expansion)
  const statusAggregation = useMemo(() => {
    const map = {}
    filtered.forEach(line => {
      const s = line.job?.status || 'Unknown'
      const qty = parseFloat(line.quantity) || 1
      if (!map[s]) map[s] = { totalQty: 0, totalCost: 0, jobCount: new Set() }
      map[s].totalQty += qty
      map[s].totalCost += (parseFloat(line.item?.cost) || 0) * qty
      map[s].jobCount.add(line.job?.id)

      // Add component quantities
      if (showComponents) {
        const itemId = line.item?.id
        const components = itemId ? (componentMap[itemId] || []) : []
        components.forEach(comp => {
          const cp = products.find(p => p.id === comp.component_product_id)
          if (!cp) return
          const compQty = comp.quantity * qty
          map[s].totalQty += compQty
          map[s].totalCost += (parseFloat(cp.cost) || 0) * compQty
        })
      }
    })
    return Object.entries(map).map(([status, d]) => ({ status, ...d, jobCount: d.jobCount.size }))
  }, [filtered, componentMap, products, showComponents])

  const toggleStatus = (s) => setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const SortHeader = ({ field, children }) => (
    <th
      onClick={() => { if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('desc') } }}
      style={{ padding: '10px 14px', textAlign: field === 'name' ? 'left' : 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {children}
        {sortField === field && <ArrowUpDown size={12} style={{ opacity: 0.6 }} />}
      </span>
    </th>
  )

  // Summary stats respect the active groupBy so numbers in the top
  // cards always match the table the PM is looking at.
  const totalQty = groupBy === 'job'
    ? jobAggregation.reduce((s, j) => s + j.lineCount, 0)
    : productAggregation.reduce((s, p) => s + p.totalQty, 0)
  const totalCost = groupBy === 'job'
    ? jobAggregation.reduce((s, j) => s + j.totalCost, 0)
    : productAggregation.reduce((s, p) => s + p.totalCost, 0)
  const totalRevenue = groupBy === 'job'
    ? jobAggregation.reduce((s, j) => s + j.totalRevenue, 0)
    : productAggregation.reduce((s, p) => s + p.totalRevenue, 0)

  const handleExport = () => {
    if (groupBy === 'product') {
      exportCSV(
        ['Product', 'Product ID', 'Type', 'Qty Needed', 'Total Cost', 'Total Revenue', 'Jobs', 'Role'],
        productAggregation.map(p => [p.name, p.productId, p.type, p.totalQty, p.totalCost.toFixed(2), p.totalRevenue.toFixed(2), p.jobCount, p.isComponent ? 'Component' : p.isBundle ? 'Bundle' : '']),
        'products_needed'
      )
    } else if (groupBy === 'job') {
      const rows = []
      jobAggregation.forEach(j => {
        j.items.forEach(item => {
          rows.push([j.title, j.customer, j.status, j.startDate?.split('T')[0] || '', item.name, item.productId, item.type, item.qty, item.cost.toFixed(2), item.price.toFixed(2), item.isBundle ? 'Bundle' : ''])
          if (item.components) {
            item.components.forEach(comp => {
              rows.push([j.title, j.customer, j.status, j.startDate?.split('T')[0] || '', `  ↳ ${comp.name}`, comp.productId, comp.type, comp.qty, comp.cost.toFixed(2), '', 'Component'])
            })
          }
        })
      })
      exportCSV(
        ['Job', 'Customer', 'Status', 'Start Date', 'Product', 'Product ID', 'Type', 'Qty', 'Material Cost', 'Revenue', 'Role'],
        rows,
        'products_needed_by_job'
      )
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center' }}>
        <Loader2 size={32} style={{ color: theme.accent, animation: 'spin 1s linear infinite' }} />
        <p style={{ color: theme.textMuted, marginTop: '12px' }}>Loading product data...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
        {/* Status pills */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job Status</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {allStatuses.map(s => (
              <button key={s} onClick={() => toggleStatus(s)} style={{ ...pillStyle(statusFilters.includes(s)), border: 'none' }}>{s}</button>
            ))}
          </div>
        </div>

        {/* BU filter */}
        {businessUnits.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Unit</div>
            <select value={buFilter} onChange={(e) => setBuFilter(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
              <option value="">All Units</option>
              {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
            </select>
          </div>
        )}

        {/* Date range */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} style={inputStyle} />
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>to</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} style={inputStyle} />
            {(dateStart || dateEnd) && (
              <button onClick={() => { setDateStart(''); setDateEnd('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}><X size={14} /></button>
            )}
          </div>
        </div>

        {/* Group by */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Group By</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[{ id: 'product', label: 'Product' }, { id: 'job', label: 'Job' }, { id: 'status', label: 'Status' }].map(g => (
              <button key={g.id} onClick={() => setGroupBy(g.id)} style={pillStyle(groupBy === g.id)}>{g.label}</button>
            ))}
          </div>
        </div>

        {/* Bundle Components Toggle */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bundles</div>
          <button
            onClick={() => setShowComponents(prev => !prev)}
            style={{
              ...pillStyle(showComponents),
              border: 'none',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Boxes size={14} /> Components
          </button>
        </div>

        {/* Export */}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={handleExport} style={{ padding: '8px 14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500' }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{totalQty}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Total Items Needed</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatCurrency(totalCost)}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Material Cost</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>{formatCurrency(totalRevenue)}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Revenue</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: totalRevenue > 0 && (totalCost / totalRevenue) > 0.5 ? '#c25a5a' : theme.text }}>{totalRevenue > 0 ? `${((totalCost / totalRevenue) * 100).toFixed(1)}%` : '—'}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Cost / Revenue</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{productAggregation.length}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Unique Products</div>
        </div>
      </div>

      {/* Table */}
      {groupBy === 'product' && (
        <div style={{ backgroundColor: theme.bg, borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg }}>
                <SortHeader field="name">Product</SortHeader>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Type</th>
                <SortHeader field="qty">Qty Needed</SortHeader>
                <SortHeader field="cost">Material Cost</SortHeader>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Revenue</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Cost %</th>
                <SortHeader field="jobs">Jobs</SortHeader>
              </tr>
            </thead>
            <tbody>
              {productAggregation.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}>No products found for selected filters</td></tr>
              ) : productAggregation.map(p => {
                const costPct = p.totalRevenue > 0 ? (p.totalCost / p.totalRevenue) * 100 : 0
                return (
                <tr key={p.id} style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: p.isComponent ? theme.bgCard : 'transparent' }}>
                  <td style={{ padding: p.isComponent ? '7px 14px 7px 28px' : '10px 14px', fontSize: p.isComponent ? '13px' : '14px', color: p.isComponent ? theme.textSecondary : theme.text, fontWeight: '500' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {p.isBundle && <Boxes size={14} style={{ color: theme.accent, flexShrink: 0 }} />}
                      {p.isComponent && <span style={{ color: theme.textMuted }}>↳</span>}
                      {p.name}
                      {p.productId && <span style={{ fontSize: '11px', color: theme.textMuted }}>#{p.productId}</span>}
                    </span>
                    {p.isComponent && p.parentNames.length > 0 && (
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>via {p.parentNames.join(', ')}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: theme.textMuted }}>{p.type}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', fontWeight: '600', color: theme.text, textAlign: 'right' }}>{p.totalQty}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.text, textAlign: 'right' }}>{formatCurrency(p.totalCost)}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', color: '#4a7c59', textAlign: 'right' }}>{p.isComponent ? '—' : formatCurrency(p.totalRevenue)}</td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600', textAlign: 'right', color: costPct > 50 ? '#c25a5a' : costPct > 30 ? '#d4940a' : '#4a7c59' }}>{p.totalRevenue > 0 ? `${costPct.toFixed(1)}%` : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.textSecondary, textAlign: 'right' }}>{p.jobCount}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {groupBy === 'job' && (
        <div style={{ backgroundColor: theme.bg, borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, width: '30px' }}></th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Job</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Customer</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Items</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Material Cost</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Revenue</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Cost %</th>
              </tr>
            </thead>
            <tbody>
              {jobAggregation.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}>No jobs found for selected filters</td></tr>
              ) : jobAggregation.map(j => {
                const isExpanded = expandedJobs.has(j.id)
                const jobCostPct = j.totalRevenue > 0 ? (j.totalCost / j.totalRevenue) * 100 : 0
                return (
                  <Fragment key={j.id}>
                    <tr
                      onClick={() => setExpandedJobs(prev => { const next = new Set(prev); if (next.has(j.id)) next.delete(j.id); else next.add(j.id); return next })}
                      style={{ borderBottom: isExpanded ? 'none' : `1px solid ${theme.border}`, cursor: 'pointer' }}
                    >
                      <td style={{ padding: '10px 8px 10px 14px', fontSize: '14px', color: theme.textMuted }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.text, fontWeight: '500' }}>{j.title}</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', color: theme.textSecondary }}>{j.customer}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '500', backgroundColor: theme.accentBg, color: theme.accent }}>{j.status}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '14px', fontWeight: '600', color: theme.text, textAlign: 'right' }}>{j.lineCount}</td>
                      <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.text, textAlign: 'right' }}>{formatCurrency(j.totalCost)}</td>
                      <td style={{ padding: '10px 14px', fontSize: '14px', color: '#4a7c59', textAlign: 'right' }}>{formatCurrency(j.totalRevenue)}</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600', textAlign: 'right', color: jobCostPct > 50 ? '#c25a5a' : jobCostPct > 30 ? '#d4940a' : '#4a7c59' }}>{j.totalRevenue > 0 ? `${jobCostPct.toFixed(1)}%` : '—'}</td>
                    </tr>
                    {isExpanded && j.items.map((item, idx) => {
                      const itemCostPct = item.price > 0 ? (item.cost / item.price) * 100 : 0
                      return (
                      <Fragment key={item.id || idx}>
                      <tr style={{ backgroundColor: theme.bgCard, borderBottom: (idx === j.items.length - 1 && (!item.components || item.components.length === 0)) ? `1px solid ${theme.border}` : `1px solid ${theme.bg}` }}>
                        <td></td>
                        <td style={{ padding: '7px 14px 7px 28px', fontSize: '13px', color: theme.textSecondary }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {item.isBundle && <Boxes size={13} style={{ color: theme.accent }} />}
                            {item.name}
                            {item.productId && <span style={{ fontSize: '11px', color: theme.textMuted }}>#{item.productId}</span>}
                          </span>
                        </td>
                        <td style={{ padding: '7px 14px', fontSize: '12px', color: theme.textMuted }}>{item.type}</td>
                        <td></td>
                        <td style={{ padding: '7px 14px', fontSize: '13px', color: theme.textSecondary, textAlign: 'right' }}>{item.qty}</td>
                        <td style={{ padding: '7px 14px', fontSize: '13px', color: theme.textSecondary, textAlign: 'right' }}>{formatCurrency(item.cost)}</td>
                        <td style={{ padding: '7px 14px', fontSize: '13px', color: theme.textSecondary, textAlign: 'right' }}>{formatCurrency(item.price)}</td>
                        <td style={{ padding: '7px 14px', fontSize: '12px', color: itemCostPct > 50 ? '#c25a5a' : itemCostPct > 30 ? '#d4940a' : '#4a7c59', textAlign: 'right' }}>{item.price > 0 ? `${itemCostPct.toFixed(1)}%` : '—'}</td>
                      </tr>
                      {item.components && item.components.map((comp, cidx) => (
                        <tr key={`comp-${cidx}`} style={{ backgroundColor: theme.bgCard, borderBottom: (idx === j.items.length - 1 && cidx === item.components.length - 1) ? `1px solid ${theme.border}` : `1px solid ${theme.bg}` }}>
                          <td></td>
                          <td style={{ padding: '5px 14px 5px 44px', fontSize: '12px', color: theme.textMuted }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span>↳</span> {comp.name}
                              {comp.productId && <span style={{ fontSize: '10px', color: theme.textMuted }}>#{comp.productId}</span>}
                            </span>
                          </td>
                          <td style={{ padding: '5px 14px', fontSize: '11px', color: theme.textMuted }}>{comp.type}</td>
                          <td></td>
                          <td style={{ padding: '5px 14px', fontSize: '12px', color: theme.textMuted, textAlign: 'right' }}>{comp.qty}</td>
                          <td style={{ padding: '5px 14px', fontSize: '12px', color: theme.textMuted, textAlign: 'right' }}>{formatCurrency(comp.cost)}</td>
                          <td style={{ padding: '5px 14px', fontSize: '12px', color: theme.textMuted, textAlign: 'right' }}>—</td>
                          <td style={{ padding: '5px 14px', fontSize: '11px', color: theme.textMuted, textAlign: 'right' }}>—</td>
                        </tr>
                      ))}
                      </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
            {jobAggregation.length > 1 && (() => {
              const grandQty = jobAggregation.reduce((s, j) => s + j.lineCount, 0)
              const grandCost = jobAggregation.reduce((s, j) => s + j.totalCost, 0)
              const grandRev = jobAggregation.reduce((s, j) => s + j.totalRevenue, 0)
              const grandPct = grandRev > 0 ? (grandCost / grandRev) * 100 : 0
              return (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${theme.accent}`, backgroundColor: theme.accentBg }}>
                    <td></td>
                    <td colSpan={3} style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: theme.text }}>
                      Grand Total — {jobAggregation.length} jobs
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: theme.text, textAlign: 'right' }}>{grandQty}</td>
                    <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: theme.text, textAlign: 'right' }}>{formatCurrency(grandCost)}</td>
                    <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#4a7c59', textAlign: 'right' }}>{formatCurrency(grandRev)}</td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700', textAlign: 'right', color: grandPct > 50 ? '#c25a5a' : grandPct > 30 ? '#d4940a' : '#4a7c59' }}>{grandRev > 0 ? `${grandPct.toFixed(1)}%` : '—'}</td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      )}

      {groupBy === 'status' && (
        <div style={{ backgroundColor: theme.bg, borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Jobs</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Items Needed</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Material Cost</th>
              </tr>
            </thead>
            <tbody>
              {statusAggregation.map(s => (
                <tr key={s.status} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.text, fontWeight: '500' }}>{s.status}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.textSecondary, textAlign: 'right' }}>{s.jobCount}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', fontWeight: '600', color: theme.text, textAlign: 'right' }}>{s.totalQty}</td>
                  <td style={{ padding: '10px 14px', fontSize: '14px', color: theme.text, textAlign: 'right' }}>{formatCurrency(s.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// CUSTOM REPORT BUILDER (Admin only)
// ═══════════════════════════════════════════════════════════════════

function CustomReport({ theme, companyId, inputStyle, exportCSV }) {
  const [selectedTable, setSelectedTable] = useState('')
  const [columns, setColumns] = useState([])
  const [selectedColumns, setSelectedColumns] = useState([])
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [limit, setLimit] = useState(500)
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [filterCol, setFilterCol] = useState('')
  const [filterOp, setFilterOp] = useState('eq')
  const [filterVal, setFilterVal] = useState('')
  const [filters, setFilters] = useState([])
  const [hasRun, setHasRun] = useState(false)

  // Discover columns when table is selected
  useEffect(() => {
    if (!selectedTable || !companyId) return
    setColumns([])
    setSelectedColumns([])
    setData([])
    setHasRun(false)
    setError(null)

    const discover = async () => {
      // Fetch 1 row to discover columns
      const { data: sample, error: err } = await supabase
        .from(selectedTable)
        .select('*')
        .eq('company_id', companyId)
        .limit(1)

      if (err) {
        // Table might not have company_id
        const { data: sample2 } = await supabase.from(selectedTable).select('*').limit(1)
        if (sample2 && sample2.length > 0) {
          const cols = Object.keys(sample2[0])
          setColumns(cols)
          setSelectedColumns(cols.slice(0, 8))
        } else {
          setError('Could not read table')
        }
        return
      }
      if (sample && sample.length > 0) {
        const cols = Object.keys(sample[0])
        setColumns(cols)
        // Auto-select first 8 non-internal columns
        const auto = cols.filter(c => !['company_id', 'created_at', 'updated_at'].includes(c)).slice(0, 8)
        setSelectedColumns(auto.length > 0 ? auto : cols.slice(0, 8))
      } else {
        // Table exists but empty for this company
        setColumns([])
        setError('No data found in this table for your company')
      }
    }
    discover()
  }, [selectedTable, companyId])

  const toggleColumn = (col) => {
    setSelectedColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
  }

  const addFilter = () => {
    if (!filterCol || !filterVal) return
    setFilters(prev => [...prev, { col: filterCol, op: filterOp, val: filterVal }])
    setFilterCol('')
    setFilterVal('')
    setFilterOp('eq')
  }

  const removeFilter = (idx) => setFilters(prev => prev.filter((_, i) => i !== idx))

  const runReport = async () => {
    if (!selectedTable || selectedColumns.length === 0) return
    setLoading(true)
    setError(null)

    let query = supabase.from(selectedTable).select(selectedColumns.join(','))

    // Always filter by company_id if the table has it
    if (columns.includes('company_id')) {
      query = query.eq('company_id', companyId)
    }

    // Apply filters
    filters.forEach(f => {
      switch (f.op) {
        case 'eq': query = query.eq(f.col, f.val); break
        case 'neq': query = query.neq(f.col, f.val); break
        case 'gt': query = query.gt(f.col, f.val); break
        case 'lt': query = query.lt(f.col, f.val); break
        case 'gte': query = query.gte(f.col, f.val); break
        case 'lte': query = query.lte(f.col, f.val); break
        case 'like': query = query.ilike(f.col, `%${f.val}%`); break
        case 'is_null': query = query.is(f.col, null); break
        case 'not_null': query = query.not(f.col, 'is', null); break
      }
    })

    // Sort
    if (sortCol && selectedColumns.includes(sortCol)) {
      query = query.order(sortCol, { ascending: sortDir === 'asc' })
    } else if (columns.includes('created_at')) {
      query = query.order('created_at', { ascending: false })
    }

    query = query.limit(limit)

    const { data: result, error: err } = await query
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(result || [])
    }
    setHasRun(true)
    setLoading(false)
  }

  const handleExport = () => {
    if (data.length === 0) return
    exportCSV(selectedColumns, data.map(row => selectedColumns.map(c => row[c])), `custom_${selectedTable}`)
  }

  const formatCell = (val) => {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'boolean') return val ? 'Yes' : 'No'
    if (typeof val === 'object') return JSON.stringify(val)
    const str = String(val)
    // Detect ISO dates
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return new Date(str).toLocaleString()
    return str
  }

  const opLabels = { eq: '=', neq: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=', like: 'contains', is_null: 'is null', not_null: 'not null' }

  return (
    <div>
      {/* Table Selector */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Data Source</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {REPORT_TABLES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTable(t.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${selectedTable === t.id ? theme.accent : theme.border}`,
                backgroundColor: selectedTable === t.id ? theme.accent : 'transparent',
                color: selectedTable === t.id ? '#fff' : theme.textSecondary,
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {selectedTable && columns.length > 0 && (
        <>
          {/* Column Selector */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Columns ({selectedColumns.length} selected)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflow: 'auto', padding: '4px 0' }}>
              {columns.map(col => (
                <button
                  key={col}
                  onClick={() => toggleColumn(col)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${selectedColumns.includes(col) ? theme.accent : theme.border}`,
                    backgroundColor: selectedColumns.includes(col) ? theme.accentBg : 'transparent',
                    color: selectedColumns.includes(col) ? theme.accent : theme.textMuted,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filters</div>
            {filters.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {filters.map((f, i) => (
                  <span key={i} style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: theme.accentBg, color: theme.accent, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {f.col} {opLabels[f.op]} {f.op === 'is_null' || f.op === 'not_null' ? '' : `"${f.val}"`}
                    <button onClick={() => removeFilter(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, padding: 0 }}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
                <option value="">Column...</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterOp} onChange={(e) => setFilterOp(e.target.value)} style={{ ...inputStyle, minWidth: '100px' }}>
                {Object.entries(opLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {filterOp !== 'is_null' && filterOp !== 'not_null' && (
                <input type="text" value={filterVal} onChange={(e) => setFilterVal(e.target.value)} placeholder="Value..." style={{ ...inputStyle, minWidth: '120px' }} onKeyDown={(e) => e.key === 'Enter' && addFilter()} />
              )}
              <button onClick={addFilter} style={{ padding: '8px 14px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <Filter size={14} /> Add
              </button>
            </div>
          </div>

          {/* Sort & Limit */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sort By</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select value={sortCol} onChange={(e) => setSortCol(e.target.value)} style={{ ...inputStyle, minWidth: '140px' }}>
                  <option value="">Default</option>
                  {selectedColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={inputStyle}>
                  <option value="asc">Asc</option>
                  <option value="desc">Desc</option>
                </select>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Limit</div>
              <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} style={inputStyle}>
                <option value={100}>100 rows</option>
                <option value={500}>500 rows</option>
                <option value={1000}>1,000 rows</option>
                <option value={5000}>5,000 rows</option>
              </select>
            </div>
            <button onClick={runReport} disabled={loading || selectedColumns.length === 0} style={{
              padding: '10px 24px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'wait' : 'pointer', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', opacity: loading ? 0.7 : 1
            }}>
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Running...</> : <><Search size={16} /> Run Report</>}
            </button>
            {data.length > 0 && (
              <button onClick={handleExport} style={{ padding: '10px 16px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div style={{ padding: '16px', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: '8px', color: '#dc2626', fontSize: '14px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {hasRun && !loading && (
        <div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
            {data.length} row{data.length !== 1 ? 's' : ''} returned{data.length >= limit ? ` (limit: ${limit})` : ''}
          </div>
          {data.length > 0 && (
            <div style={{ overflow: 'auto', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${selectedColumns.length * 140}px` }}>
                <thead>
                  <tr style={{ backgroundColor: theme.accentBg }}>
                    {selectedColumns.map(col => (
                      <th
                        key={col}
                        onClick={() => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') } }}
                        style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', borderBottom: `1px solid ${theme.border}` }}
                      >
                        {col} {sortCol === col && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: idx % 2 === 0 ? 'transparent' : theme.bg }}>
                      {selectedColumns.map(col => (
                        <td key={col} style={{ padding: '8px 12px', fontSize: '13px', color: theme.text, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatCell(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedTable && (
        <div style={{ padding: '60px', textAlign: 'center', color: theme.textMuted }}>
          <Database size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <p style={{ fontSize: '16px', fontWeight: '500' }}>Select a data source to build your report</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>Choose a table above, pick columns, add filters, then run your report.</p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
