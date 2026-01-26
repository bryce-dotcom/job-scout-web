# Job Scout Web App - Project Status

**Last Updated:** January 25, 2026
**Current Phase:** CORE COMPLETE
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
- [x] Supabase connection (38 tables)
- [x] Zustand store with multi-tenant
- [x] GitHub connected
- [x] Protected routes
- [x] Job Scout theme with topo background
- [x] Sidebar navigation (grouped sections)

### Core Pages
- [x] Login / Auth
- [x] Dashboard (real metrics, pipeline overview, alerts, quick actions)
- [x] Employees
- [x] Customers

### Sales Flow
- [x] Leads
- [x] Sales Pipeline (Kanban)
- [x] Products & Services
- [x] Quotes (with line items)

### Operations
- [x] Jobs (list, calendar, detail)
- [x] Job Lines
- [x] Time Log (clock in/out)

### Financial
- [x] Invoices
- [x] Payments

### Resources
- [x] Inventory
- [x] Fleet
- [x] Fleet Maintenance
- [x] Fleet Rentals

### Lighting & Rebates
- [x] Lighting Audits
- [x] Audit Areas
- [x] Fixture Types
- [x] Utility Providers
- [x] Utility Programs
- [x] Rebate Rates

### Admin
- [x] Settings (company profile, business units, lead sources, service types, user management)
- [x] Settings Developer Tools (sample data seeder, clear data - Admin only)
- [x] Reports (sales, jobs, financial, employee, inventory, fleet)
- [x] Communications Log
- [x] Toast notifications (success, error, info, warning)
- [x] Loading/Error/Empty state components
- [x] Mobile responsive layout with collapsible sidebar

---

## Deployment

### Vercel Setup
1. Connect GitHub repo to Vercel
2. Framework Preset: Vite
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Install Command: `npm install`

### Environment Variables (Vercel)
```
VITE_SUPABASE_URL=https://tzrhfhisdeahrrmeksif.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Files
- `vercel.json` - SPA rewrites configured
- `.env.example` - Template for local development

### Build Status
- Production build: ✅ Passing
- Bundle size: ~860KB (consider code splitting for production optimization)

---

## Developer Tools

### Sample Data Seeder
Located in `src/lib/seedData.js`:
- `seedSampleData(companyId)` - Populates database with test data
- `clearAllData(companyId, currentUserId)` - Clears all records except current user

Access via Settings → Developer Tools (Admin only)

### UI Components
- `LoadingSpinner` - Centered spinner with optional message
- `ErrorMessage` - Error display with retry button
- `EmptyState` - Friendly empty state with action button
- `Toast` - Toast notification system (success, error, info, warning)

---

## Future Enhancements

- [ ] PDF generation (work orders, proposals, invoices)
- [ ] Email/SMS integration (Twilio)
- [ ] Google Calendar sync
- [ ] QuickBooks integration
- [x] Mobile responsive improvements
- [ ] AI assistant integration
- [ ] Photo uploads for audits
- [ ] Route optimization
- [ ] Customer portal
- [ ] Appointments calendar
- [ ] Expenses tracking
- [ ] Code splitting for smaller bundle size

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

## Sidebar Navigation Structure

```
MAIN
- Dashboard

SALES
- Leads
- Pipeline
- Customers
- Quotes

OPERATIONS
- Jobs
- Jobs Calendar
- Time Log

FINANCIAL
- Invoices
- Products

RESOURCES
- Employees
- Fleet
- Inventory

LIGHTING
- Audits
- Fixture Types
- Providers
- Programs

ADMIN
- Communications
- Reports
- Settings
```

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
