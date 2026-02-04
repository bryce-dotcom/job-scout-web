# Job Scout - Data Connection Audit

**Generated:** 2026-02-04
**Purpose:** Comprehensive audit of all data wiring across the codebase

---

## Table of Contents

1. [Tables Defined in Schema](#tables-defined-in-schema)
2. [Store State & Fetch Functions](#store-state--fetch-functions)
3. [Supabase Queries by Page](#supabase-queries-by-page)
4. [Modals & Forms - What They Save To](#modals--forms---what-they-save-to)
5. [Pages Using Store Data Only (No Direct Queries)](#pages-using-store-data-only)
6. [Hardcoded/Static Data](#hardcodedstatic-data)
7. [Settings Table Keys](#settings-table-keys)
8. [Comparison & Gap Analysis](#comparison--gap-analysis)

---

## Tables Defined in Schema

From `src/lib/schema.js` - Tables available in Supabase:

### Core Tables
| Table | Description |
|-------|-------------|
| `companies` | Multi-tenant company records |
| `employees` | Employee records per company |
| `customers` | Customer records per company |
| `leads` | Sales leads |
| `sales_pipeline` | Pipeline stages for leads |
| `lead_payments` | Payments linked to leads |
| `appointments` | Scheduled appointments |

### Products & Quotes
| Table | Description |
|-------|-------------|
| `products_services` | Products and services catalog |
| `quotes` | Quote headers |
| `quote_lines` | Quote line items |

### Jobs & Work
| Table | Description |
|-------|-------------|
| `jobs` | Job/project records |
| `job_lines` | Job line items |
| `job_sections` | Job sections for PM workflow |
| `custom_forms` | Custom form definitions |
| `time_log` | Time tracking entries |
| `expenses` | Expense records |

### Invoicing
| Table | Description |
|-------|-------------|
| `invoices` | Invoice headers |
| `invoice_lines` | Invoice line items |
| `payments` | Payment records |
| `utility_invoices` | Utility bill tracking |
| `incentives` | Incentive/rebate payments |

### Fleet
| Table | Description |
|-------|-------------|
| `fleet` | Fleet/asset records |
| `fleet_maintenance` | Maintenance logs |
| `fleet_rentals` | Rental records |

### Inventory
| Table | Description |
|-------|-------------|
| `inventory` | Inventory items |
| `inventory_transactions` | Stock movements |
| `product_groups` | Product groupings |
| `labor_rates` | Labor rate definitions |

### Lighting Audits
| Table | Description |
|-------|-------------|
| `lighting_audits` | Audit headers |
| `audit_areas` | Audit area records |
| `audit_area_fixtures` | Fixtures per area |
| `fixture_types` | Fixture type catalog |
| `rebate_rates` | Rebate rate definitions |
| `rebate_update_log` | Rebate change log |
| `utility_programs` | Utility rebate programs |
| `utility_providers` | Utility companies |

### Other
| Table | Description |
|-------|-------------|
| `communications_log` | Communication records |
| `routes` | Route definitions |
| `route_stops` | Route stop points |
| `settings` | Company settings (JSON key-value) |
| `search_index` | Full-text search index |
| `tags` | Tag definitions |
| `entity_tags` | Tag assignments |
| `file_attachments` | File storage references |
| `reports` | Saved report definitions |
| `bookings` | Booking records |
| `feedback` | User feedback submissions |
| `saved_queries` | Saved SQL queries (Data Console) |
| `system_settings` | Global system settings |

### AI/Webhooks
| Table | Description |
|-------|-------------|
| `ai_sessions` | AI conversation sessions |
| `ai_modules` | AI agent module definitions |
| `ai_messages` | AI conversation messages |
| `webhook_form` | Webhook form submissions |
| `sync_log` | Data sync log |
| `helpers` | Helper/assistant records |

### Agents (Base Camp)
| Table | Description |
|-------|-------------|
| `agents` | Agent definitions (global) |
| `company_agents` | Company-agent relationships |

---

## Store State & Fetch Functions

From `src/lib/store.js` - Zustand store state and data fetching:

### Store State Arrays
| State Key | Fetched From Table |
|-----------|-------------------|
| `employees` | `employees` |
| `customers` | `customers` |
| `leads` | `leads` |
| `salesPipeline` | `sales_pipeline` |
| `appointments` | `appointments` |
| `products` | `products_services` |
| `quotes` | `quotes` |
| `jobs` | `jobs` |
| `jobLines` | `job_lines` |
| `timeLogs` | `time_log` |
| `expenses` | `expenses` |
| `invoices` | `invoices` |
| `payments` | `payments` |
| `fleet` | `fleet` |
| `fleetMaintenance` | `fleet_maintenance` |
| `fleetRentals` | `fleet_rentals` |
| `inventory` | `inventory` |
| `lightingAudits` | `lighting_audits` |
| `auditAreas` | `audit_areas` |
| `fixtureTypes` | `fixture_types` |
| `utilityProviders` | `utility_providers` |
| `utilityPrograms` | `utility_programs` |
| `rebateRates` | `rebate_rates` |
| `communications` | `communications_log` |
| `settings` | `settings` |
| `laborRates` | `labor_rates` |
| `routes` | `routes` |
| `bookings` | `bookings` |
| `leadPayments` | `lead_payments` |
| `utilityInvoices` | `utility_invoices` |
| `incentives` | `incentives` |
| `agents` | `agents` |
| `companyAgents` | `company_agents` |
| `aiModules` | `ai_modules` |

### Derived Settings (from `settings` table JSON values)
| Store Key | Settings Key |
|-----------|--------------|
| `serviceTypes` | `service_types` |
| `businessUnits` | `business_units` |
| `leadSources` | `lead_sources` |
| `inventoryTypes` | `inventory_types` |
| `inventoryLocations` | `inventory_locations` |
| `jobStatuses` | `job_statuses` |
| `jobSectionStatuses` | `job_section_statuses` |
| `employeeRoles` | `employee_roles` |
| `jobCalendars` | `job_calendars` |

---

## Supabase Queries by Page

### src/pages/ Directory

| File | Tables Queried | Operations |
|------|---------------|------------|
| **Appointments.jsx** | `appointments` | SELECT (via store), INSERT, UPDATE, DELETE |
| **BaseCamp.jsx** | - | Uses store: `agents`, `companyAgents` |
| **Books.jsx** | `manual_expenses`, `assets`, `liabilities` | INSERT, UPDATE, DELETE |
| **Bookings.jsx** | `bookings` | SELECT (via store), INSERT, UPDATE, DELETE |
| **CommunicationsLog.jsx** | `communications_log` | INSERT |
| **CustomerDetail.jsx** | `quotes`, `jobs`, `quote_lines` | SELECT (local state) |
| **Customers.jsx** | - | Uses store: `customers` |
| **Dashboard.jsx** | `time_log` | SELECT, INSERT, UPDATE (clock in/out) |
| **Employees.jsx** | `employees`, `settings` | SELECT (local), INSERT, UPDATE |
| **Expenses.jsx** | `expenses` | SELECT (via store), DELETE |
| **FixtureTypes.jsx** | `fixture_types` | INSERT, UPDATE |
| **Fleet.jsx** | `fleet` | INSERT |
| **FleetDetail.jsx** | `fleet`, `fleet_maintenance`, `fleet_rentals` | INSERT, UPDATE |
| **Incentives.jsx** | `incentives` | INSERT, UPDATE, DELETE |
| **InvoiceDetail.jsx** | `payments`, `invoices` | INSERT, UPDATE |
| **Invoices.jsx** | - | Uses store: `invoices` |
| **JobDetail.jsx** | `jobs`, `job_lines`, `time_log`, `job_sections` | INSERT, UPDATE, DELETE |
| **Jobs.jsx** | - | Uses store: `jobs` |
| **LeadDetail.jsx** | `quote_lines` | INSERT |
| **LeadPayments.jsx** | `lead_payments` | INSERT, UPDATE, DELETE |
| **Leads.jsx** | `leads`, `appointments`, `customers` | INSERT, UPDATE, DELETE |
| **LeadSetter.jsx** | - | Uses store: `leads`, `appointments` |
| **LightingAuditDetail.jsx** | - | Uses store: `lightingAudits` |
| **LightingAudits.jsx** | - | Uses store: `lightingAudits` |
| **Login.jsx** | - | Uses Supabase Auth only |
| **MyCrew.jsx** | - | Uses store: `companyAgents` |
| **NewLightingAudit.jsx** | `sales_pipeline` | INSERT |
| **Payroll.jsx** | - | Uses store: `timeLogs` |
| **PMJobSetter.jsx** | `settings`, `job_sections` | SELECT, INSERT, UPSERT |
| **Products.jsx** | `products_services` | DELETE |
| **ProductsServices.jsx** | `inventory`, `product_groups`, `products_services`, `labor_rates` | INSERT, DELETE |
| **QuoteDetail.jsx** | `quotes`, `quote_lines` | INSERT, UPDATE, DELETE |
| **Quotes.jsx** | - | Uses store: `quotes` |
| **RebateRates.jsx** | `rebate_rates` | INSERT, UPDATE, DELETE |
| **Reports.jsx** | - | Uses store data only (no direct queries) |
| **RobotMarketplace.jsx** | - | No queries (hardcoded data) |
| **RoutesPage.jsx** | `routes` | INSERT, UPDATE, DELETE |
| **SalesPipeline.jsx** | `settings` | SELECT, UPSERT |
| **Settings.jsx** | `settings` | SELECT, UPSERT |
| **TimeClock.jsx** | `time_clock`, `time_off_requests` | INSERT |
| **TimeLog.jsx** | `time_log` | INSERT |
| **UtilityInvoices.jsx** | `utility_invoices` | INSERT, UPDATE, DELETE |
| **UtilityPrograms.jsx** | `utility_programs` | INSERT, UPDATE |
| **UtilityProviders.jsx** | `utility_providers` | INSERT, UPDATE |

### src/pages/admin/ Directory

| File | Tables Queried | Operations |
|------|---------------|------------|
| **DataConsoleAgents.jsx** | `agents`, `company_agents` | SELECT, INSERT, UPDATE |
| **DataConsoleAuditLog.jsx** | - | Local state only |
| **DataConsoleBrowser.jsx** | Dynamic (user-selected table) | SELECT |
| **DataConsoleBulkOps.jsx** | Dynamic (user-selected table) | INSERT |
| **DataConsoleCompanies.jsx** | `companies` | SELECT |
| **DataConsoleDashboard.jsx** | `companies`, `employees`, `utility_providers`, `utility_programs`, `agents`, `products_services`, `feedback`, `lighting_audits` | SELECT (counts) |
| **DataConsoleFeedback.jsx** | `feedback` | UPDATE, DELETE |
| **DataConsoleProducts.jsx** | `products_services`, `companies` | SELECT, INSERT, UPDATE, DELETE |
| **DataConsoleSQL.jsx** | `saved_queries` | INSERT, DELETE |
| **DataConsoleSystem.jsx** | `system_settings` | INSERT, UPDATE, DELETE |
| **DataConsoleUsers.jsx** | `employees`, `companies` | SELECT |
| **DataConsoleUtilities.jsx** | `utility_providers`, `utility_programs`, `rebate_rates` | INSERT, UPDATE, DELETE |

### src/components/ Directory

| File | Tables Queried | Operations |
|------|---------------|------------|
| **FeedbackButton.jsx** | `feedback` | INSERT |
| **ProductPickerModal.jsx** | - | Uses store: `products` |
| **AppointmentsCalendar.jsx** | - | Uses props/store data |

---

## Modals & Forms - What They Save To

| Page | Modal/Form | Saves To Table | Settings Key |
|------|-----------|----------------|--------------|
| **Appointments.jsx** | Add/Edit Appointment | `appointments` | - |
| **Books.jsx** | Add Expense | `manual_expenses` | - |
| **Books.jsx** | Add Asset | `assets` | - |
| **Books.jsx** | Add Liability | `liabilities` | - |
| **Bookings.jsx** | Add/Edit Booking | `bookings` | - |
| **CommunicationsLog.jsx** | Log Communication | `communications_log` | - |
| **Employees.jsx** | Add/Edit Employee | `employees` | - |
| **Employees.jsx** | Job Titles Settings | `settings` | `job_titles` |
| **Employees.jsx** | Access Levels Settings | `settings` | `access_levels` |
| **Fleet.jsx** | Add Asset | `fleet` | - |
| **FleetDetail.jsx** | Add Maintenance | `fleet_maintenance` | - |
| **FleetDetail.jsx** | Add Rental | `fleet_rentals` | - |
| **Incentives.jsx** | Add/Edit Incentive | `incentives` | - |
| **InvoiceDetail.jsx** | Record Payment | `payments` | - |
| **JobDetail.jsx** | Add Line Item | `job_lines` | - |
| **JobDetail.jsx** | Log Time | `time_log` | - |
| **JobDetail.jsx** | Add/Edit Section | `job_sections` | - |
| **LeadPayments.jsx** | Add/Edit Payment | `lead_payments` | - |
| **Leads.jsx** | Add/Edit Lead | `leads` | - |
| **Leads.jsx** | CSV Import | `leads` (batch) | - |
| **LeadSetter.jsx** | Schedule Appointment | `appointments` | - |
| **PMJobSetter.jsx** | Job Statuses | `settings` | `job_statuses` |
| **PMJobSetter.jsx** | Section Statuses | `settings` | `job_section_statuses` |
| **PMJobSetter.jsx** | Calendars | `settings` | `job_calendars` |
| **PMJobSetter.jsx** | **Roles** | `settings` | `employee_roles` |
| **ProductsServices.jsx** | Add to Inventory | `inventory` | - |
| **ProductsServices.jsx** | Delete Product | `products_services` | - |
| **ProductsServices.jsx** | Delete Group | `product_groups` | - |
| **ProductsServices.jsx** | Delete Labor Rate | `labor_rates` | - |
| **QuoteDetail.jsx** | Add Line | `quote_lines` | - |
| **RebateRates.jsx** | Add/Edit Rate | `rebate_rates` | - |
| **RoutesPage.jsx** | Add/Edit Route | `routes` | - |
| **SalesPipeline.jsx** | Pipeline Stages | `settings` | `pipeline_stages` |
| **SalesPipeline.jsx** | Stats to Show | `settings` | `pipeline_stats` |
| **Settings.jsx** | Service Types | `settings` | `service_types` |
| **Settings.jsx** | Business Units | `settings` | `business_units` |
| **Settings.jsx** | Lead Sources | `settings` | `lead_sources` |
| **TimeClock.jsx** | Time Off Request | `time_off_requests` | - |
| **TimeLog.jsx** | Manual Time Entry | `time_log` | - |
| **UtilityInvoices.jsx** | Add/Edit Invoice | `utility_invoices` | - |

---

## Pages Using Store Data Only

These pages do NOT make direct Supabase queries - they rely on global store data:

| Page | Store Data Used |
|------|-----------------|
| **BaseCamp.jsx** | `agents`, `companyAgents` |
| **Customers.jsx** | `customers`, `employees` |
| **Invoices.jsx** | `invoices`, `customers`, `jobs` |
| **Jobs.jsx** | `jobs`, `customers`, `employees` |
| **LeadSetter.jsx** | `leads`, `appointments`, `employees`, `customers` |
| **LightingAuditDetail.jsx** | `lightingAudits`, `auditAreas`, `fixtureTypes`, `utilityProviders`, `utilityPrograms` |
| **LightingAudits.jsx** | `lightingAudits`, `customers` |
| **MyCrew.jsx** | `companyAgents` |
| **Payroll.jsx** | `timeLogs`, `employees` |
| **Quotes.jsx** | `quotes`, `customers`, `employees` |
| **Reports.jsx** | `leads`, `jobs`, `invoices`, `payments`, `employees`, `timeLogs`, `inventory`, `fleet`, `fleetMaintenance`, `salesPipeline` |

---

## Hardcoded/Static Data

### RobotMarketplace.jsx
**Status:** Coming Soon page with preview data

```javascript
const previewRobots = [
  { icon: '🛸', name: 'Audit Drone', desc: 'Ceiling inspection & photo capture', training: 'LED Audit Training' },
  { icon: '🤖', name: 'Inventory Bot', desc: 'Warehouse scanning & counting', training: 'Inventory Management' },
  { icon: '🔍', name: 'Inspector Bot', desc: 'Quality control & documentation', training: 'QC Inspection' },
  { icon: '🚁', name: 'Survey Drone', desc: 'Site mapping & measurements', training: 'Site Survey Training' },
  { icon: '🧹', name: 'Cleaning Bot', desc: 'Commercial floor maintenance', training: 'Facility Maintenance' },
  { icon: '📦', name: 'Delivery Bot', desc: 'Material transport on job sites', training: 'Logistics Training' }
]
```
**Intent:** Placeholder for future Robot Marketplace feature

### Dashboard.jsx
**Status:** Hardcoded pipeline stages (should match `pipeline_stages` setting)

```javascript
const pipelineStages = ['New Lead', 'Quoted', 'Under Review', 'Approved', 'Lost']
const pipelineColors = {
  'New Lead': '#5a9bd5',
  'Quoted': '#f4b942',
  'Under Review': '#9b59b6',
  'Approved': '#4a7c59',
  'Lost': '#c25a5a'
}
```
**Issue:** These should be fetched from `settings` table (`pipeline_stages` key) for consistency with SalesPipeline.jsx

### Reports.jsx
**Status:** Hardcoded report types

```javascript
const reportTypes = [
  { id: 'sales', label: 'Sales Report', icon: TrendingUp, desc: 'Leads, conversions, pipeline value' },
  { id: 'jobs', label: 'Jobs Report', icon: Briefcase, desc: 'Job status, revenue, time tracking' },
  { id: 'financial', label: 'Financial Report', icon: DollarSign, desc: 'Invoices, payments, revenue' },
  { id: 'employee', label: 'Employee Report', icon: Users, desc: 'Hours logged, jobs completed' },
  { id: 'inventory', label: 'Inventory Report', icon: Package, desc: 'Stock levels, low stock items' },
  { id: 'fleet', label: 'Fleet Report', icon: Truck, desc: 'Asset status, maintenance costs' }
]
```
**Intent:** Static UI definition (acceptable)

### schema.js
**Status:** Static enums for UI dropdowns

```javascript
export const STATUS = { ... }
export const PAYMENT_METHODS = [ ... ]
export const JOB_PRIORITIES = [ ... ]
export const EXPENSE_CATEGORIES = [ ... ]
export const BOOKING_STATUS = [ ... ]
export const APPOINTMENT_STATUS = [ ... ]
export const ROUTE_STATUS = [ ... ]
```
**Intent:** UI constants (acceptable, but some could be moved to settings)

---

## Settings Table Keys

The `settings` table stores JSON values keyed by `company_id` + `key`:

| Key | Used In | Description |
|-----|---------|-------------|
| `service_types` | Settings.jsx, store.js | Service type options |
| `business_units` | Settings.jsx, store.js | Business unit options |
| `lead_sources` | Settings.jsx, store.js | Lead source options |
| `inventory_types` | store.js | Inventory type options |
| `inventory_locations` | store.js | Inventory location options |
| `job_statuses` | PMJobSetter.jsx, store.js | Job status options |
| `job_section_statuses` | PMJobSetter.jsx, store.js | Section status options |
| `employee_roles` | PMJobSetter.jsx, store.js | Employee role options (PM Job Board only) |
| `job_calendars` | PMJobSetter.jsx, store.js | Calendar options |
| `pipeline_stages` | SalesPipeline.jsx | Custom pipeline stages |
| `pipeline_stats` | SalesPipeline.jsx | Stats to display |
| `job_titles` | Employees.jsx | Employee job title options |
| `access_levels` | Employees.jsx | Access level definitions |

### Important Clarification

**PMJobSetter.jsx "Roles" modal:**
- Saves to `settings` table with key `employee_roles`
- Does NOT write to `employees` table
- These are role labels for PM job assignment, not employee user roles

---

## Comparison & Gap Analysis

### Tables in Schema Not Queried Anywhere

| Table | Notes |
|-------|-------|
| `custom_forms` | Defined but not implemented |
| `invoice_lines` | Referenced in QUERIES but no direct insert/update found |
| `inventory_transactions` | Defined but not implemented (inventory adjustments) |
| `audit_area_fixtures` | Part of audit flow, may be in NewLightingAudit |
| `rebate_update_log` | Defined but not implemented |
| `route_stops` | Defined but routes page doesn't use stops |
| `search_index` | Likely auto-populated by triggers |
| `tags` | Defined but tagging not implemented |
| `entity_tags` | Defined but tagging not implemented |
| `file_attachments` | Defined but file upload not fully implemented |
| `reports` | Defined but saved reports not implemented |
| `ai_sessions` | For AI agent conversations |
| `ai_messages` | For AI agent message history |
| `webhook_form` | Webhook integration |
| `sync_log` | Data sync logging |
| `helpers` | Helper records |
| `time_clock` | TimeClock.jsx uses it (INSERT) but not in schema.js TABLES |
| `time_off_requests` | TimeClock.jsx uses it (INSERT) but not in schema.js TABLES |
| `manual_expenses` | Books.jsx uses it but not in schema.js TABLES |
| `assets` | Books.jsx uses it but not in schema.js TABLES |
| `liabilities` | Books.jsx uses it but not in schema.js TABLES |

### Pages with Potential Issues

| Issue | Page | Details |
|-------|------|---------|
| Hardcoded stages | Dashboard.jsx | `pipelineStages` should use store/settings |
| No save functionality | RobotMarketplace.jsx | Intentional - coming soon page |
| Missing table in schema | Books.jsx | Uses `manual_expenses`, `assets`, `liabilities` - add to schema.js |
| Missing table in schema | TimeClock.jsx | Uses `time_clock`, `time_off_requests` - add to schema.js |

### Forms That Don't Appear to Save

All major forms identified have working save functionality.

---

## Summary

- **Total tables in schema.js:** 51
- **Tables with active queries:** ~40
- **Pages using direct Supabase queries:** 35
- **Pages using store data only:** 11
- **Settings keys in use:** 12
- **Hardcoded data sections:** 3 (RobotMarketplace preview, Dashboard stages, Reports types)

### Confirmed: PMJobSetter Roles

The "Roles" modal in PMJobSetter.jsx (accessed via the settings gear icon):
- **Saves to:** `settings` table
- **Key:** `employee_roles`
- **Does NOT save to:** `employees` table
- **Purpose:** Define role labels for assigning employees to PM job sections
