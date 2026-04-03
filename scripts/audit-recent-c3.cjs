require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SINCE = '2026-03-12';
const C3 = 3;
const C5 = 5;

// Paginated fetch helper - handles tables with >1000 rows
async function fetchAll(table, selectFields, companyId, filters = {}) {
  const allRows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase
      .from(table)
      .select(selectFields)
      .eq('company_id', companyId)
      .range(from, from + pageSize - 1);

    if (filters.gte) {
      for (const [col, val] of Object.entries(filters.gte)) {
        query = query.gte(col, val);
      }
    }
    if (filters.order) {
      query = query.order(filters.order, { ascending: true });
    }

    const { data, error } = await query;
    if (error) {
      console.error(`  ERROR fetching ${table} (company ${companyId}):`, error.message);
      return [];
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

function fmt(val) {
  if (val === null || val === undefined) return '—';
  return String(val);
}

function fmtMoney(val) {
  if (val === null || val === undefined) return '—';
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function separator(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

async function main() {
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`  COMPANY 3 vs COMPANY 5 — RECENT DATA AUDIT (since ${SINCE})`);
  console.log(`${'#'.repeat(70)}`);

  // ──────────────────────────────────────────
  // 1. LEADS
  // ──────────────────────────────────────────
  separator('1. LEADS');

  const leadsC3 = await fetchAll('leads', 'id,customer_name,status,lead_source,created_date,created_at,salesperson', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const leadsC5 = await fetchAll('leads', 'id,customer_name,status,lead_source,created_date,created_at,salesperson', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${leadsC3.length} leads created since ${SINCE}`);
  console.log(`  Company 5: ${leadsC5.length} leads created since ${SINCE}`);

  if (leadsC3.length > 0) {
    const c5Names = new Set(leadsC5.map(l => (l.customer_name || '').toLowerCase().trim()));
    console.log('\n  Company 3 Leads:');
    console.log('  ' + '-'.repeat(66));
    for (const l of leadsC3) {
      const matchInC5 = c5Names.has((l.customer_name || '').toLowerCase().trim());
      console.log(`  • ${fmt(l.customer_name).padEnd(30)} | ${fmt(l.status).padEnd(15)} | src: ${fmt(l.lead_source).padEnd(15)} | ${fmtDate(l.created_date || l.created_at)} | rep: ${fmt(l.salesperson)} ${matchInC5 ? '✓ C5' : '✗ NOT in C5'}`);
    }
  }

  // ──────────────────────────────────────────
  // 2. QUOTES
  // ──────────────────────────────────────────
  separator('2. QUOTES');

  const quotesC3 = await fetchAll('quotes', 'id,quote_id,status,quote_amount,customer_id,created_at', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const quotesC5 = await fetchAll('quotes', 'id,quote_id,status,quote_amount,customer_id,created_at', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${quotesC3.length} quotes created since ${SINCE}`);
  console.log(`  Company 5: ${quotesC5.length} quotes created since ${SINCE}`);

  if (quotesC3.length > 0) {
    console.log('\n  Company 3 Quotes:');
    console.log('  ' + '-'.repeat(66));
    for (const q of quotesC3) {
      console.log(`  • quote_id: ${fmt(q.quote_id).padEnd(12)} | ${fmt(q.status).padEnd(12)} | ${fmtMoney(q.quote_amount).padEnd(12)} | cust_id: ${fmt(q.customer_id).padEnd(6)} | ${fmtDate(q.created_at)}`);
    }
  }

  if (quotesC5.length > 0) {
    console.log('\n  Company 5 Quotes:');
    console.log('  ' + '-'.repeat(66));
    for (const q of quotesC5) {
      console.log(`  • quote_id: ${fmt(q.quote_id).padEnd(12)} | ${fmt(q.status).padEnd(12)} | ${fmtMoney(q.quote_amount).padEnd(12)} | cust_id: ${fmt(q.customer_id).padEnd(6)} | ${fmtDate(q.created_at)}`);
    }
  }

  // ──────────────────────────────────────────
  // 3. JOBS
  // ──────────────────────────────────────────
  separator('3. JOBS');

  const jobsC3 = await fetchAll('jobs', 'id,job_id,status,job_total,customer_name,start_date,created_at', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const jobsC5 = await fetchAll('jobs', 'id,job_id,status,job_total,customer_name,start_date,created_at', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${jobsC3.length} jobs created since ${SINCE}`);
  console.log(`  Company 5: ${jobsC5.length} jobs created since ${SINCE}`);

  if (jobsC3.length > 0) {
    const c5JobNames = new Set(jobsC5.map(j => (j.customer_name || '').toLowerCase().trim()));
    console.log('\n  Company 3 Jobs:');
    console.log('  ' + '-'.repeat(66));
    for (const j of jobsC3) {
      const matchInC5 = c5JobNames.has((j.customer_name || '').toLowerCase().trim());
      console.log(`  • job_id: ${fmt(j.job_id).padEnd(10)} | ${fmt(j.status).padEnd(14)} | ${fmtMoney(j.job_total).padEnd(12)} | ${fmt(j.customer_name).padEnd(25)} | start: ${fmtDate(j.start_date)} | ${fmtDate(j.created_at)} ${matchInC5 ? '✓ C5' : '✗ NOT in C5'}`);
    }
  }

  // ──────────────────────────────────────────
  // 4. INVOICES
  // ──────────────────────────────────────────
  separator('4. INVOICES');

  const invoicesC3 = await fetchAll('invoices', 'id,invoice_id,payment_status,amount,created_at', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const invoicesC5 = await fetchAll('invoices', 'id,invoice_id,payment_status,amount,created_at', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${invoicesC3.length} invoices created since ${SINCE}`);
  console.log(`  Company 5: ${invoicesC5.length} invoices created since ${SINCE}`);

  if (invoicesC3.length > 0) {
    // Try to match by amount + date proximity
    console.log('\n  Company 3 Invoices:');
    console.log('  ' + '-'.repeat(66));
    for (const inv of invoicesC3) {
      const invDate = new Date(inv.created_at).toISOString().slice(0, 10);
      const matchInC5 = invoicesC5.some(i5 => {
        const i5Date = new Date(i5.created_at).toISOString().slice(0, 10);
        return Number(i5.amount) === Number(inv.amount) && i5Date === invDate;
      });
      console.log(`  • inv_id: ${fmt(inv.invoice_id).padEnd(12)} | ${fmt(inv.payment_status).padEnd(12)} | ${fmtMoney(inv.amount).padEnd(12)} | ${fmtDate(inv.created_at)} ${matchInC5 ? '✓ C5 match (amt+date)' : '✗ no C5 match'}`);
    }
  }

  // ──────────────────────────────────────────
  // 5. PAYMENTS
  // ──────────────────────────────────────────
  separator('5. PAYMENTS');

  const paymentsC3 = await fetchAll('payments', 'id,payment_id,amount,method,status,date,created_at', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const paymentsC5 = await fetchAll('payments', 'id,payment_id,amount,method,status,date,created_at', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${paymentsC3.length} payments created since ${SINCE}`);
  console.log(`  Company 5: ${paymentsC5.length} payments created since ${SINCE}`);

  if (paymentsC3.length > 0) {
    console.log('\n  Company 3 Payments:');
    console.log('  ' + '-'.repeat(66));
    for (const p of paymentsC3) {
      const matchInC5 = paymentsC5.some(p5 => {
        return Number(p5.amount) === Number(p.amount) && p5.date === p.date;
      });
      console.log(`  • pay_id: ${fmt(p.payment_id).padEnd(12)} | ${fmtMoney(p.amount).padEnd(12)} | method: ${fmt(p.method).padEnd(10)} | ${fmt(p.status).padEnd(10)} | date: ${fmtDate(p.date)} ${matchInC5 ? '✓ C5 match' : '✗ no C5 match'}`);
    }
  }

  // ──────────────────────────────────────────
  // 6. CUSTOMERS
  // ──────────────────────────────────────────
  separator('6. CUSTOMERS');

  const customersC3 = await fetchAll('customers', 'id,name,created_at', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const customersC5 = await fetchAll('customers', 'id,name,created_at', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${customersC3.length} customers created since ${SINCE}`);
  console.log(`  Company 5: ${customersC5.length} customers created since ${SINCE}`);

  if (customersC3.length > 0) {
    const c5CustNames = new Set(customersC5.map(c => (c.name || '').toLowerCase().trim()));
    const showing = customersC3.slice(0, 10);
    console.log(`\n  Company 3 Customers (first ${showing.length} of ${customersC3.length}):`);
    console.log('  ' + '-'.repeat(66));
    for (const c of showing) {
      const matchInC5 = c5CustNames.has((c.name || '').toLowerCase().trim());
      console.log(`  • ${fmt(c.name).padEnd(35)} | ${fmtDate(c.created_at)} ${matchInC5 ? '✓ C5' : '✗ NOT in C5'}`);
    }
    if (customersC3.length > 10) {
      console.log(`  ... and ${customersC3.length - 10} more`);
    }
  }

  // ──────────────────────────────────────────
  // 7. APPOINTMENTS
  // ──────────────────────────────────────────
  separator('7. APPOINTMENTS');

  const apptsC3 = await fetchAll('appointments', 'id,title,status,start_time,created_at', C3, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });
  const apptsC5 = await fetchAll('appointments', 'id,title,status,start_time,created_at', C5, {
    gte: { created_at: SINCE },
    order: 'created_at'
  });

  console.log(`\n  Company 3: ${apptsC3.length} appointments created since ${SINCE}`);
  console.log(`  Company 5: ${apptsC5.length} appointments created since ${SINCE}`);

  if (apptsC3.length > 0) {
    const c5Titles = new Set(apptsC5.map(a => (a.title || '').toLowerCase().trim()));
    console.log('\n  Company 3 Appointments:');
    console.log('  ' + '-'.repeat(66));
    for (const a of apptsC3) {
      const matchInC5 = c5Titles.has((a.title || '').toLowerCase().trim());
      console.log(`  • ${fmt(a.title).padEnd(35)} | ${fmt(a.status).padEnd(12)} | start: ${fmtDate(a.start_time)} ${matchInC5 ? '✓ C5' : '✗ NOT in C5'}`);
    }
  }

  // ──────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────
  separator('SUMMARY');
  console.log(`
  Table           | Company 3  | Company 5
  ----------------|------------|----------
  Leads           | ${String(leadsC3.length).padEnd(10)} | ${leadsC5.length}
  Quotes          | ${String(quotesC3.length).padEnd(10)} | ${quotesC5.length}
  Jobs            | ${String(jobsC3.length).padEnd(10)} | ${jobsC5.length}
  Invoices        | ${String(invoicesC3.length).padEnd(10)} | ${invoicesC5.length}
  Payments        | ${String(paymentsC3.length).padEnd(10)} | ${paymentsC5.length}
  Customers       | ${String(customersC3.length).padEnd(10)} | ${customersC5.length}
  Appointments    | ${String(apptsC3.length).padEnd(10)} | ${apptsC5.length}
  `);

  console.log('Done.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
