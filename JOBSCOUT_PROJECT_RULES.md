# Job Scout - Project Rules & Standards

**Read this file before writing ANY code for Job Scout.**

---

## CORE PRINCIPLE: The App Teaches Itself

Users should understand how to use Job Scout without training. Every page, button, and feature must be self-explanatory. If someone "dumb" can't figure it out, the UI failed.

### How we achieve this:
- **Numbered menu** shows business flow in sequence (1-5)
- **Tooltips** on hover explain what each page/button does
- **Help badges** (?) next to section headers explain the section
- **Flow indicators** show where you are in the process
- **Empty states** tell users what to do when there's no data
- **Stage labels** explain what happens ("Won → Creates Customer & Job")
- **Visual grouping** uses images/icons so users navigate by recognition, not reading
- **Settings on the page** — gear icon opens settings inline, never a separate page

---

## ARCHITECTURE RULES

### Don't Trust This File. Run The Checks.

Everything below is advice, and advice is what we had when all of this broke.
The rules in this file were already written, in bold, and still got violated —
because a rule you have to *remember* is a rule you will *forget*, and because
the doc it told you to trust had itself gone stale.

So the rules that actually matter are enforced by commands. Run them:

```
npm run check          # guard + tests — do this before you push (~2s)
npm run guard          # fails on patterns that have caused real customer bugs
npm test               # money-model invariants, ~0.3s
npm run schema:check   # every .select() column, checked against the LIVE database
npm run schema:dump    # regenerate DATABASE_SCHEMA.md from the live database
```

`npm run build` runs the guard automatically. You cannot ship past it.

`check` is deliberately just guard + tests, so it is **green today** and any red
means *you* broke something. `npm run lint` is not in it: there are ~890
pre-existing lint problems, and a gate that is red on day one is a gate everyone
learns to ignore — which is the exact habit that let all of this through.
Same reasoning behind `scripts/schema-baseline.json`: known drift is recorded so
the check can fail on *new* drift only. Both lists are debt to pay down, not
permission to add more.

### Verify Column Names Before Querying — `npm run schema:check`
A wrong column name doesn't throw. PostgREST 400s the **entire** query, and our
usual `const { data } = await ...; return data || []` turns that into an empty
array — the screen renders zero and nobody is told. That is how every commission
on the Payroll page silently became $0, and how a report written to find problems
announced it had found none while 38 sat in the database.

Do not eyeball `DATABASE_SCHEMA.md` (it is now generated — `npm run schema:dump`).
Run `npm run schema:check`. It reads the live schema and fails on any column the
database doesn't have.

### Never Re-Derive A Money Rule — `npm run guard`
Business rules live in ONE place and get imported:

- `src/lib/arHelpers.js` — `isLegacyNetShape`, `invoiceCustomerTotal`, AR totals
- `src/lib/invoiceSections.js` — the customer-facing invoice breakdown
- `supabase/functions/_shared/money.ts` — the same rules for edge functions

The legacy-net invoice rule drifted into **fifteen** open-coded copies — screens,
the PDF, the customer portal, reports, revenue, collections, the Stripe webhook,
Frankie. Fixing some left the rest wrong, so one invoice reported different
balances depending on which screen you opened, and a customer-facing PDF billed
$32,143.06 on an invoice that owed $0. One of those copies carried a comment
saying it "mirrors the math used by InvoiceDetail, CustomerPortal, Stripe
webhook, and Books" — the comment was true when written and false forever after.

A comment cannot keep two implementations in sync. Import the function.

### Surface Failures, Never Swallow Them
`data || []` on a query whose error you never checked converts a hard failure
into a plausible-looking zero. If a script or screen exists to find problems,
make it throw — "found nothing" and "the query broke" must never look the same.

### Verify By Looking, Not By Reasoning
The invoice PDF stayed wrong after the screen was fixed, and the code read fine.
It took rendering the actual PDF and looking at it. For anything customer-facing,
produce the artifact and inspect it.

### Multi-Tenant
Every single query filters by `company_id`. No exceptions. Guard clause if no company_id.

### Pipeline Tracks Leads (NOT Deals)
There is no deals table. Leads move through statuses in the pipeline. The lead IS the deal.

### Settings Are Database-Driven
Service types, business units, lead sources, product groups — all stored in the `settings` table as key-value pairs with JSON arrays. Never hardcoded in JSX files.

```
settings table:
  key: "service_types"     → value: '["Energy Efficiency","Electrical","Exterior Cleaning"]'
  key: "business_units"    → value: '["HHH Building Services","Energy Scout"]'
  key: "lead_sources"      → value: '["Website","Referral","Cold Call"]'
```

All pages pull from `useStore()` → `serviceTypes`, `businessUnits`, `leadSources`. If you see a hardcoded array for any of these, it's a bug.

### Products & Services Catalog
Three-level hierarchy:
- **Service Type** (from settings) → tabs at top
- **Product Group** (from `product_groups` table) → visual tiles with images
- **Product** (from `products_services` table) → items inside each group

Product groups are managed via Settings gear icon ON the Products page. Like a POS menu — big tiles, tap to drill in.

### Relationships
```
Lead
├── Appointments (setter schedules)
├── Audits (salesperson creates)
├── Quotes (generated from audit or manual)
└── When Won → Customer + Job created automatically
```

### Quotes
- Can be created from Lead Detail page (Quotes tab)
- Can be created from Customer Detail page (Quotes tab)
- Quote builder pulls products from Products & Services catalog
- Line items: product, quantity, unit_price, line_total
- Quote shows subtotal, discount, total

### Customers
- Created automatically when lead is Won
- Can also be created manually
- "Send to Setter" button creates a new lead from customer data, puts them back in the setter pipeline for scheduling

---

## LEAD FLOW

```
New → Contacted → Callback → Appointment Set → Quote Sent → Negotiation → Won / Lost
```

- **New**: Lead just entered the system
- **Contacted**: Setter made first contact
- **Callback**: Customer asked to call back later
- **Appointment Set**: Meeting scheduled (setter gets paid)
- **Quote Sent**: Salesperson sent a quote
- **Negotiation**: Back and forth on pricing
- **Won**: Creates Customer + Job automatically
- **Lost**: Archives the lead

---

## SALES FLOW MENU (Numbered 1-5)

The sidebar shows the business flow as numbered steps:

| # | Page | Color | Tooltip |
|---|------|-------|---------|
| 1 | Leads | #6b7280 | All potential customers start here |
| 2 | Lead Setter | #8b5cf6 | Call leads & schedule appointments |
| 3 | Pipeline | #f59e0b | Track leads through sales process |
| 4 | Quotes | #3b82f6 | Create & send price quotes |
| 5 | Jobs | #22c55e | Won quotes become jobs |

---

## FULL MENU STRUCTURE

```
SALES FLOW (numbered 1-5)
├── Leads
├── Lead Setter
├── Pipeline
├── Quotes
└── Jobs

CUSTOMERS
├── Customers
└── Appointments

OPERATIONS
├── Calendar
├── Routes
├── Inventory
└── Products & Services

FINANCIAL
├── Invoices
├── Payments
└── Expenses

TEAM
├── Employees
├── Time Clock
└── Payroll
```

---

## UI RULES

### No Emojis
Use Lucide icons for everything. Emojis look unprofessional and render differently across devices.

### Inline Styles (NOT Tailwind Classes)
We use `style={{}}` with theme variables. No `className="bg-zinc-900"`.

```javascript
// CORRECT
<div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>

// WRONG
<div className="bg-zinc-900 border border-zinc-800">
```

### Theme Colors
```javascript
const theme = {
  bg: '#09090b',
  bgCard: '#18181b',
  bgCardHover: '#27272a',
  border: '#27272a',
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  accent: '#f97316',         // Orange
  accentBg: 'rgba(249,115,22,0.15)'
};

// Additional colors
success: '#22c55e'   // Green
info: '#3b82f6'      // Blue
error: '#ef4444'     // Red
warning: '#eab308'   // Yellow
purple: '#a855f7'
```

### Status Badge Colors
```javascript
const statusColors = {
  'New':              { bg: '#e0e7ff', text: '#4338ca' },
  'Contacted':        { bg: '#fef3c7', text: '#d97706' },
  'Callback':         { bg: '#fce7f3', text: '#db2777' },
  'Appointment Set':  { bg: '#d1fae5', text: '#059669' },
  'Quote Sent':       { bg: '#dbeafe', text: '#2563eb' },
  'Negotiation':      { bg: '#ffedd5', text: '#ea580c' },
  'Won':              { bg: '#d1fae5', text: '#059669' },
  'Lost':             { bg: '#f3f4f6', text: '#6b7280' }
};
```

### Mobile Responsive (PWA)
This is a Progressive Web App. Mobile is not optional.

- **44px minimum** touch targets on all buttons and interactive elements
- Responsive padding: 12px mobile, 24px desktop
- Grids: `repeat(auto-fit, minmax(280px, 1fr))`
- Scrollable containers: `overflowX: 'auto', WebkitOverflowScrolling: 'touch'`
- Sidebar collapses to hamburger on mobile

### Cards Are Clickable
Lead cards navigate to Lead Detail on click. Hover shows border color change. Entire card is the click target, not just the name.

### Input Focus Fix
Never update parent state on every keystroke. Use local state + onBlur:

```javascript
// CORRECT
const [localValue, setLocalValue] = useState(value);
<input value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => onSave(localValue)} />

// WRONG - causes re-render, loses focus
<input value={settings.name} onChange={(e) => setSettings({...settings, name: e.target.value})} />
```

### Settings Pattern
Settings gear icon lives ON the page. Clicking it opens an inline panel or modal on that same page. Never navigate to a separate settings page.

### Visual Product Catalog
Products are shown as visual tiles (like a POS system), not dropdowns. Users tap a group tile → see products inside. Images or Lucide icon placeholders. Big, obvious, touch-friendly.

---

## COMPONENT CHECKLIST

When building any new page:

- [ ] Read this file first
- [ ] Verify all column names against DATABASE_SCHEMA.md
- [ ] Page title with optional HelpBadge
- [ ] Empty state with guidance if no data
- [ ] Tooltips on action buttons
- [ ] Loading state
- [ ] Error handling with try/catch
- [ ] Multi-tenant filter (company_id)
- [ ] Consistent card styling with theme
- [ ] No emojis — Lucide icons only
- [ ] Mobile responsive (44px touch targets)
- [ ] All dropdowns pull from store (serviceTypes, businessUnits, leadSources)
- [ ] Settings inline on the page (gear icon)
- [ ] Guard clause: if (!companyId) return null

---

## TECH STACK

- **Frontend**: React 19 + Vite (JSX not TSX)
- **State**: Zustand with persist
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **Styling**: Inline styles with theme object (NOT Tailwind classes)
- **Icons**: Lucide React
- **Deployment**: Vercel + GitHub
- **Architecture**: PWA (Progressive Web App)

---

## FILE STRUCTURE

```
src/
├── main.jsx
├── App.jsx
├── index.css
├── components/
│   ├── Layout.jsx         (nav shell, theme, sidebar)
│   ├── Tooltip.jsx        (hover tooltip)
│   ├── HelpBadge.jsx      (? icon with tooltip)
│   ├── FlowIndicator.jsx  (horizontal progress bar)
│   └── EmptyState.jsx     (guidance when no data)
├── lib/
│   ├── supabase.js        (Supabase client)
│   └── store.js           (Zustand store)
└── pages/
    ├── Dashboard.jsx
    ├── Login.jsx
    ├── Leads.jsx
    ├── LeadDetail.jsx
    ├── LeadSetter.jsx
    ├── SalesPipeline.jsx
    ├── Quotes.jsx
    ├── Jobs.jsx
    ├── Customers.jsx
    ├── CustomerDetail.jsx
    ├── ProductsServices.jsx
    ├── Employees.jsx
    └── Settings.jsx
```

---

## DATABASE

- **Supabase Project**: tzrhfhisdeahrrmeksif.supabase.co
- **Company ID**: 3 (HHH Services)
- **Local Project Path**: C:\JobScout\job-scout-web

### Key Tables
| Table | Purpose |
|-------|---------|
| leads | All potential customers, tracked through pipeline |
| appointments | Scheduled meetings linked to leads |
| quotes | Price quotes linked to leads or customers |
| quote_lines | Line items on a quote |
| customers | Converted leads or manually added |
| jobs | Work orders created from won quotes |
| employees | Team members with roles |
| products_services | Product/service catalog items |
| product_groups | Visual grouping for catalog |
| settings | Key-value config (service_types, business_units, lead_sources) |
| lead_payments | Setter commission tracking |

---

## STORE PATTERN (Zustand)

```javascript
// Always get from store
const { companyId, serviceTypes, businessUnits, leadSources } = useStore();

// Always filter by company_id
const { data } = await supabase.from('leads').select('*').eq('company_id', companyId);

// Settings sync
fetchSettings() loads service_types, business_units, lead_sources from settings table
Called inside fetchAllData()
```

---

## COMMUNICATION RULES (For Claude Code Instructions)

1. SQL goes in its own copy box labeled "Run this in Supabase SQL Editor"
2. Claude Code commands go in their own copy box labeled "Paste this into Claude Code"
3. NEVER mix instructions inside code boxes
4. Instructions go in conversation text between the boxes
5. All tasks presented at once, each in its own box
6. Keep commands concise — no embedded explanations in the code block

---

**This is the Job Scout way. Read it. Follow it. Every time.**
