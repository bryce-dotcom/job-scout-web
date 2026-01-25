# Job Scout Web App - Project Status

**Last Updated:** January 24, 2026
**Current Phase:** Building Core Modules
**GitHub:** https://github.com/bryce-dotcom/job-scout-web.git
**Supabase:** https://tzrhfhisdeahrrmeksif.supabase.co

---

## Project Overview

Rebuilding the AppSheet "Job Scout" application as a modern React/Supabase web app.
- Original: 64 tables, 160 views, 250+ actions
- Target: Multi-tenant SaaS for 20,000 users
- Stack: React + Vite, Supabase, Zustand, Lucide React

---

## Reference Documents

Always reference these project files:
- **OG_DiX_Code_Standards.md** - Proven patterns, UI standards, inline styles
- **Job_Scout_Documentation.md** - Complete AppSheet schema with all tables, columns, views, actions

---

## Theme (Job Scout Light Topo)
```javascript
const theme = {
  bg: '#f7f5ef',           // Topo cream background
  bgCard: '#ffffff',       // White cards
  bgCardHover: '#eef2eb',  // Light sage hover
  border: '#d6cdb8',       // Map tan borders
  text: '#2c3530',         // Dark forest text
  textSecondary: '#4d5a52', // Slate green
  textMuted: '#7d8a7f',    // Sage grey
  accent: '#5a6349',       // Scout olive (matches logo)
  accentBg: 'rgba(90,99,73,0.12)'
};
```

Logo: public/Scout_LOGO_GUY.png (olive scout silhouette)
Background: Subtle topo contour pattern

---

## Database (Supabase)

### Connection
- URL: https://tzrhfhisdeahrrmeksif.supabase.co
- Auth: Supabase Auth enabled
- RLS: Enabled on all tables (permissive policies for now)

### Tables Created (38 total)
- companies (multi-tenant root)
- employees
- customers
- leads
- sales_pipeline
- lead_payments
- appointments
- products_services
- quotes
- quote_lines
- jobs
- job_lines
- custom_forms
- time_log
- invoices
- payments
- utility_invoices
- incentives
- expenses
- fleet
- fleet_maintenance
- fleet_rentals
- inventory
- communications_log
- routes
- settings
- helpers
- search_index
- webhook_form
- sync_log
- utility_providers
- utility_programs
- lighting_audits
- fixture_types
- audit_areas
- rebate_rates
- rebate_update_log
- ai_sessions
- ai_modules
- ai_messages

### Test Account
- Company ID: 3
- Company: HHH Services
- User: bryce@hhh.services (Owner/Admin)

---

## Completed Modules

### Infrastructure
- [x] Vite + React project setup
- [x] Supabase client connection
- [x] Zustand store with multi-tenant pattern
- [x] GitHub repo connected
- [x] Protected routes
- [x] Sidebar navigation layout
- [x] Job Scout theme with topo background

### Pages
- [x] Login (Supabase auth, employee/company lookup)
- [x] Dashboard (basic)
- [x] Employees (full CRUD)
- [x] Customers (full CRUD)
- [x] Leads (full CRUD, status workflow, convert to customer)
- [x] Sales Pipeline (Kanban board with drag-drop)
- [x] Products (catalog with categories)
- [x] Quotes (list with line items, totals)
- [x] Quote Detail (line items table, convert to job)
- [x] Jobs (card list, status badges, quick actions)
- [x] Job Detail (line items, time tracking progress bar, generate invoice)
- [x] Job Calendar (monthly grid, status color coding)
- [x] Invoices (table view, payments tracking)
- [x] Invoice Detail (payments section, add payment modal)
- [x] Time Log (clock in/out, manual entry, filters)

---

## In Progress

- [ ] Appointments (calendar integration)
- [ ] Work Order PDF generation
- [ ] Custom Forms

---

## Next Up

### Phase 1: Complete Operations
- Appointments (calendar integration)
- Work Order PDF generation
- Custom Forms module

### Phase 2: Resources & Expenses
- Expenses tracking
- Fleet management
- Fleet maintenance
- Inventory tracking

### Phase 3: Utility & Rebates
- Utility Invoices
- Utility Programs / Rebates
- Lighting Audits module

### Phase 4: Advanced Features
- Reports dashboard
- AI assistant integration
- Route optimization
- Communications log

---

## Key Patterns (from OG_DiX_Code_Standards.md)

### Multi-tenant
- Every query filters by company_id
- Store persists companyId
- Guard clause in every page: if (!companyId) return null

### Store Pattern
```javascript
const { companyId } = get();
if (!companyId) return;
// All queries filter by company_id
```

### Page Pattern
```javascript
useEffect(() => {
  if (!companyId) {
    navigate('/login');
    return;
  }
  fetchData();
}, [companyId]);
```

### Styling
- Inline styles only (no Tailwind classes)
- Theme object for all colors
- Theme with fallback in every component

---

## Build Order (Business Flow)

1. Login ✅
2. Employees ✅
3. Customers ✅
4. Leads & Sales Pipeline ✅
5. Products ✅
6. Quotes ✅
7. Jobs ✅
8. Invoices ✅
9. Time Tracking ✅
10. Appointments ← CURRENT
11. Expenses
12. Inventory
13. Fleet
14. Lighting Audits

---

## Commands Reference

### Start dev server
```bash
cd job-scout-web
npm run dev
```

### Commit and push
```bash
git add . && git commit -m "message" && git push
```

### Supabase SQL Editor
https://supabase.com/dashboard/project/tzrhfhisdeahrrmeksif/sql

---

## Notes

- AppSheet Ref columns → INTEGER REFERENCES in Postgres
- AppSheet List columns → virtual (skip in DB, fetch via joins)
- All prices use DECIMAL(12,2)
- Soft delete pattern: set active=false or status='Inactive'
