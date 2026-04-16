// JobScout knowledge base — injected into Arnie's system prompt so he can
// answer "how do I X?" questions accurately instead of improvising.
// Edit this file when features change.

export const JOBSCOUT_KNOWLEDGE = `
## JobScout Feature Reference (use this to answer "how do I" questions)

### Sales Flow (5 stages)
1. **Leads** (/leads) — capture new prospects with name, contact, source, estimated value. Status: new → contacted → qualified → quoted → won/lost.
2. **Lead Setter** (/lead-setter) — call queue for sales reps. Each lead can have notes, follow-up dates, disposition.
3. **Pipeline** (/pipeline) — kanban view of qualified leads moving toward close. Drag between stages.
4. **Estimates / Quotes** (/quotes) — line-item builder that pulls from Products & Services. Can auto-generate from a lighting audit. Send PDF to customer for signature.
5. **Jobs** (/jobs) — when a quote is accepted it becomes a job. Has sections, scheduled date, assigned employees, line items, time tracking.

### Customers
- **Customers list** (/customers) — all customer accounts with their history.
- **Customer Detail** (/customers/:id) — shows leads, jobs, invoices, payments, communications.
- **Customer Portal** (/portal/:token) — public link for customer to view their job/invoice/payment history without logging in.

### Operations
- **Calendar** (/calendar) — month/week view of jobs and appointments.
- **Routes** (/routes) — multi-stop route planning for technicians.
- **Field Scout (Time Clock)** (/field-scout) — techs clock in/out of jobs. Captures GPS pings.
- **Job Board** (/jobs) — list of all jobs with filters by status, employee, date.
- **Inventory** (/inventory) — track stock levels by location, low-stock alerts.
- **Products & Services** (/products) — catalog with prices, costs, descriptions used in quotes/jobs.

### Financial
- **Invoices** (/invoices) — invoice list, supports regular invoices and utility incentives. Status: Pending, Paid, Overdue.
- **Utility Invoices** (/utility-invoices) — utility company rebate tracking. Project Cost + Utility Owes drive material/labor/customer portion calcs (default 70/30 split).
- **Payments** (/payments) — record received payments, link to invoices.
- **Deposits** (/deposits) — track lead deposits before job creation.
- **Expenses** (/expenses) — log business expenses by category, merchant, business unit.
- **Books** (/books) — accounting summary across invoices/payments/expenses.

### Team
- **Employees** (/employees) — staff directory with roles, contact, pay rates (admin only).
- **Time Clock** (/time-clock) — clock-in/out, hours summary, GPS verification.
- **Payroll** (/payroll) — calculate pay periods from time logs.

### Lighting Vertical
- **Lighting Audits** (/lighting-audits) — site assessment with fixture inventory, energy usage, photos.
- **Fixture Types** (/fixture-types) — catalog of LED replacements with wattage, lumens, cost.
- **Utility Providers** (/utility-providers) and **Programs** (/utility-programs) — rebate program data.
- **Rebate Rates** (/rebate-rates) — per-fixture rebate amounts by program.
- After an audit submission: **Lenard** (AI agent) generates LED upgrade recommendations, ROI, and a quote-ready report.

### Fleet Vertical
- **Fleet** (/fleet) — vehicle list with mileage, status, maintenance.
- **Fleet Calendar** — service schedule by vehicle.
- **Freddy** (AI agent) — fleet maintenance recommendations.

### AI Agents
- **Arnie** (you) — general business assistant with full data access (role-gated).
- **Lenard** — lighting audit analysis and quote generation.
- **Freddy** — fleet maintenance scheduling and recommendations.
- **Conrad Connect** — email marketing campaigns, templates, automations.
- **Victor** — photo verification (before/after job photos, completeness checks).
- **Dougie** — OCR/document understanding for utility bills, invoices, audit forms.

### Admin
- **Data Console** (/admin/data-console) — SQL playground, user/company management, products, agents config.

### Public Routes (no login)
- /agent/lenard-az-srp — Arizona SRP lighting calculator
- /agent/lenard-ut-rmp — Utah Rocky Mountain Power calculator
- /portal/:token — customer portal

### Common workflows
- **Convert lead to job**: Pipeline → mark as won → generates quote → customer signs → becomes job.
- **Bill customer**: Job → mark complete → "Generate Invoice" → invoice created with line items from job.
- **Track utility rebate**: Audit → generate quote → win deal → on job completion, "Create Utility Invoice" tracks the rebate from the utility company separately from customer billing.
- **Schedule a tech**: Job detail → assign employee → set scheduled_date. Shows on Calendar and tech's My Jobs.

### Multi-tenant rules (always true)
- Every record has a company_id. Users only see their own company's data.
- "Business unit" is a sub-grouping within a company (e.g. Lighting, Fleet, HVAC) for revenue/expense splits.
`
