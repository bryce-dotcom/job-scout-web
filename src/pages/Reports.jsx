import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
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
  ChevronRight
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
  accentBg: 'rgba(90,99,73,0.12)'
}

const reportTypes = [
  { id: 'sales', label: 'Sales Report', icon: TrendingUp, desc: 'Leads, conversions, pipeline value' },
  { id: 'jobs', label: 'Jobs Report', icon: Briefcase, desc: 'Job status, revenue, time tracking' },
  { id: 'financial', label: 'Financial Report', icon: DollarSign, desc: 'Invoices, payments, revenue' },
  { id: 'employee', label: 'Employee Report', icon: Users, desc: 'Hours logged, jobs completed' },
  { id: 'inventory', label: 'Inventory Report', icon: Package, desc: 'Stock levels, low stock items' },
  { id: 'fleet', label: 'Fleet Report', icon: Truck, desc: 'Asset status, maintenance costs' }
]

export default function Reports() {
  const { reportType } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
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

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
    }
  }, [companyId, navigate])

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
  }

  const formatPercent = (val) => {
    return `${(val * 100).toFixed(1)}%`
  }

  // Filter data by date range
  const filterByDate = (items, dateField) => {
    return items.filter(item => {
      const date = item[dateField]
      if (!date) return false
      return date >= dateRange.start && date <= dateRange.end
    })
  }

  // Sales Report Data
  const salesReportData = useMemo(() => {
    const filteredLeads = filterByDate(leads, 'created_at')
    const totalLeads = filteredLeads.length
    const converted = filteredLeads.filter(l => l.status === 'Converted').length
    const conversionRate = totalLeads > 0 ? converted / totalLeads : 0

    const byStatus = {}
    filteredLeads.forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1
    })

    const bySource = {}
    filteredLeads.forEach(l => {
      const source = l.lead_source || 'Unknown'
      bySource[source] = (bySource[source] || 0) + 1
    })

    const pipelineValue = salesPipeline
      .filter(d => !['Won', 'Lost'].includes(d.stage))
      .reduce((sum, d) => sum + (parseFloat(d.quote_amount) || 0), 0)

    return { totalLeads, converted, conversionRate, byStatus, bySource, pipelineValue }
  }, [leads, salesPipeline, dateRange])

  // Jobs Report Data
  const jobsReportData = useMemo(() => {
    const filteredJobs = filterByDate(jobs, 'start_date')
    const totalJobs = filteredJobs.length
    const completed = filteredJobs.filter(j => j.status === 'Completed').length
    const totalRevenue = filteredJobs.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)
    const avgJobValue = totalJobs > 0 ? totalRevenue / totalJobs : 0

    const byStatus = {}
    filteredJobs.forEach(j => {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1
    })

    // Time tracking comparison
    const totalAllotted = filteredJobs.reduce((sum, j) => sum + (parseFloat(j.allotted_time_hours) || 0), 0)
    const totalTracked = filteredJobs.reduce((sum, j) => sum + (parseFloat(j.time_tracked) || 0), 0)

    return { totalJobs, completed, totalRevenue, avgJobValue, byStatus, totalAllotted, totalTracked }
  }, [jobs, dateRange])

  // Financial Report Data
  const financialReportData = useMemo(() => {
    const filteredInvoices = filterByDate(invoices, 'created_at')
    const filteredPayments = filterByDate(payments, 'date')

    const totalInvoiced = filteredInvoices.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
    const totalCollected = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    const outstanding = totalInvoiced - totalCollected

    // Revenue by month
    const revenueByMonth = {}
    filteredPayments.forEach(p => {
      const month = p.date?.substring(0, 7)
      if (month) {
        revenueByMonth[month] = (revenueByMonth[month] || 0) + (parseFloat(p.amount) || 0)
      }
    })

    // Top customers
    const customerRevenue = {}
    filteredPayments.forEach(p => {
      const matchedInvoice = invoices.find(inv => inv.id === p.invoice_id)
      const customerName = matchedInvoice?.customer?.name || 'Unknown'
      customerRevenue[customerName] = (customerRevenue[customerName] || 0) + (parseFloat(p.amount) || 0)
    })
    const topCustomers = Object.entries(customerRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { totalInvoiced, totalCollected, outstanding, revenueByMonth, topCustomers }
  }, [invoices, payments, dateRange])

  // Employee Report Data
  const employeeReportData = useMemo(() => {
    const filteredLogs = filterByDate(timeLogs, 'clock_in_time')

    const hoursByEmployee = {}
    filteredLogs.forEach(log => {
      const empId = log.employee_id
      const empName = log.employee?.name || 'Unknown'
      if (!hoursByEmployee[empId]) {
        hoursByEmployee[empId] = { name: empName, hours: 0, jobs: new Set() }
      }
      if (log.clock_in_time && log.clock_out_time) {
        const hours = (new Date(log.clock_out_time) - new Date(log.clock_in_time)) / (1000 * 60 * 60)
        hoursByEmployee[empId].hours += hours
      }
      if (log.job_id) {
        hoursByEmployee[empId].jobs.add(log.job_id)
      }
    })

    const employeeStats = Object.values(hoursByEmployee).map(e => ({
      name: e.name,
      hours: e.hours.toFixed(1),
      jobCount: e.jobs.size
    })).sort((a, b) => parseFloat(b.hours) - parseFloat(a.hours))

    const totalHours = Object.values(hoursByEmployee).reduce((sum, e) => sum + e.hours, 0)

    return { employeeStats, totalHours }
  }, [timeLogs, dateRange])

  // Inventory Report Data
  const inventoryReportData = useMemo(() => {
    const totalItems = inventory.length
    const lowStock = inventory.filter(i => i.quantity < (i.min_quantity || 10))
    const totalValue = inventory.reduce((sum, i) => {
      const unitPrice = i.product?.unit_price || i.unit_cost || 0
      return sum + (i.quantity * unitPrice)
    }, 0)

    const byLocation = {}
    inventory.forEach(i => {
      const loc = i.location || 'Unassigned'
      byLocation[loc] = (byLocation[loc] || 0) + 1
    })

    return { totalItems, lowStock, totalValue, byLocation }
  }, [inventory])

  // Fleet Report Data
  const fleetReportData = useMemo(() => {
    const totalAssets = fleet.length
    const byStatus = {}
    fleet.forEach(f => {
      byStatus[f.status] = (byStatus[f.status] || 0) + 1
    })

    const maintenanceDue = fleet.filter(f => f.next_pm_due && new Date(f.next_pm_due) <= new Date())

    const filteredMaintenance = filterByDate(fleetMaintenance, 'date')
    const maintenanceCost = filteredMaintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0)

    return { totalAssets, byStatus, maintenanceDue, maintenanceCost }
  }, [fleet, fleetMaintenance, dateRange])

  const StatCard = ({ label, value, subvalue }) => (
    <div style={{
      padding: '20px',
      backgroundColor: theme.bg,
      borderRadius: '10px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '13px', color: theme.textMuted }}>{label}</div>
      {subvalue && <div style={{ fontSize: '12px', color: theme.accent, marginTop: '4px' }}>{subvalue}</div>}
    </div>
  )

  const renderReport = () => {
    switch (reportType) {
      case 'sales':
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Total Leads" value={salesReportData.totalLeads} />
              <StatCard label="Converted" value={salesReportData.converted} />
              <StatCard label="Conversion Rate" value={formatPercent(salesReportData.conversionRate)} />
              <StatCard label="Pipeline Value" value={formatCurrency(salesReportData.pipelineValue)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Leads by Status</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {Object.entries(salesReportData.byStatus).map(([status, count]) => (
                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{status}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Leads by Source</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {Object.entries(salesReportData.bySource).map(([source, count]) => (
                    <div key={source} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{source}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )

      case 'jobs':
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Total Jobs" value={jobsReportData.totalJobs} />
              <StatCard label="Completed" value={jobsReportData.completed} />
              <StatCard label="Total Revenue" value={formatCurrency(jobsReportData.totalRevenue)} />
              <StatCard label="Avg Job Value" value={formatCurrency(jobsReportData.avgJobValue)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Jobs by Status</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {Object.entries(jobsReportData.byStatus).map(([status, count]) => (
                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{status}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Time Tracking</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ fontSize: '14px', color: theme.textSecondary }}>Time Allotted</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{jobsReportData.totalAllotted.toFixed(1)} hrs</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ fontSize: '14px', color: theme.textSecondary }}>Time Tracked</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{jobsReportData.totalTracked.toFixed(1)} hrs</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: '14px', color: theme.textSecondary }}>Efficiency</span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: jobsReportData.totalTracked <= jobsReportData.totalAllotted ? '#4a7c59' : '#c25a5a'
                    }}>
                      {jobsReportData.totalAllotted > 0 ? formatPercent(jobsReportData.totalTracked / jobsReportData.totalAllotted) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'financial':
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Total Invoiced" value={formatCurrency(financialReportData.totalInvoiced)} />
              <StatCard label="Total Collected" value={formatCurrency(financialReportData.totalCollected)} />
              <StatCard label="Outstanding" value={formatCurrency(financialReportData.outstanding)} />
              <StatCard
                label="Collection Rate"
                value={financialReportData.totalInvoiced > 0 ? formatPercent(financialReportData.totalCollected / financialReportData.totalInvoiced) : '0%'}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Revenue by Month</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {Object.entries(financialReportData.revenueByMonth)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([month, amount]) => (
                      <div key={month} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                        <span style={{ fontSize: '14px', color: theme.textSecondary }}>{month}</span>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#4a7c59' }}>{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  {Object.keys(financialReportData.revenueByMonth).length === 0 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No data for period</div>
                  )}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Top Customers</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {financialReportData.topCustomers.map(([name, amount], idx) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{idx + 1}. {name}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#4a7c59' }}>{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  {financialReportData.topCustomers.length === 0 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No data for period</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      case 'employee':
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Total Hours Logged" value={employeeReportData.totalHours.toFixed(1)} subvalue="hours" />
              <StatCard label="Active Employees" value={employees.length} />
            </div>

            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Hours by Employee</h3>
            <div style={{ backgroundColor: theme.bg, borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: theme.accentBg }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Employee</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Hours</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Jobs Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeReportData.employeeStats.map(emp => (
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

      case 'inventory':
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Total Items" value={inventoryReportData.totalItems} />
              <StatCard label="Low Stock Items" value={inventoryReportData.lowStock.length} />
              <StatCard label="Total Inventory Value" value={formatCurrency(inventoryReportData.totalValue)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Items by Location</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {Object.entries(inventoryReportData.byLocation).map(([loc, count]) => (
                    <div key={loc} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{loc}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#c25a5a', marginBottom: '12px' }}>Low Stock Items</h3>
                <div style={{ backgroundColor: 'rgba(194,90,90,0.05)', borderRadius: '8px', padding: '16px' }}>
                  {inventoryReportData.lowStock.slice(0, 10).map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.text }}>{item.name}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#c25a5a' }}>{item.quantity} left</span>
                    </div>
                  ))}
                  {inventoryReportData.lowStock.length === 0 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No low stock items</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      case 'fleet':
        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <StatCard label="Total Assets" value={fleetReportData.totalAssets} />
              <StatCard label="Maintenance Due" value={fleetReportData.maintenanceDue.length} />
              <StatCard label="Maintenance Cost" value={formatCurrency(fleetReportData.maintenanceCost)} subvalue="this period" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Assets by Status</h3>
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '16px' }}>
                  {Object.entries(fleetReportData.byStatus).map(([status, count]) => (
                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{status}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#d4940a', marginBottom: '12px' }}>Maintenance Due</h3>
                <div style={{ backgroundColor: 'rgba(244,185,66,0.1)', borderRadius: '8px', padding: '16px' }}>
                  {fleetReportData.maintenanceDue.slice(0, 10).map(asset => (
                    <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: '14px', color: theme.text }}>{asset.name}</span>
                      <span style={{ fontSize: '12px', color: '#d4940a' }}>Due: {asset.next_pm_due}</span>
                    </div>
                  ))}
                  {fleetReportData.maintenanceDue.length === 0 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted }}>No maintenance due</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Report selector view
  if (!reportType) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <BarChart3 size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Reports</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {reportTypes.map(report => (
            <div
              key={report.id}
              onClick={() => navigate(`/reports/${report.id}`)}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                padding: '24px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: theme.accentBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <report.icon size={22} style={{ color: theme.accent }} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>{report.label}</h3>
              </div>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '16px' }}>{report.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: theme.accent, fontSize: '13px', fontWeight: '500' }}>
                View Report <ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Report detail view
  const currentReport = reportTypes.find(r => r.id === reportType)

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentReport && <currentReport.icon size={28} style={{ color: theme.accent }} />}
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{currentReport?.label || 'Report'}</h1>
            <button
              onClick={() => navigate('/reports')}
              style={{
                padding: '0',
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.accent,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              &larr; Back to Reports
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Date Range Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: theme.textMuted }} />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bgCard,
                color: theme.text,
                fontSize: '13px'
              }}
            />
            <span style={{ color: theme.textMuted }}>to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bgCard,
                color: theme.text,
                fontSize: '13px'
              }}
            />
          </div>

          {/* Action Buttons */}
          <button
            style={{
              padding: '8px 12px',
              backgroundColor: theme.accentBg,
              color: theme.accent,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px'
            }}
            title="Export CSV (Coming Soon)"
          >
            <Download size={16} /> Export
          </button>
          <button
            style={{
              padding: '8px 12px',
              backgroundColor: theme.accentBg,
              color: theme.accent,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px'
            }}
            title="Print (Coming Soon)"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '24px'
      }}>
        {renderReport()}
      </div>
    </div>
  )
}
