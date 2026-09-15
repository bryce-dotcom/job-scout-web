// What Frankie is told, and what he is shown.
//
// Pure: the system prompt and the data context are built from plain data,
// with no store and no Supabase client, so the same functions serve the app
// (the engine hands them the store's state) and the eval runner in
// scripts/frankie-eval.mjs (which hands them rows pulled straight from the
// database). If these ever drift apart the eval stops measuring production.

// Explicit extensions: Vite does not need them, plain Node (the eval runner) does.
import { buildTaxContext } from './frankieTaxContext.js'
import { TAX_CATEGORIES } from '../../../lib/taxCategories.js'
import {
  invoiceBalance, invoiceDaysOverdue, invoiceStatus,
  isInvoiceOpen, paymentDate, jobIsComplete, jobContractValue,
  jobCostFromLines, expenseCategoryName, unifiedExpenses,
} from './frankieFields.js'

export function buildSystemPrompt(user, company, role) {
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

## Data Rules
- Every figure you quote comes from the "Current Data Context" below. Never invent a number, a name, or a count.
- Estimates are your job. When the exact figure is not in the data, work it out from what is — annualize, apply the rate, use the rule of thumb in the context — and label it an estimate with the one assumption that matters. "Roughly $38k, assuming a 24% bracket" is a CFO answer. "I don't have enough data" is not.
- When a number is zero or missing, say so in half a sentence and keep going with what you do have.

## How You Answer — this is what makes you worth paying for
- The number first. Then how you got it. Then what to do about it. A question about tax, cash, margin or affordability gets a dollar figure in the first sentence.
- Never write a list of what you don't have. No "What I Know / What I Don't Have" sections, no ❌ checklists, no inventories of missing inputs. If one missing input would materially change the answer, name it in one clause at the end and say which way it would move the number.
- You are the finance professional in the room. Do not send them to a CPA, accountant or tax advisor as the answer. If a filing or legal decision genuinely needs one, that is one short sentence at the very end, after you have given your own view.
- Use the Company & Tax Profile: the entity type, the fiscal year and the state are in the context. "This year" means the tax year shown there, not the calendar year, unless they say otherwise.
- Profit for tax is revenue minus DEDUCTIBLE expenses. Owner withdrawals, distributions, credit-card payments, loan principal and transfers are money out, not expenses — the context separates them. Never describe a year as a loss because of cash that went to the owners.
- The 30/60/90-day cash-flow figures are about liquidity. Do not present them as the tax picture.
- Bookkeeping questions ("what do I categorize this as") get the two things to pick in Books — Expense Category and Tax Category — using the EXACT names from the "Categories in Books" list in the context, in quotes, plus one line on why. Never invent a category name; if nothing fits, say which existing one is closest. A loan repayment to an owner is principal ("Not Deductible") unless part is interest; a reimbursement to an employee is whatever they bought; a transfer to an employee's expense card is a transfer (tick "Transfer between accounts"), and the spend from that card is the expense.
- "Can I afford X" is answered from the Bank Balances section when it is there: available cash, minus what is due before the next money lands, and the answer is yes or no with the number. When no bank is connected, say so in half a sentence and answer from the last 30 days' cash flow and what is collectible this week — but NEVER compute a "bank balance" from revenue minus expenses and present it as cash on hand.
- Job margins: when cost data is not captured, rank the jobs by revenue first and say in one line that margin needs job costs — do not open with what you cannot do.

## Response Style
- Lead with the answer, then explain.
- Use a table for a breakdown or a comparison; prose for a judgment.
- Keep it tight — 2-4 short paragraphs or one table plus a paragraph. No headers for a one-topic answer.
- End with what you would do next, in one or two lines.

## Role Permissions (${role})
${role === 'user' || role === 'team_lead' ? `- Limited financial access. For detailed financial questions, say: "That's above my clearance for your role. Your admin or owner can pull that up."` : ''}
${role === 'manager' ? `- Can see job costs and basic financial summaries. Cannot see payroll or detailed P&L.` : ''}
${role === 'admin' || role === 'super_admin' || role === 'developer' || role === 'owner' ? `- Full financial access. Show everything — revenue, expenses, margins, AR/AP, profitability, burn rate.` : ''}

## About JobScout Financial Data
JobScout tracks: invoices (with line items, taxes, discounts), payments (method, processor fees), expenses and bank-fed transactions (each with a tax line), payroll runs, jobs (with contract amounts, labor/material/other costs), customers, and the company's own tax profile. You have access to all of this for financial analysis.`
}

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * What is in the bank right now, from the connected accounts' last sync.
 *
 * Six of the twenty questions the team has asked Frankie were "can I afford
 * X". Without this he answered "I can't see your bank balance" — or worse,
 * subtracted expenses from revenue and called that the balance. Books has
 * shown these numbers all along.
 */
export function bankBalancesSection(connectedAccounts = [], now = new Date()) {
  const accts = (connectedAccounts || []).filter(a => a && a.status !== 'inactive' && a.status !== 'disconnected')
  if (!accts.length) {
    return `### Bank Balances\n- No bank account is connected, so cash on hand is not visible here. Answer affordability from the last 30 days' cash flow and what is collectible this week, and say the balance is not connected — never derive a balance from revenue minus expenses.\n\n`
  }
  let cash = 0, cardOwed = 0, cardAvail = 0
  let s = `### Bank Balances (live from the bank feed)\n`
  for (const a of accts) {
    const cur = Number(a.current_balance) || 0
    const avail = a.available_balance == null ? null : Number(a.available_balance)
    const label = `${a.account_name || a.institution_name || 'Account'}${a.mask ? ` (…${a.mask})` : ''}`
    if (a.account_type === 'credit') {
      cardOwed += cur
      if (avail != null) cardAvail += avail
      s += `- ${label}, credit card: ${money(cur)} owed${avail != null ? `, ${money(avail)} credit available` : ''}\n`
    } else {
      const usable = avail != null ? avail : cur
      cash += usable
      s += `- ${label}, ${a.account_subtype || a.account_type || 'bank'}: ${money(usable)} available${avail != null && avail !== cur ? ` (${money(cur)} current)` : ''}\n`
    }
  }
  s += `- TOTAL CASH AVAILABLE across bank accounts: ${money(cash)}\n`
  if (cardOwed > 0 || cardAvail > 0) s += `- Credit cards: ${money(cardOwed)} owed, ${money(cardAvail)} available to spend\n`
  const synced = accts.map(a => a.last_synced).filter(Boolean).sort().pop()
  if (synced) {
    const hrs = Math.round((now - new Date(synced)) / 3600000)
    s += `- As of the last bank sync ${hrs <= 1 ? 'within the hour' : `${hrs} hours ago`}; pending transactions may not be reflected\n`
  }
  s += `- This is the number to use for "can I afford X": available cash, minus what is due before the next money lands\n\n`
  return s
}

// The Expense Category dropdown's fixed "Other" group, the same on every
// tenant, alongside whatever categories the company has defined.
const FIXED_EXPENSE_CATEGORIES = ['Transfer', 'Owner Distribution', 'Owner Contribution', 'Loan Payment', 'Tax Payment']

/**
 * The exact names Books offers, so a bookkeeping answer says "Vehicle & Auto
 * Expenses" and not a plausible category that does not exist.
 */
export function categoriesSection(expenseCategories = [], taxCategories = TAX_CATEGORIES) {
  const own = (expenseCategories || []).filter(c => c && c.name)
  let s = `### Categories in Books (use these exact names; there are no others)\n`
  s += `Expense Category (what it was):\n`
  const expense = own.filter(c => c.type !== 'income').map(c => c.name)
  const income = own.filter(c => c.type === 'income').map(c => c.name)
  if (expense.length) s += `- Expense: ${expense.join(', ')}\n`
  if (income.length) s += `- Income: ${income.join(', ')}\n`
  if (!own.length) s += `- This company has not set up its own expense categories yet; the AI-suggested category on each bank row is free text\n`
  s += `- Other (every company): ${FIXED_EXPENSE_CATEGORIES.join(', ')}\n`
  s += `- A transfer between the company's own accounts is marked with the "Transfer between accounts" checkbox and needs no categories\n`
  s += `Tax Category (which Form 1065 line):\n`
  for (const g of taxCategories) s += `- ${g.group}: ${g.options.map(o => `"${o.label}"`).join(', ')}\n`
  s += '\n'
  return s
}

/**
 * The "Current Data Context" Frankie reads from. `data` is the shape of the
 * store: invoices, payments, expenses (manual), plaidTransactions, jobs,
 * customers, employees, timeLogs, company, connectedAccounts,
 * expenseCategories — plus payrollRuns, which the engine fetches for the
 * roles allowed to see wages (null otherwise).
 */
export function buildFinancialContext(data = {}, now = new Date()) {
  const invoices = data.invoices || []
  const payments = data.payments || []
  // Combine manual entries with bank-fed Plaid debits. See
  // frankieFields.unifiedExpenses — without this Frankie tells the AI
  // "you have $0 in expenses" for any tenant whose spend is auto-imported
  // from a bank (i.e., most of them).
  const expenses = unifiedExpenses(data.expenses || [], data.plaidTransactions || [])
  const jobs = data.jobs || []
  const customers = data.customers || []
  const employees = data.employees || []

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

  // Cash on hand first: it is what most questions are really asking about.
  context += bankBalancesSection(data.connectedAccounts || [], now)

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
  const timeLogs = data.timeLogs || []
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

  // The names Books actually offers, for "what do I categorize this as".
  context += categoriesSection(data.expenseCategories || [])

  // The year, the entity and the tax picture — see frankieTaxContext.js.
  // Without this, "how much tax will I owe" got a list of six things Frankie
  // could not see, every one of which was sitting in JobScout.
  context += buildTaxContext({
    company: data.company,
    payments,
    plaidTransactions: data.plaidTransactions || [],
    manualExpenses: data.expenses || [],
    payrollRuns: data.payrollRuns ?? null,
    now,
  })

  return context
}

/** The whole system prompt as the model receives it: persona plus data. */
export function fullSystemPrompt({ user, company, role, data, now = new Date() }) {
  const dataContext = buildFinancialContext(data, now)
  const contextMessage = dataContext
    ? `\n\n## Current Data Context (REAL DATA — use ONLY these facts)\n${dataContext}`
    : '\n\n## Current Data Context\nNo financial data available. If the user asks about numbers, let them know data is still loading.'
  return buildSystemPrompt(user, company, role) + contextMessage
}
