require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COMPANY_ID = 3;

async function getCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', COMPANY_ID);
  if (error) return { count: null, error: error.message };
  return { count };
}

// Paginated fetch of a single column for breakdown
async function getAllValues(table, field) {
  const allValues = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(field)
      .eq('company_id', COMPANY_ID)
      .range(from, from + pageSize - 1);
    if (error) return { error: error.message };
    if (!data || data.length === 0) break;
    allValues.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const counts = {};
  for (const row of allValues) {
    const val = row[field] ?? '(null)';
    counts[val] = (counts[val] || 0) + 1;
  }
  return { breakdown: counts };
}

async function main() {
  console.log(`\n=== COMPANY ${COMPANY_ID} DATA AUDIT ===\n`);

  // 1. Employees - full listing
  console.log('--- EMPLOYEES ---');
  const { data: emps, error: empErr } = await supabase
    .from('employees')
    .select('name, email, role, active')
    .eq('company_id', COMPANY_ID);
  if (empErr) {
    console.log('  ERROR:', empErr.message);
  } else {
    console.log(`  Count: ${emps.length}`);
    for (const e of emps) {
      console.log(`    ${e.name} | ${e.email} | role=${e.role} | active=${e.active}`);
    }
  }

  // 2. Customers
  console.log('\n--- CUSTOMERS ---');
  const cust = await getCount('customers');
  console.log(`  Count: ${cust.count}${cust.error ? ' ERROR: ' + cust.error : ''}`);

  // 3. Leads
  console.log('\n--- LEADS ---');
  const leads = await getCount('leads');
  console.log(`  Count: ${leads.count}${leads.error ? ' ERROR: ' + leads.error : ''}`);
  const leadStatus = await getAllValues('leads', 'status');
  if (leadStatus.breakdown) console.log('  Status breakdown:', JSON.stringify(leadStatus.breakdown, null, 2));

  // 4. Quotes
  console.log('\n--- QUOTES ---');
  const quotes = await getCount('quotes');
  console.log(`  Count: ${quotes.count}${quotes.error ? ' ERROR: ' + quotes.error : ''}`);
  const quoteStatus = await getAllValues('quotes', 'status');
  if (quoteStatus.breakdown) console.log('  Status breakdown:', JSON.stringify(quoteStatus.breakdown, null, 2));

  // 5. Quote Lines
  console.log('\n--- QUOTE_LINES ---');
  const { data: qIds } = await supabase.from('quotes').select('id').eq('company_id', COMPANY_ID).limit(10000);
  if (qIds && qIds.length > 0) {
    const { count, error } = await supabase.from('quote_lines').select('*', { count: 'exact', head: true }).in('quote_id', qIds.map(q => q.id));
    console.log(`  Count: ${count}${error ? ' ERROR: ' + error.message : ''}`);
  } else {
    console.log('  Count: 0 (no quotes)');
  }

  // 6. Jobs
  console.log('\n--- JOBS ---');
  const jobs = await getCount('jobs');
  console.log(`  Count: ${jobs.count}${jobs.error ? ' ERROR: ' + jobs.error : ''}`);
  const jobStatus = await getAllValues('jobs', 'status');
  if (jobStatus.breakdown) console.log('  Status breakdown:', JSON.stringify(jobStatus.breakdown, null, 2));

  // 7. Job Lines
  console.log('\n--- JOB_LINES ---');
  const { data: jIds } = await supabase.from('jobs').select('id').eq('company_id', COMPANY_ID).limit(10000);
  if (jIds && jIds.length > 0) {
    const { count, error } = await supabase.from('job_lines').select('*', { count: 'exact', head: true }).in('job_id', jIds.map(j => j.id));
    console.log(`  Count: ${count}${error ? ' ERROR: ' + error.message : ''}`);
  } else {
    console.log('  Count: 0 (no jobs)');
  }

  // 8. Invoices
  console.log('\n--- INVOICES ---');
  const invoices = await getCount('invoices');
  console.log(`  Count: ${invoices.count}${invoices.error ? ' ERROR: ' + invoices.error : ''}`);
  const invStatus = await getAllValues('invoices', 'payment_status');
  if (invStatus.breakdown) console.log('  Payment status breakdown:', JSON.stringify(invStatus.breakdown, null, 2));

  // 9. Payments
  console.log('\n--- PAYMENTS ---');
  const payments = await getCount('payments');
  console.log(`  Count: ${payments.count}${payments.error ? ' ERROR: ' + payments.error : ''}`);
  const payStatus = await getAllValues('payments', 'status');
  if (payStatus.breakdown) console.log('  Status breakdown:', JSON.stringify(payStatus.breakdown, null, 2));

  // 10. Products & Services
  console.log('\n--- PRODUCTS_SERVICES ---');
  const ps = await getCount('products_services');
  console.log(`  Count: ${ps.count}${ps.error ? ' ERROR: ' + ps.error : ''}`);

  // 11. Appointments
  console.log('\n--- APPOINTMENTS ---');
  const appts = await getCount('appointments');
  console.log(`  Count: ${appts.count}${appts.error ? ' ERROR: ' + appts.error : ''}`);

  // 12. Settings
  console.log('\n--- SETTINGS ---');
  const { data: settings, error: setErr } = await supabase
    .from('settings')
    .select('key')
    .eq('company_id', COMPANY_ID);
  if (setErr) {
    console.log('  ERROR:', setErr.message);
  } else {
    console.log(`  Count: ${settings.length}`);
    console.log('  Keys:', settings.map(s => s.key).join(', '));
  }

  // 13. Bank Accounts
  console.log('\n--- BANK_ACCOUNTS ---');
  const ba = await getCount('bank_accounts');
  console.log(`  Count: ${ba.count}${ba.error ? ' ERROR: ' + ba.error : ''}`);

  // 14. Expense Categories
  console.log('\n--- EXPENSE_CATEGORIES ---');
  const ec = await getCount('expense_categories');
  console.log(`  Count: ${ec.count}${ec.error ? ' ERROR: ' + ec.error : ''}`);

  // 15. Manual Expenses
  console.log('\n--- MANUAL_EXPENSES ---');
  const me = await getCount('manual_expenses');
  console.log(`  Count: ${me.count}${me.error ? ' ERROR: ' + me.error : ''}`);

  console.log('\n=== AUDIT COMPLETE ===\n');
}

main().catch(console.error);
