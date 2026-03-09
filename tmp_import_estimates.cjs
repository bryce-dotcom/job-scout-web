// Import ServiceTitan estimates into quotes table
// Links to existing customers, employees, and jobs by name matching

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://tzrhfhisdeahrrmeksif.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU';
const COMPANY_ID = 3;

const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// Simple CSV parser that handles quoted fields
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current || lines.length > 0) {
        lines.push(current);
        current = '';
      }
      if (lines.length > 0) {
        // yield row
        lines._rows = lines._rows || [];
        lines._rows.push([...lines]);
        lines.length = 0;
      }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current || lines.length > 0) {
    lines.push(current);
    lines._rows = lines._rows || [];
    lines._rows.push([...lines]);
  }
  return lines._rows || [];
}

async function fetchAll(table, select = '*', filters = '') {
  const allRows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&company_id=eq.${COMPANY_ID}${filters}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!Array.isArray(data)) { console.error('Fetch error:', data); break; }
    allRows.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return allRows;
}

async function main() {
  // 1. Parse CSV
  const csvPath = path.join('C:', 'Users', 'bwest', 'Downloads', 'hhh-building-services-estimates-export20260306-103-xmlxg8 (1).csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csvText);

  const headerRow = rows[0];
  console.log('Headers:', headerRow.join(' | '));
  console.log('Total rows:', rows.length - 1);
  console.log('Sample row:', rows[1].join(' | '));
  console.log('Sample row 7:', rows[6].join(' | '));

  // Map header positions
  const colMap = {};
  headerRow.forEach((h, i) => { colMap[h.trim()] = i; });
  console.log('\nColumn map:', colMap);

  // 2. Fetch existing data for matching
  console.log('\nFetching customers...');
  const customers = await fetchAll('customers', 'id,name');
  console.log(`  ${customers.length} customers`);

  console.log('Fetching employees...');
  const employees = await fetchAll('employees', 'id,name');
  console.log(`  ${employees.length} employees`);

  console.log('Fetching existing quotes...');
  const existingQuotes = await fetchAll('quotes', 'id,quote_id');
  console.log(`  ${existingQuotes.length} existing quotes`);
  const existingQuoteIds = new Set(existingQuotes.map(q => q.quote_id));

  console.log('Fetching jobs...');
  const jobs = await fetchAll('jobs', 'id,job_title,customer_id,start_date');
  console.log(`  ${jobs.length} jobs`);

  // Build lookup maps
  const customerByName = {};
  customers.forEach(c => {
    if (c.name) customerByName[c.name.toLowerCase().trim()] = c.id;
  });

  const employeeByName = {};
  employees.forEach(e => {
    if (e.name) employeeByName[e.name.toLowerCase().trim()] = e.id;
  });

  // Jobs by customer_id for linking
  const jobsByCustomer = {};
  jobs.forEach(j => {
    if (j.customer_id) {
      if (!jobsByCustomer[j.customer_id]) jobsByCustomer[j.customer_id] = [];
      jobsByCustomer[j.customer_id].push(j);
    }
  });

  // 3. Process estimate rows
  const toInsert = [];
  let skipped = 0;
  let noCustomer = 0;
  let matched = 0;
  let jobLinked = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 10) continue;

    const estimateNum = row[colMap['Estimate #']]?.trim();
    const customerName = row[colMap['Customer name']]?.trim();
    const employeeStr = row[colMap['Employees']]?.trim();
    const route = row[colMap['Route']]?.trim();

    // Columns 5-8 based on position (header mapping may be off by one due to ServiceTitan export)
    // Detect: is column 5 a date or status?
    const col5 = row[5]?.trim();
    const col6 = row[6]?.trim();
    const col7 = row[7]?.trim();

    let createdDate, scheduledDate, outcome;

    // col5 looks like a date (starts with 20xx), col6 is either date or empty, col7 is outcome
    if (col5 && col5.match(/^\d{4}-/)) {
      createdDate = col5;
      scheduledDate = col6 && col6.match(/^\d{4}-/) ? col6 : null;
      outcome = col6 && !col6.match(/^\d{4}-/) ? col6 : col7;
    } else {
      createdDate = col6;
      scheduledDate = col7 && col7.match(/^\d{4}-/) ? col7 : null;
      outcome = col7 && !col7.match(/^\d{4}-/) ? col7 : row[8]?.trim();
    }

    // Values - find the dollar amounts
    let openValue = '', wonValue = '', lostValue = '';
    // Scan remaining columns for dollar values
    for (let c = 8; c < row.length; c++) {
      const val = row[c]?.trim();
      if (val && val.startsWith('$')) {
        if (!openValue) openValue = val;
        else if (!wonValue) wonValue = val;
        else if (!lostValue) lostValue = val;
      }
    }

    const locationName = row[row.length - 1]?.trim();
    const tags = row[row.length - 2]?.trim();
    const leadSource = row[row.length - 3]?.trim();

    // Parse dollar value
    const parseDollar = (str) => {
      if (!str) return null;
      const n = parseFloat(str.replace(/[$,]/g, ''));
      return isNaN(n) ? null : n;
    };

    // Determine amount: use won > open > lost
    const amount = parseDollar(wonValue) || parseDollar(openValue) || parseDollar(lostValue) || 0;

    // Map outcome+route to status
    let status;
    if (outcome === 'won') status = 'Approved';
    else if (outcome === 'lost') status = 'Rejected';
    else if (route === 'Awaiting approval' || route === 'Scheduled') status = 'Sent';
    else if (route === 'Done' || route === 'Approved' || route === 'Pro approved') status = 'Approved';
    else if (route === 'Declined') status = 'Rejected';
    else status = 'Draft';

    // Create quote_id
    const quoteId = `ST-${estimateNum}`;

    // Skip if already exists
    if (existingQuoteIds.has(quoteId)) {
      skipped++;
      continue;
    }

    // Match customer
    const custId = customerByName[customerName?.toLowerCase().trim()];
    if (!custId) {
      noCustomer++;
      if (noCustomer <= 5) console.log(`  No customer match: "${customerName}"`);
    } else {
      matched++;
    }

    // Match employee (take first if multiple)
    let salespersonId = null;
    if (employeeStr) {
      const empNames = employeeStr.split(',').map(s => s.trim());
      for (const empName of empNames) {
        const eid = employeeByName[empName.toLowerCase()];
        if (eid) { salespersonId = eid; break; }
      }
    }

    // Try to link to a job (same customer, closest date)
    let jobId = null;
    if (custId && jobsByCustomer[custId]) {
      const customerJobs = jobsByCustomer[custId];
      if (createdDate) {
        const estTime = new Date(createdDate).getTime();
        let bestJob = null;
        let bestDiff = Infinity;
        for (const j of customerJobs) {
          if (j.start_date) {
            const diff = Math.abs(new Date(j.start_date).getTime() - estTime);
            if (diff < bestDiff) { bestDiff = diff; bestJob = j; }
          }
        }
        // Link if within 30 days
        if (bestJob && bestDiff < 30 * 24 * 60 * 60 * 1000) {
          jobId = bestJob.id;
          jobLinked++;
        }
      }
    }

    toInsert.push({
      company_id: COMPANY_ID,
      quote_id: quoteId,
      customer_id: custId || null,
      salesperson_id: salespersonId,
      job_id: jobId,
      estimate_name: customerName ? `Estimate for ${customerName}` : `Estimate #${estimateNum}`,
      status,
      quote_amount: amount,
      service_date: scheduledDate ? new Date(scheduledDate).toISOString().split('T')[0] : null,
      created_at: createdDate ? new Date(createdDate).toISOString() : new Date().toISOString(),
      business_unit: locationName || null,
      notes: [
        route ? `ServiceTitan Route: ${route}` : '',
        tags ? `Tags: ${tags}` : '',
        leadSource ? `Lead Source: ${leadSource}` : ''
      ].filter(Boolean).join('\n') || null,
    });
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total CSV rows: ${rows.length - 1}`);
  console.log(`To insert: ${toInsert.length}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Customer matched: ${matched}`);
  console.log(`No customer match: ${noCustomer}`);
  console.log(`Job linked: ${jobLinked}`);
  console.log(`\nSample insert:`, JSON.stringify(toInsert[0], null, 2));
  console.log(`Sample insert 2:`, JSON.stringify(toInsert[5], null, 2));

  // 4. Batch insert
  if (toInsert.length === 0) {
    console.log('Nothing to insert');
    return;
  }

  console.log(`\nInserting ${toInsert.length} estimates in batches of 100...`);
  let inserted = 0;
  let errors = 0;

  for (let batch = 0; batch < toInsert.length; batch += 100) {
    const chunk = toInsert.slice(batch, batch + 100);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/quotes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal,count=exact' },
      body: JSON.stringify(chunk)
    });

    if (res.ok) {
      const range = res.headers.get('content-range');
      const count = range ? parseInt(range.split('/')[1]) : chunk.length;
      inserted += chunk.length;
      console.log(`  Batch ${Math.floor(batch / 100) + 1}: inserted ${chunk.length} (total: ${inserted})`);
    } else {
      const err = await res.text();
      errors++;
      console.error(`  Batch ${Math.floor(batch / 100) + 1} FAILED:`, err);
      // Try inserting one by one to find the problem
      if (errors === 1) {
        console.log('  Retrying individually...');
        for (const item of chunk) {
          const r2 = await fetch(`${SUPABASE_URL}/rest/v1/quotes`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify(item)
          });
          if (r2.ok) {
            inserted++;
          } else {
            const e2 = await r2.text();
            console.error(`  FAILED: ${item.quote_id} - ${e2}`);
          }
        }
      }
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Errors: ${errors}`);
}

main().catch(console.error);
