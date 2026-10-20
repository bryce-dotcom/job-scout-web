// Keeping company data in the company (Bryce, 2026-10-20: "how do we keep
// other bots like grok seeing all of our numbers and all of our data").
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAdmin } from './accessControl'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const require = createRequire(import.meta.url)

describe('1. bulk exports are admin-only and logged', () => {
  it('the guard is the admin rule (level 3+)', () => {
    const g = read('src/lib/exportGuard.js')
    expect(g).toMatch(/export function canExport\(user\) \{\n\s+return isAdmin\(user\)/)
    expect(g).toMatch(/from\('export_log'\)\.insert/)
    expect(g).toMatch(/allowed: false/)
    expect(isAdmin({ user_role: 'Admin' })).toBe(true)
    expect(isAdmin({ user_role: 'Manager' })).toBe(false)
    expect(isAdmin({ user_role: 'User' })).toBe(false)
  })

  it('both shared list-page exporters ask the guard before building a file', () => {
    const m = read('src/components/ImportExportModal.jsx')
    const csv = m.slice(m.indexOf('export function exportToCSV'), m.indexOf('export async function exportToXLSX'))
    const xlsx = m.slice(m.indexOf('export async function exportToXLSX'))
    expect(csv.indexOf('guardExport(')).toBeGreaterThan(0)
    expect(csv.indexOf('guardExport(')).toBeLessThan(csv.indexOf('new Blob'))
    expect(xlsx.indexOf('guardExport(')).toBeGreaterThan(0)
    expect(xlsx.indexOf('guardExport(')).toBeLessThan(xlsx.indexOf('XLSX.utils'))
  })

  it.each([
    ['src/pages/Reports.jsx', /const exportCSV = \(headers, rows, filename\) => \{\n[^\n]*\n\s+if \(!guardExport\(/],
    ['src/components/ReportsPanel.jsx', /if \(guardExport\(activeReport\.id[^)]*\)\) downloadReportCsv\(activeReport\)/],
    ['src/pages/Books.jsx', /async function buildCpaPackage\([^\n]*\n\s+if \(!guardExport\('cpa_package'/],
    ['src/pages/Books.jsx', /const handleExportCSV = \(\) => \{\n\s+if \(!guardExport\('books_tax_transactions'\)\) return/],
    ['src/pages/books/StripeTransactionsTab.jsx', /const downloadCsv = \(\) => \{\n\s+if \(!guardExport\('stripe_transactions'/],
    ['src/pages/admin/DataConsoleBulkOps.jsx', /if \(!guardExport\(`data_console_all:/],
    ['src/pages/admin/DataConsoleBrowser.jsx', /if \(!guardExport\('data_console_table'\)\) return/],
    ['src/pages/admin/DataConsoleSQL.jsx', /if \(!guardExport\('data_console_sql'\)\) return/],
  ])('%s goes through the guard', (file, re) => {
    expect(read(file)).toMatch(re)
  })

  it('a report the card list hides cannot be reached by typing its URL', () => {
    const r = read('src/pages/Reports.jsx')
    expect(r).toMatch(/if \(currentReport && !visibleReports\.some\(\(r\) => r\.id === currentReport\.id\)\) \{\n\s+return \(/)
  })

  it('the Employees export drops pay and tax class without HR access', () => {
    expect(read('src/pages/Employees.jsx')).toMatch(/hasHR \? employeesFields : employeesFields\.filter\(\(f\) => !\['hourly_rate', 'annual_salary', 'tax_classification'\]\.includes\(f\.field\)\)/)
  })

  it('the log can be written by its author and read by admins, never edited', () => {
    const m = read('supabase/migrations/20261020100000_export_log.sql')
    expect(m).toMatch(/for insert to authenticated/)
    expect(m).toMatch(/using \(public\.is_company_admin_of\(company_id\)\)/)
    expect(m).not.toMatch(/for (update|delete)/)
  })
})

describe('payroll files are generated only for a payroll admin of that company', () => {
  it('render-tax-forms checks the caller before reading anything', () => {
    const f = read('supabase/functions/render-tax-forms/index.ts')
    const gate = f.indexOf("rpc('is_payroll_admin_of'")
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(f.indexOf(".from('companies')"))
    expect(f).toMatch(/if \(gateErr \|\| ok !== true\) return json\(\{ error: 'Only a payroll admin of this company can generate its tax forms\.' \}, 403\)/)
  })
  it('a Super Admin can pull the direct-deposit file', () => {
    expect(read('supabase/functions/payroll-dd-export/index.ts')).toMatch(/\['Admin', 'admin', 'Owner', 'owner', 'Super Admin'\]\.includes\(e\.user_role\)/)
  })
})

describe('2. storage: no anonymous access, own company only', () => {
  const m = read('supabase/migrations/20261020120000_storage_company_scoped.sql')
  it('drops every policy that let the anon key read, upload or delete', () => {
    for (const p of ['project_docs_select', 'project_docs_insert', 'project_docs_delete', 'public_read_audit_photos', 'public_read_employee_photos']) {
      expect(m).toMatch(new RegExp(`drop policy if exists ${p} on storage\\.objects`))
    }
  })
  it('every new policy is for signed-in people and scoped to their company', () => {
    const creates = [...m.matchAll(/create policy (\w+) on storage\.objects\n\s+for (\w+) to (\w+)\n\s+using \(([^\n]+)\);/g)]
    expect(creates).toHaveLength(9)
    for (const [, , , role, using] of creates) {
      expect(role).toBe('authenticated')
      expect(using).toMatch(/public\.can_touch_storage_object\(bucket_id, name, owner\)/)
    }
  })
  it('the helpers are not callable by the anon role', () => {
    expect(m).toMatch(/revoke all on function public\.storage_object_company\(text, text, uuid\) from public, anon;/)
    expect(m).toMatch(/revoke all on function public\.can_touch_storage_object\(text, text, uuid\) from public, anon;/)
  })
  it('the onboarding portal gets its PDFs signed by the server, not with the anon key', () => {
    expect(read('supabase/functions/employee-onboarding/index.ts')).toMatch(/createSignedUrl\(v\.pdf_storage_path, 6 \* 3600\)/)
    const p = read('src/pages/OnboardingPortal.jsx')
    expect(p).toMatch(/if \(handbook\.signed_url\) \{ setPdfUrl\(handbook\.signed_url\)/)
    expect(p).toMatch(/if \(docConfig\.signed_url\) \{ setPdfUrl\(docConfig\.signed_url\)/)
  })
})

describe('3. new-sign-in alerts', () => {
  const cron = require('../../api/cron/sign-in-alerts.js')
  it('says why a sign-in is worth a look', () => {
    expect(cron.concernFor('program: node')).toMatch(/program, not a web browser/)
    expect(cron.concernFor('browser: Linux · Chrome')).toMatch(/AI browser agents usually run this way/)
    expect(cron.concernFor('browser: Windows · Chrome')).toMatch(/has not signed in with before/)
  })
  it('the email names the person, the kind and the time, and escapes what it prints', () => {
    const m = cron.alertEmail('HHH', [{ employee_name: '<b>Eve</b>', kind: 'browser: Linux · Chrome', signed_in_at: '2026-10-20T15:00:00Z', ip: '140.248.52.118' }])
    expect(m.subject).toBe('New sign-in: <b>Eve</b> (Linux · Chrome)')
    expect(m.html).toMatch(/&lt;b&gt;Eve&lt;\/b&gt;/)
    expect(m.html).toMatch(/140\.248\.52\.118/)
  })
  it('JobScout\'s own desktop agent is not alerted, and it runs every 15 minutes', () => {
    expect(read('api/cron/sign-in-alerts.js')).toMatch(/filter\(\(x\) => !x\.desktop_agent && x\.company_id != null\)/)
    expect(JSON.parse(read('vercel.json')).crons).toContainEqual({ path: '/api/cron/sign-in-alerts', schedule: '*/15 * * * *' })
  })
  it('only the service role can run the finder', () => {
    const m = read('supabase/migrations/20261020110000_sign_in_alerts.sql')
    expect(m).toMatch(/revoke all on function public\.new_sign_ins\(\) from public, anon, authenticated;/)
    expect(m).toMatch(/grant execute on function public\.new_sign_ins\(\) to service_role;/)
  })
})

describe('the Export button is not there for non-admins', () => {
  it('the gate renders children only for someone who may export', () => {
    expect(read('src/lib/exportGuard.js')).toMatch(/export function ExportGate\(\{ children \}\) \{\n\s+const user = useStore\(\(s\) => s\.user\)\n\s+return canExport\(user\) \? children : null/)
  })
  it.each(['Customers', 'Leads', 'Jobs', 'Estimates', 'ProductsServices', 'Inventory', 'Fleet', 'Appointments'])('%s wraps its Export button', (p) => {
    const s = read(`src/pages/${p}.jsx`)
    expect(s).toMatch(/<ExportGate>\n\s+(<Tooltip text="Export to CSV">\n\s+)?<button onClick=\{\(\) => exportTo(CSV|XLSX)\(/)
    expect(s).toMatch(/import \{ ExportGate \} from '\.\.\/lib\/exportGuard'/)
  })
})
