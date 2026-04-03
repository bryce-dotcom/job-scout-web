const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COMPANY_ID = 5;
const TODAY = '2026-04-02';
const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c';
const HCP_BASE = 'https://api.housecallpro.com';

// Paginated fetch to get all rows beyond 1000 limit
async function getAllRows(table, selectCols, filters = {}) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(selectCols)
      .eq('company_id', COMPANY_ID)
      .range(offset, offset + PAGE_SIZE - 1);

    for (const [key, val] of Object.entries(filters)) {
      query = query.eq(key, val);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`  Error fetching ${table}: ${error.message}`);
      return allData;
    }
    allData = allData.concat(data);
    hasMore = data.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
  return allData;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  return dateStr.startsWith(TODAY);
}

function printSample(label, rows, dateFields) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label} - Sample (${rows.length} shown)`);
  console.log('='.repeat(70));
  for (const row of rows) {
    const parts = dateFields.map(f => `${f}: ${row[f] || '(null)'}`);
    console.log(`  id=${row.id}  ${parts.join('  |  ')}`);
  }
}

function printDateCounts(label, allRows, dateField) {
  const total = allRows.length;
  const todayCount = allRows.filter(r => isToday(r[dateField])).length;
  const historicalCount = total - todayCount;
  const pct = total > 0 ? ((todayCount / total) * 100).toFixed(1) : 0;
  console.log(`\n  ${label} — Total: ${total}`);
  console.log(`    created_at = today (${TODAY}): ${todayCount} (${pct}%)`);
  console.log(`    created_at = historical: ${historicalCount}`);
  if (todayCount > 0 && historicalCount > 0) {
    // Show date range of historical
    const historical = allRows
      .filter(r => !isToday(r[dateField]) && r[dateField])
      .map(r => r[dateField])
      .sort();
    if (historical.length > 0) {
      console.log(`    Historical range: ${historical[0].substring(0, 10)} to ${historical[historical.length - 1].substring(0, 10)}`);
    }
  }
}

async function auditTable(table, dateFields, sampleSize = 10) {
  // Get sample
  const { data: sample, error } = await supabase
    .from(table)
    .select(['id', ...dateFields].join(','))
    .eq('company_id', COMPANY_ID)
    .order('id', { ascending: true })
    .limit(sampleSize);

  if (error) {
    console.error(`  Error sampling ${table}: ${error.message}`);
    return;
  }

  printSample(table.toUpperCase(), sample, dateFields);

  // Get all rows for count
  const allRows = await getAllRows(table, ['id', 'created_at'].join(','));
  printDateCounts(table.toUpperCase(), allRows, 'created_at');
}

async function fetchHCP(endpoint, limit = 5) {
  const url = `${HCP_BASE}/${endpoint}?page_size=${limit}&page=1`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Token ${HCP_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    console.error(`  HCP ${endpoint} error: ${res.status} ${res.statusText}`);
    return [];
  }
  const json = await res.json();
  // HCP returns data in various keys
  return json.jobs || json.invoices || json.estimates || json.customers || json.data || [];
}

function printHCPDates(label, items) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  HCP RAW: ${label} (${items.length} items)`);
  console.log('='.repeat(70));

  const dateKeywords = ['date', 'time', 'created', 'updated', 'scheduled', 'completed', 'due', 'sent', 'paid', 'start', 'end', 'at'];

  for (const item of items) {
    console.log(`\n  --- ${label} id: ${item.id} ---`);
    // Find all date-like fields (top level and nested)
    function findDates(obj, prefix = '') {
      for (const [key, val] of Object.entries(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          findDates(val, fullKey);
        } else if (dateKeywords.some(kw => key.toLowerCase().includes(kw))) {
          console.log(`    ${fullKey}: ${val}`);
        }
      }
    }
    findDates(item);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║          DATE AUDIT — Company 5 — checking for today-dates         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // 1. Jobs
  await auditTable('jobs', ['created_at', 'start_date', 'end_date']);

  // 2. Invoices
  await auditTable('invoices', ['created_at']);

  // 3. Quotes
  await auditTable('quotes', ['created_at']);

  // 4. Leads
  await auditTable('leads', ['created_at', 'created_date']);

  // 5. Payments
  await auditTable('payments', ['created_at', 'date']);

  // 6. Customers
  await auditTable('customers', ['created_at'], 5);

  // HCP raw data
  console.log('\n\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║               HCP RAW API — Date Fields Available                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const hcpJobs = await fetchHCP('jobs', 5);
  printHCPDates('Jobs', hcpJobs);

  const hcpInvoices = await fetchHCP('invoices', 5);
  printHCPDates('Invoices', hcpInvoices);

  const hcpEstimates = await fetchHCP('estimates', 5);
  printHCPDates('Estimates', hcpEstimates);

  console.log('\n\nDone.');
}

main().catch(console.error);
