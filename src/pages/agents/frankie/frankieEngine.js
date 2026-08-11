import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import {
  invoiceBalance, invoiceCustomerTotal, invoiceDaysOverdue, invoiceStatus,
  isInvoiceOpen, paymentDate, jobIsComplete, jobContractValue,
  jobCostFromLines, expenseCategoryName, unifiedExpenses, cashReconciliation,
} from './frankieFields'

function buildSystemPrompt(user, company, role) {
  return `You are Frankie — the sharp, no-nonsense AI CFO for JobScout.

## Your Identity & Personality
- Name: Frankie. You're the company's virtual CFO — calm, confident, and direct.
- You speak like a seasoned finance pro who keeps things simple. No jargon salad — you translate numbers into plain English.
- You're friendly but focused. Think of a trusted CFO who actually explains things instead of hiding behind spreadsheets.
- You say things like "Here's the bottom line..." or "The numbers tell me..." or "Let me break that down..."
- You're protective of the company's money. If you see waste, you flag it. If margins are thin, you say so.
- You celebrate wins too — "That's a healthy margin, nice work."

## STRICT FORMAT RULES
- NEVER use roleplay actions, stage directions, or asterisk actions like *adjusts glasses*, etc.
- Express personality through your WORDS and tone, not through described actions.
- Format currency with $ and 2 decimal places. Use tables for comparisons.

## Current User
- Name: ${user?.email || 'Unknown'}
- Role: ${role}
- Company: ${company?.name || company?.company_name || 'Unknown'}

## What You Can Do
- Answer questions about cash flow, revenue, expenses, profitability, AR/AP
- Analyze expense patterns and flag anomalies (unusual spikes, duplicate charges)
- Calculate job profitability and crew/team margins
- Provide AR aging analysis and collection recommendations
- Run what-if scenarios (pricing changes, hiring decisions, volume projections)
- Explain burn rate, runway, and financial health
- Break down revenue by customer, job type, or time period
- Compare periods (this month vs last, this quarter vs last)
- Flag overdue invoices and recommend collection actions

## What You Cannot Do
- You cannot modify data — you are read-only
- You cannot access external bank accounts or make payments
- You do not have real-time market data
- You CANNOT guess or estimate data you don't have — be honest about gaps

## CRITICAL: Data Accuracy Rules
- ONLY quote numbers from the "Current Data Context" section below.
- If data is NOT in the context, say so honestly: "I don't have that data in view right now."
- NEVER fabricate numbers, counts, names, or financial figures.
- When data shows zero or empty, say so — don't invent entries.

## Response Style
- Lead with the answer, then explain.
- For financial questions: give the number first, then context.
- Use tables for comparisons and breakdowns.
- Keep responses concise — 2-4 paragraphs max for complex analysis.
- Use bullet points for lists, not paragraphs.
- End with an actionable recommendation when appropriate.

## Role Permissions (${role})
${role === 'user' || role === 'team_lead' ? `- Limited financial access. For detailed financial questions, say: "That's above my clearance for your role. Your admin or owner can pull that up."` : ''}
${role === 'manager' ? `- Can see job costs and basic financial summaries. Cannot see payroll or detailed P&L.` : ''}
${role === 'admin' || role === 'super_admin' || role === 'developer' ? `- Full financial access. Show everything — revenue, expenses, margins, AR/AP, profitability, burn rate.` : ''}

## About JobScout Financial Data
JobScout tracks: invoices (with line items, taxes, discounts), payments (method, processor fees), expenses (categorized, with receipts), jobs (with contract amounts, labor/material/other costs), and customers. You have access to all of this for financial analysis.`
}

function assembleFinancialContext() {
  const state = useStore.getState()
  const invoices = state.invoices || []
  const payments = state.payments || []
  // Combine manual entries with bank-fed Plaid debits. See
  // frankieFields.unifiedExpenses — without this Frankie tells the AI
  // "you have $0 in expenses" for any tenant whose spend is auto-imported
  // from a bank (i.e., most of them).
  const plaidTransactions = state.plaidTransactions || []
  const expenses = unifiedExpenses(state.expenses || [], plaidTransactions)
  const jobs = state.jobs || []
  const customers = state.customers || []
  const employees = state.employees || []

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  let context = ''

  // Summary stats
  context += `### Financial Summary\n`
  context += `- Total Invoices: ${invoices.length}\n`
  context += `- Total Payments: ${payments.length}\n`
  context += `- Total Expenses: ${expenses.length}\n`
  context += `- Total Jobs: ${jobs.length}\n`
  context += `- Total Customers: ${customers.length}\n\n`

  // Payments index for invoiceBalance.
  const paymentsByInv = new Map()
  for (const p of payments) {
    if (!p.invoice_id) continue
    paymentsByInv.set(p.invoice_id, (paymentsByInv.get(p.invoice_id) || 0) + (Number(p.amount) || 0))
  }

  // Revenue (last 30 days) — uses paymentDate helper for the right column.
  const recentPayments = payments.filter(p => {
    const d = paymentDate(p); return d && new Date(d) >= thirtyDaysAgo
  })
  const revenue30d = recentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const prevPayments = payments.filter(p => {
    const d = paymentDate(p); if (!d) return false
    const t = new Date(d); return t >= sixtyDaysAgo && t < thirtyDaysAgo
  })
  const revenuePrev30d = prevPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  context += `### Revenue\n`
  context += `- Last 30 days: $${revenue30d.toFixed(2)}\n`
  context += `- Previous 30 days: $${revenuePrev30d.toFixed(2)}\n`
  context += `- Total collected (all time): $${payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toFixed(2)}\n\n`

  // Cash reconciliation — recorded revenue (books / payments table) vs bank
  // cash-in (Plaid deposits). Revenue stays attributed to customers/jobs;
  // the bank is the completeness check. "Unmatched" = money that hit the
  // bank but was never booked as a payment — the reconciliation gap. Bank
  // deposits load from the same plaid_transactions feed as expenses, so if
  // it looks thin the feed may still be syncing.
  const reconAll = cashReconciliation(payments, plaidTransactions, null, now)
  const recon30 = cashReconciliation(payments, plaidTransactions, thirtyDaysAgo, now)
  context += `### Cash Reconciliation (bank vs books)\n`
  context += `- Recorded revenue is the books (payments table); bank cash-in is Plaid deposits (negative-amount transactions, transfers excluded).\n`
  context += `- Last 30 days — recorded revenue: $${recon30.recordedRevenue.toFixed(2)}, bank cash-in: $${recon30.bankCashIn.toFixed(2)}, unmatched deposits: $${recon30.unmatchedTotal.toFixed(2)} (${recon30.unmatchedCount})\n`
  context += `- All time — recorded revenue: $${reconAll.recordedRevenue.toFixed(2)}, bank cash-in: $${reconAll.bankCashIn.toFixed(2)}, unmatched deposits: $${reconAll.unmatchedTotal.toFixed(2)} (${reconAll.unmatchedCount})\n`
  if (reconAll.unmatchedCount > 0) {
    context += `- ${reconAll.unmatchedCount} bank deposits totaling $${reconAll.unmatchedTotal.toFixed(2)} haven't been matched to a recorded payment. That's cash in the bank not yet booked as revenue — recommend reconciling these in Books → Money.\n`
  } else {
    context += `- Every bank deposit is matched to a recorded payment — books and bank agree.\n`
  }
  context += '\n'

  // Payment methods breakdown — actual column is `method`, not `payment_method`.
  const methodBreakdown = {}
  recentPayments.forEach(p => {
    const method = p.method || p.payment_method || 'Unknown'
    methodBreakdown[method] = (methodBreakdown[method] || 0) + (parseFloat(p.amount) || 0)
  })
  if (Object.keys(methodBreakdown).length > 0) {
    context += `### Payment Methods (Last 30d)\n`
    Object.entries(methodBreakdown).forEach(([method, amount]) => {
      context += `- ${method}: $${amount.toFixed(2)}\n`
    })
    context += '\n'
  }

  // Expenses (last 30 days)
  const recentExpenses = expenses.filter(e => new Date(e.expense_date) >= thirtyDaysAgo)
  const expenses30d = recentExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const prevExpenses = expenses.filter(e => {
    const d = new Date(e.expense_date)
    return d >= sixtyDaysAgo && d < thirtyDaysAgo
  })
  const expensesPrev30d = prevExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

  context += `### Expenses\n`
  context += `- Last 30 days: $${expenses30d.toFixed(2)}\n`
  context += `- Previous 30 days: $${expensesPrev30d.toFixed(2)}\n`
  context += `- Net Cash Flow (30d): $${(revenue30d - expenses30d).toFixed(2)}\n\n`

  // Expense categories — expense.category is a JOIN, use helper for the name.
  const catBreakdown = {}
  recentExpenses.forEach(e => {
    const cat = expenseCategoryName(e)
    catBreakdown[cat] = (catBreakdown[cat] || 0) + (parseFloat(e.amount) || 0)
  })
  if (Object.keys(catBreakdown).length > 0) {
    context += `### Expense Categories (Last 30d)\n`
    Object.entries(catBreakdown)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, amount]) => {
        context += `- ${cat}: $${amount.toFixed(2)}\n`
      })
    context += '\n'
  }

  // Burn rate
  const expenses90d = expenses.filter(e => new Date(e.expense_date) >= ninetyDaysAgo)
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  context += `### Burn Rate\n`
  context += `- 90-day expense total: $${expenses90d.toFixed(2)}\n`
  context += `- Monthly burn rate (avg): $${(expenses90d / 3).toFixed(2)}\n\n`

  // Accounts Receivable — every helper goes through frankieFields so the
  // numbers Frankie tells the user match what they see in Books / Invoices.
  const unpaid = invoices.filter(inv => isInvoiceOpen(inv) && invoiceBalance(inv, paymentsByInv) > 0)
  const totalAR = unpaid.reduce((sum, inv) => sum + invoiceBalance(inv, paymentsByInv), 0)
  const overdue = unpaid.filter(inv => invoiceDaysOverdue(inv, now) > 0)
  const totalOverdue = overdue.reduce((sum, inv) => sum + invoiceBalance(inv, paymentsByInv), 0)

  context += `### Accounts Receivable\n`
  context += `- Total AR: $${totalAR.toFixed(2)} (${unpaid.length} invoices)\n`
  context += `- Overdue: $${totalOverdue.toFixed(2)} (${overdue.length} invoices)\n`

  // AR Aging
  const aging = { current: 0, days30: 0, days60: 0, days90plus: 0 }
  unpaid.forEach(inv => {
    const days = invoiceDaysOverdue(inv, now)
    const bal = invoiceBalance(inv, paymentsByInv)
    if (days === 0) aging.current += bal
    else if (days <= 30) aging.days30 += bal
    else if (days <= 60) aging.days60 += bal
    else aging.days90plus += bal
  })
  context += `- Current: $${aging.current.toFixed(2)}\n`
  context += `- 1-30 days: $${aging.days30.toFixed(2)}\n`
  context += `- 31-60 days: $${aging.days60.toFixed(2)}\n`
  context += `- 90+ days: $${aging.days90plus.toFixed(2)}\n\n`

  // Overdue invoice details (top 10)
  if (overdue.length > 0) {
    context += `### Overdue Invoice Details (top 10)\n`
    overdue.slice(0, 10).forEach(inv => {
      const days = invoiceDaysOverdue(inv, now)
      const bal = invoiceBalance(inv, paymentsByInv)
      context += `- ${inv.invoice_id || inv.invoice_number || '#' + inv.id}: ${inv.customer?.name || 'Unknown'} — $${bal.toFixed(2)} (${days} days overdue)\n`
    })
    context += '\n'
  }

  // Job Profitability — completed jobs use jobIsComplete (covers Completed,
  // Verified Complete, Paid, Closed, etc.) and jobContractValue (job_total
  // column). Cost data lives on job_lines.labor_cost; not yet wired into
  // the engine so we report "cost data not yet captured" when it's 0.
  const completedJobs = jobs.filter(jobIsComplete)
  if (completedJobs.length > 0) {
    context += `### Job Profitability (${completedJobs.length} completed jobs)\n`
    let totalContract = 0, totalCost = 0
    completedJobs.forEach(j => {
      totalContract += jobContractValue(j)
      totalCost += jobCostFromLines(j.id, [])
    })
    context += `- Total contract value: $${totalContract.toFixed(2)}\n`
    if (totalCost > 0) {
      const avgMargin = totalContract > 0 ? ((totalContract - totalCost) / totalContract * 100) : 0
      context += `- Total cost: $${totalCost.toFixed(2)}\n`
      context += `- Total profit: $${(totalContract - totalCost).toFixed(2)}\n`
      context += `- Average margin: ${avgMargin.toFixed(1)}%\n\n`
    } else {
      context += `- Cost data not yet captured on job lines — margin analysis unavailable. Recommend capturing labor_cost on job_lines for future profitability tracking.\n\n`
    }

    // Top 10 most recent completed jobs
    context += `### Recent Completed Jobs (up to 10)\n`
    completedJobs.slice(0, 10).forEach(j => {
      const contract = jobContractValue(j)
      context += `- ${j.job_title || j.job_id || '#' + j.id}: Contract $${contract.toFixed(2)}\n`
    })
    context += '\n'
  }

  // Active jobs summary
  const activeJobs = jobs.filter(j => j.status === 'In Progress' || j.status === 'Scheduled')
  if (activeJobs.length > 0) {
    context += `### Active Jobs (${activeJobs.length})\n`
    let totalPipeline = 0
    activeJobs.forEach(j => { totalPipeline += jobContractValue(j) })
    context += `- Pipeline value: $${totalPipeline.toFixed(2)}\n`
    context += `- Scheduled: ${activeJobs.filter(j => j.status === 'Scheduled').length}\n`
    context += `- In Progress: ${activeJobs.filter(j => j.status === 'In Progress').length}\n\n`
  }

  // Invoice status breakdown — actual column is payment_status.
  const invStatuses = {}
  invoices.forEach(inv => {
    const s = invoiceStatus(inv)
    invStatuses[s] = (invStatuses[s] || 0) + 1
  })
  context += `### Invoice Status Breakdown\n`
  Object.entries(invStatuses).forEach(([s, count]) => {
    context += `- ${s}: ${count}\n`
  })
  context += '\n'

  // Top customers by revenue (from payments)
  const customerRevenue = {}
  payments.forEach(p => {
    const name = p.customer?.name || (p.customer_id ? `Customer #${p.customer_id}` : 'Unknown')
    customerRevenue[name] = (customerRevenue[name] || 0) + (parseFloat(p.amount) || 0)
  })
  const topCustomers = Object.entries(customerRevenue).sort(([, a], [, b]) => b - a).slice(0, 10)
  if (topCustomers.length > 0) {
    context += `### Top Customers by Revenue\n`
    topCustomers.forEach(([name, amount]) => {
      context += `- ${name}: $${amount.toFixed(2)}\n`
    })
    context += '\n'
  }

  // Employee count
  context += `### Team\n`
  context += `- Total employees: ${employees.length}\n`
  const activeEmps = employees.filter(e => e.status === 'Active' || e.status === 'active')
  context += `- Active: ${activeEmps.length}\n\n`

  // Crew profitability — the hellofrank marquee question ("Which crew is
  // actually profitable?"). Roll completed jobs (last 90 days) up by
  // assigned_team, with real punched hours from time_clock entries.
  // Labor cost uses each employee's pay_rate when present, otherwise a
  // $35/hr blended placeholder (flagged in the context so Frankie says so).
  const timeLogs = state.timeLogs || []
  const ninetyDaysAgo90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const completed90 = jobs.filter(j => jobIsComplete(j) && (j.completed_at || j.last_status_change_at) && new Date(j.completed_at || j.last_status_change_at) >= ninetyDaysAgo90)
  if (completed90.length > 0) {
    const rateByEmp = new Map()
    employees.forEach(e => rateByEmp.set(e.id, parseFloat(e.pay_rate) || parseFloat(e.hourly_rate) || 0))
    const hoursByJob = new Map()
    const laborByJob = new Map()
    timeLogs.forEach(t => {
      if (!t.job_id) return
      const hrs = parseFloat(t.total_hours) || parseFloat(t.hours) || 0
      if (!(hrs > 0)) return
      hoursByJob.set(t.job_id, (hoursByJob.get(t.job_id) || 0) + hrs)
      const rate = rateByEmp.get(t.employee_id) || 35
      laborByJob.set(t.job_id, (laborByJob.get(t.job_id) || 0) + hrs * rate)
    })
    const crews = {}
    completed90.forEach(j => {
      const crew = (j.assigned_team || '').trim() || 'Unassigned'
      if (!crews[crew]) crews[crew] = { jobs: 0, revenue: 0, hours: 0, labor: 0 }
      crews[crew].jobs++
      crews[crew].revenue += jobContractValue(j)
      crews[crew].hours += hoursByJob.get(j.id) || 0
      crews[crew].labor += laborByJob.get(j.id) || 0
    })
    context += `### Crew Profitability (completed jobs, last 90 days; labor = punched hours × pay rate, $35/hr placeholder when no rate on file)\n`
    Object.entries(crews).sort(([, a], [, b]) => b.revenue - a.revenue).forEach(([crew, c]) => {
      const marginPct = c.revenue > 0 ? (((c.revenue - c.labor) / c.revenue) * 100).toFixed(0) : '—'
      const perHour = c.hours > 0 ? (c.revenue / c.hours).toFixed(0) : '—'
      context += `- ${crew}: ${c.jobs} jobs, $${c.revenue.toFixed(0)} revenue, ${c.hours.toFixed(1)}h punched, $${c.labor.toFixed(0)} labor → ${marginPct}% gross margin after labor, $${perHour}/hr revenue\n`
    })
    context += '\n'
  }

  return context
}

async function callClaude(conversationHistory, systemPrompt, dataContext, onChunk) {
  const contextMessage = dataContext
    ? `\n\n## Current Data Context (REAL DATA — use ONLY these facts)\n${dataContext}`
    : '\n\n## Current Data Context\nNo financial data available. If the user asks about numbers, let them know data is still loading.'

  const messages = conversationHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content,
  }))

  const fullSystemPrompt = systemPrompt + contextMessage

  const { data, error } = await supabase.functions.invoke('arnie-chat', {
    body: {
      messages,
      systemPrompt: fullSystemPrompt,
      sessionId: null,
    },
  })

  if (error) {
    let detail = error.message || 'Failed to call AI'
    if (error.context?.body) {
      try {
        const reader = error.context.body.getReader()
        const { value } = await reader.read()
        const text = new TextDecoder().decode(value)
        const parsed = JSON.parse(text)
        detail = parsed.error || parsed.details || text
      } catch {}
    }
    console.error('[Frankie Engine] Edge function error:', detail)
    throw new Error(detail)
  }

  if (data?.error) {
    console.error('[Frankie Engine] AI error:', data.error, data.details)
    throw new Error(data.error)
  }

  const reply = data?.reply || ''
  onChunk(reply)
  return reply
}

function getUserRole() {
  const state = useStore.getState()
  const employee = state.employee
  const role = employee?.role || 'user'
  const userId = employee?.id
  return { role, userId }
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export async function sendMessageStream(message, history = [], onChunk) {
  const { role } = getUserRole()
  const { user, company } = useStore.getState()

  const systemPrompt = buildSystemPrompt(user, company, role)
  const dataContext = assembleFinancialContext()

  const conversationHistory = [
    ...history,
    { role: 'user', content: message }
  ]

  return await callClaude(conversationHistory, systemPrompt, dataContext, onChunk)
}

// Session management — reuses ai_sessions table with module='frankie'
export async function createSession(title) {
  const { companyId, user } = useStore.getState()
  const sessionId = generateId()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('ai_sessions')
    .insert({
      company_id: companyId,
      session_id: sessionId,
      user_email: user?.email,
      started: now,
      last_activity: now,
      status: 'active',
      current_module: 'frankie',
      context_json: JSON.stringify({ title: title || 'Financial conversation' })
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session:', error)
    return null
  }
  return data
}

export async function saveMessage(sessionId, role, content) {
  if (!sessionId) return null
  const { companyId } = useStore.getState()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('ai_messages')
    .insert({
      company_id: companyId,
      message_id: generateId(),
      session_id: sessionId,
      timestamp: now,
      role,
      content,
      module_used: 'frankie'
    })

  if (error) console.error('Error saving message:', error)

  await supabase
    .from('ai_sessions')
    .update({ last_activity: now })
    .eq('session_id', sessionId)
}

export async function loadSessions() {
  const { companyId, user } = useStore.getState()
  const { data, error } = await supabase
    .from('ai_sessions')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_email', user?.email)
    .eq('current_module', 'frankie')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error loading sessions:', error)
    return []
  }

  return (data || []).map(s => {
    let title = 'Financial conversation'
    try { title = JSON.parse(s.context_json || '{}').title || title } catch {}
    return { ...s, title }
  })
}

export async function loadSessionMessages(sessionId) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true })

  if (error) {
    console.error('Error loading messages:', error)
    return []
  }
  return data || []
}

export async function deleteSession(sessionId) {
  await supabase.from('ai_messages').delete().eq('session_id', sessionId)
  await supabase.from('ai_sessions').delete().eq('session_id', sessionId)
}
