import { useStore } from '../../../lib/store'
import { getAccessLevel, ACCESS_LEVELS } from '../../../lib/accessControl'

// Role helpers — accept role string from getUserRole()
const isOwner = (role) => ['developer', 'super_admin'].includes(role)
const isAdmin = (role) => ['developer', 'super_admin', 'admin'].includes(role)

function getUserRole() {
  const { user, employees } = useStore.getState()
  if (!user) return { role: 'user', userId: null, employee: null }

  // Safe guard: if employees haven't loaded yet, fall back to user object directly
  const empList = employees || []
  const employee = empList.length > 0
    ? empList.find(e => e.email === user.email)
    : null

  // If no employee record found, try user.user_role directly
  if (!employee) {
    const directRole = user.user_role || user.role || 'user'
    const roleMap = { developer: 'developer', super_admin: 'super_admin', admin: 'admin', manager: 'manager', team_lead: 'team_lead' }
    return { role: roleMap[directRole] || 'user', userId: null, employee: null }
  }

  const level = getAccessLevel(employee)
  let role = 'user'
  if (level >= ACCESS_LEVELS.DEVELOPER) role = 'developer'
  else if (level >= ACCESS_LEVELS.SUPER_ADMIN) role = 'super_admin'
  else if (level >= ACCESS_LEVELS.ADMIN) role = 'admin'
  else if (level >= ACCESS_LEVELS.MANAGER) role = 'manager'
  else if (level >= ACCESS_LEVELS.TEAM_LEAD) role = 'team_lead'

  return { role, userId: employee?.id, employee }
}

// Returns counts of loaded records so Gemini knows what data it actually has
export function getDataLoadStatus() {
  const state = useStore.getState()
  return {
    employees: (state.employees || []).length,
    jobs: (state.jobs || []).length,
    leads: (state.leads || []).length,
    customers: (state.customers || []).length,
    products: (state.products || []).length,
    invoices: (state.invoices || []).length,
    expenses: (state.expenses || []).length,
    payments: (state.payments || []).length,
    leadPayments: (state.leadPayments || []).length,
    inventory: (state.inventory || []).length,
    quotes: (state.quotes || []).length,
    fleet: (state.fleet || []).length,
    lightingAudits: (state.lightingAudits || []).length,
    routes: (state.routes || []).length,
    timeLogs: (state.timeLogs || []).length,
    appointments: (state.appointments || []).length,
    communications: (state.communications || []).length,
  }
}

export function getJobs(role, userId) {
  const { jobs } = useStore.getState()
  let filtered = jobs || []

  if (!isAdmin(role)) {
    filtered = filtered.filter(j => j.assigned_to === userId)
  }

  const byStatus = {}
  filtered.forEach(j => {
    const s = j.status || 'unknown'
    byStatus[s] = (byStatus[s] || 0) + 1
  })

  const now = new Date()
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const yearStart = new Date(now.getFullYear(), 0, 1)

  const upcoming = filtered
    .filter(j => j.scheduled_date && new Date(j.scheduled_date) >= now)
    .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
    .slice(0, 10)

  const thisWeek = filtered.filter(j => {
    if (!j.scheduled_date) return false
    const d = new Date(j.scheduled_date)
    return d >= now && d <= weekEnd
  })

  // Date-bucketed counts using start_date or scheduled_date
  const dateOf = (j) => j.start_date || j.scheduled_date || j.created_at
  const inRange = (j, start, end) => {
    const d = dateOf(j)
    if (!d) return false
    const dt = new Date(d)
    return dt >= start && (!end || dt <= end)
  }
  const thisMonth = filtered.filter(j => inRange(j, monthStart, null))
  const lastMonth = filtered.filter(j => inRange(j, lastMonthStart, lastMonthEnd))
  const ytd = filtered.filter(j => inRange(j, yearStart, null))

  // Group by month (last 12 months)
  const byMonth = {}
  filtered.forEach(j => {
    const d = dateOf(j)
    if (!d) return
    const key = String(d).slice(0, 7) // YYYY-MM
    byMonth[key] = (byMonth[key] || 0) + 1
  })

  return {
    total: filtered.length,
    byStatus,
    upcoming: upcoming.map(j => ({ id: j.id, name: j.name || j.title, status: j.status, date: j.scheduled_date, customer: j.customer_name })),
    thisWeek: thisWeek.length,
    thisMonth: thisMonth.length,
    lastMonth: lastMonth.length,
    ytd: ytd.length,
    byMonth
  }
}

export function getProducts() {
  const { products } = useStore.getState()
  const items = products || []

  const byType = {}
  items.forEach(p => {
    const t = p.type || p.service_type || 'other'
    byType[t] = (byType[t] || 0) + 1
  })

  return {
    total: items.length,
    byType,
    items: items.slice(0, 20).map(p => ({
      id: p.id,
      name: p.name,
      type: p.type || p.service_type,
      price: p.unit_price
    }))
  }
}

export function getInventory(role, userId) {
  const { inventory } = useStore.getState()
  let items = inventory || []

  if (!isAdmin(role)) {
    items = items.filter(i => i.assigned_to === userId)
  }

  const lowStock = items.filter(i => i.quantity <= (i.reorder_point || 5))
  const byLocation = {}
  items.forEach(i => {
    const loc = i.location || 'unassigned'
    byLocation[loc] = (byLocation[loc] || 0) + 1
  })

  return {
    total: items.length,
    lowStock: lowStock.slice(0, 10).map(i => ({ name: i.name || i.product_name, quantity: i.quantity, location: i.location })),
    byLocation
  }
}

export function getCustomers(role, userId) {
  const { customers } = useStore.getState()
  let items = customers || []

  if (!isAdmin(role)) {
    items = items.filter(c => c.assigned_to === userId || c.created_by === userId)
  }

  const active = items.filter(c => c.status === 'active' || !c.status).length
  const recent = items
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 10)

  return {
    total: items.length,
    active,
    recent: recent.map(c => ({ id: c.id, name: c.name || c.company_name, email: c.email, phone: c.phone }))
  }
}

export function getLeads(role) {
  if (!isAdmin(role)) return { restricted: true, message: 'Lead data requires admin access.' }

  const { leads, employees } = useStore.getState()
  const items = leads || []
  const empList = employees || []

  // Helper to resolve employee name from id
  const empName = (id) => {
    if (!id) return 'Unassigned'
    const emp = empList.find(e => e.id === id)
    return emp?.name || 'Unknown'
  }

  const byStatus = {}
  items.forEach(l => {
    const s = l.status || 'new'
    byStatus[s] = (byStatus[s] || 0) + 1
  })

  // Per-salesperson breakdown (by salesperson_id or source_employee)
  const bySalesperson = {}
  items.forEach(l => {
    const spId = l.salesperson_id || l.lead_source_employee_id
    const name = l.source_employee?.name || empName(spId)
    if (!bySalesperson[name]) bySalesperson[name] = { count: 0, value: 0, won: 0, wonValue: 0 }
    bySalesperson[name].count++
    bySalesperson[name].value += parseFloat(l.estimated_value || l.value || 0)
    if (l.status === 'won' || l.status === 'closed_won' || l.status === 'sold') {
      bySalesperson[name].won++
      bySalesperson[name].wonValue += parseFloat(l.estimated_value || l.value || 0)
    }
  })

  // This month's leads
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thisMonth = items.filter(l => l.created_at >= monthStart)
  const thisMonthBySalesperson = {}
  thisMonth.forEach(l => {
    const spId = l.salesperson_id || l.lead_source_employee_id
    const name = l.source_employee?.name || empName(spId)
    if (!thisMonthBySalesperson[name]) thisMonthBySalesperson[name] = { count: 0, value: 0, won: 0, wonValue: 0 }
    thisMonthBySalesperson[name].count++
    thisMonthBySalesperson[name].value += parseFloat(l.estimated_value || l.value || 0)
    if (l.status === 'won' || l.status === 'closed_won' || l.status === 'sold') {
      thisMonthBySalesperson[name].won++
      thisMonthBySalesperson[name].wonValue += parseFloat(l.estimated_value || l.value || 0)
    }
  })

  const hot = items
    .filter(l => l.priority === 'hot' || l.temperature === 'hot' || l.status === 'qualified')
    .slice(0, 10)

  const recent = items.slice(0, 15)

  return {
    total: items.length,
    thisMonthCount: thisMonth.length,
    byStatus,
    bySalesperson,
    thisMonthBySalesperson,
    hot: hot.map(l => ({ id: l.id, name: l.name || l.company_name, status: l.status, value: l.estimated_value, salesperson: l.source_employee?.name || empName(l.salesperson_id || l.lead_source_employee_id) })),
    recent: recent.map(l => ({ id: l.id, name: l.name || l.company_name, status: l.status, value: l.estimated_value, salesperson: l.source_employee?.name || empName(l.salesperson_id || l.lead_source_employee_id), date: l.created_at }))
  }
}

export function getEmployees(role) {
  const { employees } = useStore.getState()
  const items = employees || []

  if (!isAdmin(role)) {
    return {
      total: items.length,
      list: items.map(e => ({ name: e.name, role: e.role }))
    }
  }

  if (!isOwner(role)) {
    return {
      total: items.length,
      list: items.map(e => ({ id: e.id, name: e.name, role: e.role, email: e.email, phone: e.phone }))
    }
  }

  return {
    total: items.length,
    list: items.map(e => ({
      id: e.id, name: e.name, role: e.role, email: e.email,
      phone: e.phone, pay_rate: e.pay_rate, pay_type: e.pay_type
    }))
  }
}

export function getFinancials(role) {
  if (!isOwner(role)) return { restricted: true, message: 'Financial data requires owner access.' }

  const { invoices, expenses, payments, leadPayments } = useStore.getState()
  const invItems = invoices || []
  const expItems = expenses || []
  const payItems = payments || []
  const depositItems = leadPayments || []

  const totalInvoiced = invItems.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0)
  const totalPaid = payItems.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const totalExpenses = expItems.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const totalDeposits = depositItems.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)

  const unpaid = invItems.filter(i => i.status === 'sent' || i.status === 'overdue' || i.payment_status === 'Pending' || i.payment_status === 'Overdue')

  // Date helpers
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const yearStart = new Date(now.getFullYear(), 0, 1)

  const sumInRange = (items, dateField, valueField, start, end) =>
    items
      .filter(i => {
        const d = i[dateField]
        if (!d) return false
        const dt = new Date(d)
        return dt >= start && (!end || dt <= end)
      })
      .reduce((s, i) => s + (parseFloat(i[valueField]) || 0), 0)

  // Per-period revenue/expenses
  const revenueThisMonth = sumInRange(payItems, 'date', 'amount', monthStart, null)
  const revenueLastMonth = sumInRange(payItems, 'date', 'amount', lastMonthStart, lastMonthEnd)
  const revenueYtd = sumInRange(payItems, 'date', 'amount', yearStart, null)
  const expensesThisMonth = sumInRange(expItems, 'date', 'amount', monthStart, null)
  const expensesLastMonth = sumInRange(expItems, 'date', 'amount', lastMonthStart, lastMonthEnd)
  const expensesYtd = sumInRange(expItems, 'date', 'amount', yearStart, null)

  // Per-customer unpaid invoice breakdown (top 15)
  const unpaidByCustomer = {}
  unpaid.forEach(i => {
    const cust = i.customer_name || `Customer #${i.customer_id}` || 'Unknown'
    if (!unpaidByCustomer[cust]) unpaidByCustomer[cust] = { count: 0, totalOwed: 0, oldestDate: null }
    unpaidByCustomer[cust].count++
    unpaidByCustomer[cust].totalOwed += parseFloat(i.balance || i.total || i.amount || 0)
    const d = i.created_at || i.date
    if (d && (!unpaidByCustomer[cust].oldestDate || d < unpaidByCustomer[cust].oldestDate)) {
      unpaidByCustomer[cust].oldestDate = d
    }
  })
  const topUnpaidCustomers = Object.entries(unpaidByCustomer)
    .map(([name, v]) => ({ customer: name, ...v, totalOwed: v.totalOwed.toFixed(2) }))
    .sort((a, b) => parseFloat(b.totalOwed) - parseFloat(a.totalOwed))
    .slice(0, 15)

  // Revenue by month (last 12 months from payments)
  const revenueByMonth = {}
  payItems.forEach(p => {
    if (!p.date) return
    const key = String(p.date).slice(0, 7)
    revenueByMonth[key] = (revenueByMonth[key] || 0) + (parseFloat(p.amount) || 0)
  })
  // Keep only last 12 months sorted
  const last12 = Object.entries(revenueByMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .map(([month, val]) => ({ month, revenue: val.toFixed(2) }))

  // Expense breakdown by category
  const expensesByCategory = {}
  expItems.forEach(e => {
    const cat = e.category || 'Uncategorized'
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (parseFloat(e.amount) || 0)
  })

  // Expense breakdown by business
  const expensesByBusiness = {}
  expItems.forEach(e => {
    const biz = e.business || 'Unassigned'
    expensesByBusiness[biz] = (expensesByBusiness[biz] || 0) + (parseFloat(e.amount) || 0)
  })

  // Deposits breakdown by business
  const depositsByBusiness = {}
  depositItems.forEach(d => {
    const biz = d.business || 'Unassigned'
    depositsByBusiness[biz] = (depositsByBusiness[biz] || 0) + (parseFloat(d.amount) || 0)
  })

  // Recent expenses (last 10)
  const recentExpenses = expItems
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 10)
    .map(e => ({ date: e.date, description: e.description, amount: e.amount, category: e.category, merchant: e.merchant, business: e.business }))

  // Recent deposits (last 10)
  const recentDeposits = depositItems
    .sort((a, b) => new Date(b.date_created || 0) - new Date(a.date_created || 0))
    .slice(0, 10)
    .map(d => ({ date: d.date_created, description: d.description, amount: d.amount, customer: d.lead_customer_name, source: d.lead_source, business: d.business }))

  return {
    totalInvoiced: totalInvoiced.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    totalDeposits: totalDeposits.toFixed(2),
    netIncome: (totalDeposits - totalExpenses).toFixed(2),
    revenue: (totalPaid - totalExpenses).toFixed(2),
    revenueThisMonth: revenueThisMonth.toFixed(2),
    revenueLastMonth: revenueLastMonth.toFixed(2),
    revenueYtd: revenueYtd.toFixed(2),
    expensesThisMonth: expensesThisMonth.toFixed(2),
    expensesLastMonth: expensesLastMonth.toFixed(2),
    expensesYtd: expensesYtd.toFixed(2),
    revenueByMonth: last12,
    unpaidInvoices: unpaid.length,
    totalUnpaidAmount: unpaid.reduce((s, i) => s + parseFloat(i.balance || i.total || 0), 0).toFixed(2),
    topUnpaidCustomers,
    invoiceCount: invItems.length,
    expenseCount: expItems.length,
    depositCount: depositItems.length,
    expensesByCategory,
    expensesByBusiness,
    depositsByBusiness,
    recentExpenses,
    recentDeposits
  }
}

export function getSchedule(role, userId) {
  const { jobs } = useStore.getState()
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)

  let filtered = jobs || []
  if (!isAdmin(role)) {
    filtered = filtered.filter(j => j.assigned_to === userId)
  }

  const jobsByDate = (dateStr) => filtered.filter(j => j.scheduled_date?.startsWith(dateStr))
  const mapJob = (j) => ({ id: j.id, name: j.name || j.title || j.job_title, status: j.status, time: j.scheduled_time, customer: j.customer_name, address: j.job_address || j.address, date: j.scheduled_date })

  const todayJobs = jobsByDate(today)
  const tomorrowJobs = jobsByDate(tomorrowStr)

  // Next 7 days breakdown by date
  const weekJobs = filtered.filter(j => {
    if (!j.scheduled_date) return false
    const d = new Date(j.scheduled_date)
    return d >= now && d <= weekEnd
  })
  const weekByDay = {}
  weekJobs.forEach(j => {
    const d = j.scheduled_date?.split('T')[0] || 'unknown'
    if (!weekByDay[d]) weekByDay[d] = []
    weekByDay[d].push(mapJob(j))
  })

  return {
    today: todayJobs.map(mapJob),
    todayCount: todayJobs.length,
    tomorrow: tomorrowJobs.map(mapJob),
    tomorrowCount: tomorrowJobs.length,
    thisWeek: weekJobs.length,
    weekByDay
  }
}

export function getCompanyContext() {
  const { company } = useStore.getState()
  if (!company) return { name: 'Unknown Company' }

  return {
    name: company.name || company.company_name,
    industry: company.industry,
    services: company.services,
    address: company.address,
    phone: company.phone,
    email: company.email
  }
}

export function getAgentKnowledge() {
  const { companyAgents } = useStore.getState()
  const recruited = (companyAgents || []).map(ca => ca.agent?.full_name || ca.agent?.slug).filter(Boolean)

  return {
    recruitedAgents: recruited,
    availableAgents: [
      { name: 'Lenard', domain: 'Lighting audits, fixture types, utility programs, rebate calculations' },
      { name: 'Freddy', domain: 'Fleet management, vehicle tracking, maintenance scheduling' },
      { name: 'Conrad Connect', domain: 'Email marketing campaigns, templates, automations' },
      { name: 'Victor', domain: 'Photo verification, job documentation, before/after comparisons' }
    ]
  }
}

export function getFleet(role) {
  if (!isAdmin(role)) return { restricted: true, message: 'Fleet data requires admin access.' }

  const { fleet, fleetMaintenance } = useStore.getState()
  const vehicles = fleet || []
  const maintenance = fleetMaintenance || []

  return {
    totalVehicles: vehicles.length,
    vehicles: vehicles.slice(0, 15).map(v => ({
      id: v.id, name: v.name || `${v.year} ${v.make} ${v.model}`,
      status: v.status, mileage: v.mileage
    })),
    upcomingMaintenance: maintenance
      .filter(m => m.status === 'scheduled' || m.status === 'pending')
      .slice(0, 5)
      .map(m => ({ vehicle: m.vehicle_name, type: m.maintenance_type, date: m.scheduled_date }))
  }
}

export function getQuotes(role) {
  if (!isAdmin(role)) return { restricted: true, message: 'Estimate data requires admin access.' }

  const { quotes } = useStore.getState()
  const items = quotes || []

  const byStatus = {}
  items.forEach(q => {
    const s = q.status || 'draft'
    byStatus[s] = (byStatus[s] || 0) + 1
  })

  const totalValue = items.reduce((sum, q) => sum + (parseFloat(q.total) || 0), 0)

  return {
    total: items.length,
    byStatus,
    totalValue: totalValue.toFixed(2),
    recent: items
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 10)
      .map(q => ({ id: q.id, name: q.name || q.title || `Quote #${q.id}`, status: q.status, total: q.total, customer: q.customer_name }))
  }
}

export function getAppointments(role, userId) {
  const { appointments } = useStore.getState()
  let items = appointments || []

  if (!isAdmin(role)) {
    items = items.filter(a => a.assigned_to === userId || a.created_by === userId)
  }

  const now = new Date()
  const upcoming = items
    .filter(a => a.date && new Date(a.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10)

  return {
    total: items.length,
    upcoming: upcoming.map(a => ({
      id: a.id, title: a.title || a.name, date: a.date, time: a.time,
      customer: a.customer_name, status: a.status
    }))
  }
}

export function getLightingAudits(role) {
  if (!isAdmin(role)) return { restricted: true, message: 'Audit data requires admin access.' }

  const { lightingAudits, auditAreas } = useStore.getState()
  const audits = lightingAudits || []
  const areas = auditAreas || []

  const byStatus = {}
  audits.forEach(a => {
    const s = a.status || 'draft'
    byStatus[s] = (byStatus[s] || 0) + 1
  })

  return {
    total: audits.length,
    byStatus,
    totalAreas: areas.length,
    recent: audits
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 10)
      .map(a => ({ id: a.id, name: a.name || a.facility_name, status: a.status, customer: a.customer_name }))
  }
}

export function getRoutes(role) {
  if (!isAdmin(role)) return { restricted: true, message: 'Route data requires admin access.' }

  const { routes } = useStore.getState()
  const items = routes || []

  return {
    total: items.length,
    routes: items.slice(0, 15).map(r => ({
      id: r.id, name: r.name || r.title, date: r.date,
      stopCount: r.stop_count || r.stops?.length, status: r.status
    }))
  }
}

export function getCommunications(role) {
  if (!isAdmin(role)) return { restricted: true, message: 'Communication data requires admin access.' }

  const { communications } = useStore.getState()
  const items = communications || []

  const byType = {}
  items.forEach(c => {
    const t = c.type || c.channel || 'other'
    byType[t] = (byType[t] || 0) + 1
  })

  return {
    total: items.length,
    byType,
    recent: items
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 10)
      .map(c => ({ id: c.id, type: c.type || c.channel, subject: c.subject, date: c.created_at, customer: c.customer_name }))
  }
}

export function getTimeLogs(role, userId) {
  const { timeLogs } = useStore.getState()
  let items = timeLogs || []

  if (!isAdmin(role)) {
    items = items.filter(t => t.employee_id === userId)
  }

  const clockedIn = items.filter(t => t.is_clocked_in)
  const totalHours = items.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0)

  return {
    total: items.length,
    currentlyClockedIn: clockedIn.length,
    totalHoursLogged: totalHours.toFixed(1),
    clockedIn: clockedIn.map(t => ({ employee: t.employee_name, job: t.job_name || t.job_id, since: t.clock_in_time })),
    recent: items
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 10)
      .map(t => ({ employee: t.employee_name, job: t.job_name, hours: t.hours, date: t.date || t.created_at }))
  }
}

// Get the user's current page context — what are they looking at right now?
export function getCurrentPageContext(userId) {
  const path = window.location.pathname
  const state = useStore.getState()
  const { jobs, jobLines, timeLogs, customers, products } = state
  const jobSections = state.jobSections || []

  const context = { page: path }

  // On a job detail page?
  const jobMatch = path.match(/\/jobs\/(\d+)/)
  if (jobMatch) {
    const jobId = parseInt(jobMatch[1])
    const job = jobs.find(j => j.id === jobId)
    if (job) {
      context.viewingJob = buildJobContext(job, jobId, jobLines, jobSections, customers, products, userId)
    }
  }

  return context
}

// Get active job(s) the tech is clocked into right now
export function getActiveJobContext(userId) {
  const state = useStore.getState()
  const { jobs, jobLines, timeLogs, customers, products } = state
  const jobSections = state.jobSections || []

  // Find time_log entries where this employee is currently clocked in
  const activeTimeLogs = (timeLogs || []).filter(
    t => t.employee_id === userId && t.is_clocked_in
  )

  if (activeTimeLogs.length === 0) return null

  const activeJobs = []
  for (const tl of activeTimeLogs) {
    const job = jobs.find(j => j.id === tl.job_id)
    if (job) {
      activeJobs.push({
        ...buildJobContext(job, job.id, jobLines, jobSections, customers, products, userId),
        clockedInSince: tl.clock_in_time,
        hoursLogged: tl.hours
      })
    }
  }

  return activeJobs.length > 0 ? activeJobs : null
}

// Build rich job context for Arnie
function buildJobContext(job, jobId, jobLines, jobSections, customers, products, userId) {
  const lines = (jobLines || []).filter(l => l.job_id === jobId)
  const sections = (jobSections || []).filter(s => s.job_id === jobId)
  const mySections = userId ? sections.filter(s => s.assigned_to === userId) : sections
  const customer = job.customer_id ? (customers || []).find(c => c.id === job.customer_id) : null

  return {
    id: job.id,
    jobId: job.job_id,
    title: job.job_title || job.name || job.title,
    status: job.status,
    address: job.job_address || job.address,
    details: job.details,
    scheduledDate: job.start_date,
    allottedHours: job.allotted_time_hours,
    timeTracked: job.time_tracked,
    customer: customer ? {
      name: customer.name || customer.company_name || customer.business_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address
    } : null,
    lineItems: lines.map(l => {
      const prod = products?.find(p => p.id === l.item_id)
      return {
        product: prod?.name || l.description || 'Item',
        description: l.description || prod?.description,
        quantity: l.quantity,
        price: l.price,
        notes: l.notes
      }
    }),
    allSections: sections.map(s => ({
      name: s.name,
      description: s.description,
      status: s.status,
      assignedTo: s.assigned_employee?.name || s.assigned_to,
      estimatedHours: s.estimated_hours,
      actualHours: s.actual_hours,
      scheduledDate: s.scheduled_date,
      percentOfJob: s.percent_of_job
    })),
    mySections: mySections.map(s => ({
      name: s.name,
      description: s.description,
      status: s.status,
      estimatedHours: s.estimated_hours,
      actualHours: s.actual_hours,
      scheduledDate: s.scheduled_date
    })),
    sectionProgress: sections.length > 0
      ? `${sections.filter(s => s.status === 'Complete' || s.status === 'Verified').length}/${sections.length} complete`
      : 'No sections defined'
  }
}

// Main function to assemble data context based on detected intent
// Each domain is wrapped in try-catch so one crash doesn't kill all data
export function assembleDataContext(domains, role, userId) {
  const sections = []

  // Always inject data load status first
  try {
    const status = getDataLoadStatus()
    sections.push({ label: 'Data Load Status (record counts available)', data: status })
  } catch (e) {
    console.error('[Arnie Tools] getDataLoadStatus failed:', e)
  }

  for (const domain of domains) {
    try {
      switch (domain) {
        case 'jobs':
          sections.push({ label: 'Jobs', data: getJobs(role, userId) })
          break
        case 'products':
          sections.push({ label: 'Products & Services', data: getProducts() })
          break
        case 'inventory':
          sections.push({ label: 'Inventory', data: getInventory(role, userId) })
          break
        case 'customers':
          sections.push({ label: 'Customers', data: getCustomers(role, userId) })
          break
        case 'leads':
          sections.push({ label: 'Leads/Deals', data: getLeads(role) })
          break
        case 'employees':
          sections.push({ label: 'Team/Employees', data: getEmployees(role) })
          break
        case 'financials':
          sections.push({ label: 'Financials', data: getFinancials(role) })
          break
        case 'schedule':
          sections.push({ label: 'Schedule', data: getSchedule(role, userId) })
          break
        case 'company':
          sections.push({ label: 'Company Info', data: getCompanyContext() })
          break
        case 'agents':
          sections.push({ label: 'AI Agents', data: getAgentKnowledge() })
          break
        case 'fleet':
          sections.push({ label: 'Fleet', data: getFleet(role) })
          break
        case 'quotes':
          sections.push({ label: 'Estimates', data: getQuotes(role) })
          break
        case 'appointments':
          sections.push({ label: 'Appointments', data: getAppointments(role, userId) })
          break
        case 'audits':
          sections.push({ label: 'Lighting Audits', data: getLightingAudits(role) })
          break
        case 'routes':
          sections.push({ label: 'Routes', data: getRoutes(role) })
          break
        case 'communications':
          sections.push({ label: 'Communications', data: getCommunications(role) })
          break
        case 'timeLogs':
          sections.push({ label: 'Time Logs', data: getTimeLogs(role, userId) })
          break
        case 'currentPage':
          sections.push({ label: 'Current Page Context', data: getCurrentPageContext(userId) })
          break
        case 'activeJob': {
          const active = getActiveJobContext(userId)
          if (active) sections.push({ label: 'Job(s) You Are Clocked Into Right Now', data: active })
          break
        }
      }
    } catch (e) {
      console.error(`[Arnie Tools] Domain "${domain}" failed:`, e)
      sections.push({ label: domain, data: { error: `Failed to load ${domain} data` } })
    }
  }

  if (sections.length === 0) return ''

  return sections
    .map(s => `### ${s.label}\n${JSON.stringify(s.data, null, 2)}`)
    .join('\n\n')
}

export { getUserRole }
