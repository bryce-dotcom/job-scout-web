const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COMPANY_ID = 5;

async function getCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', COMPANY_ID);
  if (error) return { count: null, error: error.message };
  return { count };
}

async function getBreakdown(table, field) {
  const { data, error } = await supabase
    .from(table)
    .select(field)
    .eq('company_id', COMPANY_ID);
  if (error) return { error: error.message };
  const counts = {};
  for (const row of data) {
    const val = row[field] ?? '(null)';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

async function main() {
  console.log(`\n=== COMPANY ${COMPANY_ID} DATA AUDIT ===\n`);

  // 1. Employees - full list
  {
    const { data, error } = await supabase
      .from('employees')
      .select('name, email, role, active')
      .eq('company_id', COMPANY_ID);
    if (error) { console.log('employees ERROR:', error.message); }
    else {
      console.log(`EMPLOYEES: ${data.length}`);
      for (const e of data) {
        console.log(`  ${e.name} | ${e.email} | role=${e.role} | active=${e.active}`);
      }
    }
    console.log();
  }

  // 2. Customers
  {
    const r = await getCount('customers');
    console.log(`CUSTOMERS: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 3. Leads
  {
    const r = await getCount('leads');
    console.log(`LEADS: ${r.count ?? 'ERROR: ' + r.error}`);
    const bd = await getBreakdown('leads', 'status');
    if (!bd.error) console.log('  Status breakdown:', bd);
    else console.log('  Breakdown error:', bd.error);
    console.log();
  }

  // 4. Quotes
  {
    const r = await getCount('quotes');
    console.log(`QUOTES: ${r.count ?? 'ERROR: ' + r.error}`);
    const bd = await getBreakdown('quotes', 'status');
    if (!bd.error) console.log('  Status breakdown:', bd);
    else console.log('  Breakdown error:', bd.error);
    console.log();
  }

  // 5. Quote lines
  {
    const r = await getCount('quote_lines');
    console.log(`QUOTE_LINES: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 6. Jobs
  {
    const r = await getCount('jobs');
    console.log(`JOBS: ${r.count ?? 'ERROR: ' + r.error}`);
    const bd = await getBreakdown('jobs', 'status');
    if (!bd.error) console.log('  Status breakdown:', bd);
    else console.log('  Breakdown error:', bd.error);
    console.log();
  }

  // 7. Job lines
  {
    const r = await getCount('job_lines');
    console.log(`JOB_LINES: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 8. Invoices
  {
    const r = await getCount('invoices');
    console.log(`INVOICES: ${r.count ?? 'ERROR: ' + r.error}`);
    const bd = await getBreakdown('invoices', 'payment_status');
    if (!bd.error) console.log('  Payment status breakdown:', bd);
    else console.log('  Breakdown error:', bd.error);
    console.log();
  }

  // 9. Payments
  {
    const r = await getCount('payments');
    console.log(`PAYMENTS: ${r.count ?? 'ERROR: ' + r.error}`);
    const bd = await getBreakdown('payments', 'status');
    if (!bd.error) console.log('  Status breakdown:', bd);
    else console.log('  Breakdown error:', bd.error);
    console.log();
  }

  // 10. Products & Services
  {
    const r = await getCount('products_services');
    console.log(`PRODUCTS_SERVICES: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 11. Appointments
  {
    const r = await getCount('appointments');
    console.log(`APPOINTMENTS: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 12. Settings - list keys
  {
    const { data, error } = await supabase
      .from('settings')
      .select('key')
      .eq('company_id', COMPANY_ID);
    if (error) { console.log('SETTINGS ERROR:', error.message); }
    else {
      console.log(`SETTINGS: ${data.length}`);
      console.log('  Keys:', data.map(s => s.key).join(', '));
    }
    console.log();
  }

  // 13. Bank accounts
  {
    const r = await getCount('bank_accounts');
    console.log(`BANK_ACCOUNTS: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 14. Expense categories
  {
    const r = await getCount('expense_categories');
    console.log(`EXPENSE_CATEGORIES: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  // 15. Manual expenses
  {
    const r = await getCount('manual_expenses');
    console.log(`MANUAL_EXPENSES: ${r.count ?? 'ERROR: ' + r.error}`);
    console.log();
  }

  console.log('=== AUDIT COMPLETE ===\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
