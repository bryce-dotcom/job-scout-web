const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pipeline stage IDs that SalesPipeline.jsx uses to filter
const PIPELINE_STATUSES = [
  'New', 'Contacted', 'Appointment Set', 'Qualified', 'Quote Sent',
  'Negotiation', 'Won', 'Chillin', 'Job Scheduled', 'In Progress',
  'Job Complete', 'Invoiced', 'Closed', 'Lost',
  // Legacy statuses also fetched
  'Assigned', 'Callback', 'Converted', 'Not Qualified'
];

async function statusCounts(table, companyId, field = 'status') {
  const { data, error } = await supabase
    .from(table)
    .select(field)
    .eq('company_id', companyId);
  if (error) return { error: error.message };
  const counts = {};
  for (const row of data) {
    const val = row[field] ?? '(null)';
    counts[val] = (counts[val] || 0) + 1;
  }
  return { total: data.length, counts };
}

async function sampleRows(table, companyId, columns, limit = 5) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  return data;
}

async function checkTable(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);
  if (error) return { exists: false, error: error.message };
  return { exists: true, sampleCount: data.length };
}

async function main() {
  console.log('='.repeat(70));
  console.log('PIPELINE DIAGNOSTICS');
  console.log('='.repeat(70));

  // ── 1. LEADS TABLE — COMPANY 5 ──
  console.log('\n── 1. LEADS — Company 5 ──');
  const leadsStatus5 = await statusCounts('leads', 5, 'status');
  console.log('Status breakdown:', JSON.stringify(leadsStatus5, null, 2));

  // Check which statuses would match the pipeline filter
  if (leadsStatus5.counts) {
    const matching = {};
    const nonMatching = {};
    for (const [s, c] of Object.entries(leadsStatus5.counts)) {
      if (PIPELINE_STATUSES.includes(s)) {
        matching[s] = c;
      } else {
        nonMatching[s] = c;
      }
    }
    console.log('\nStatuses that MATCH pipeline filter:', matching);
    console.log('Statuses that DO NOT match pipeline filter:', nonMatching);
  }

  // Check computed_status column
  const leadsComputed5 = await statusCounts('leads', 5, 'computed_status');
  if (leadsComputed5.error) {
    console.log('\ncomputed_status column: DOES NOT EXIST or error:', leadsComputed5.error);
  } else {
    console.log('\ncomputed_status breakdown:', JSON.stringify(leadsComputed5, null, 2));
  }

  // Check lead_source
  const leadsSource5 = await statusCounts('leads', 5, 'lead_source');
  console.log('\nlead_source breakdown:', JSON.stringify(leadsSource5, null, 2));

  // Sample leads
  const sampleLeads5 = await sampleRows('leads', 5,
    'id, customer_name, status, lead_source, created_at, updated_at');
  console.log('\nSample leads (5 most recent):');
  console.table(sampleLeads5);

  // ── 2. JOBS TABLE — COMPANY 5 ──
  console.log('\n── 2. JOBS — Company 5 ──');
  const jobsStatus5 = await statusCounts('jobs', 5, 'status');
  console.log('Status breakdown:', JSON.stringify(jobsStatus5, null, 2));

  // Check computed_status
  const jobsComputed5 = await statusCounts('jobs', 5, 'computed_status');
  if (jobsComputed5.error) {
    console.log('computed_status column: DOES NOT EXIST or error:', jobsComputed5.error);
  } else {
    console.log('computed_status breakdown:', JSON.stringify(jobsComputed5, null, 2));
  }

  // Sample jobs
  const sampleJobs5 = await sampleRows('jobs', 5,
    'id, job_id, status, customer_name, start_date, job_total, lead_id');
  console.log('\nSample jobs (5 most recent):');
  console.table(sampleJobs5);

  // ── 3. PIPELINE_STAGES TABLE ──
  console.log('\n── 3. PIPELINE_STAGES TABLE ──');
  const pipelineCheck = await checkTable('pipeline_stages');
  console.log('Table check:', pipelineCheck);
  if (pipelineCheck.exists) {
    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('company_id', 5);
    console.log('Company 5 stages:', error ? error.message : data);
  }

  // ── 4. SETTINGS TABLE — PIPELINE RELATED ──
  console.log('\n── 4. SETTINGS — Company 5 (pipeline/stage/column related) ──');
  const { data: allSettings, error: settErr } = await supabase
    .from('settings')
    .select('key, value')
    .eq('company_id', 5);
  if (settErr) {
    console.log('Error:', settErr.message);
  } else {
    console.log(`Total settings for company 5: ${allSettings.length}`);
    const pipelineSettings = allSettings.filter(s =>
      /pipeline|stage|column|status/i.test(s.key)
    );
    console.log('Pipeline/stage/column/status related settings:');
    for (const s of pipelineSettings) {
      console.log(`  ${s.key}: ${JSON.stringify(s.value)}`);
    }
    if (pipelineSettings.length === 0) {
      console.log('  (none found)');
    }
    // Also show all keys for reference
    console.log('\nAll setting keys:', allSettings.map(s => s.key));
  }

  // ── 5. COMPARISON — COMPANY 3 ──
  console.log('\n── 5. COMPARISON — Company 3 ──');
  const leadsStatus3 = await statusCounts('leads', 3, 'status');
  console.log('Leads status breakdown:', JSON.stringify(leadsStatus3, null, 2));

  if (leadsStatus3.counts) {
    const matching3 = {};
    const nonMatching3 = {};
    for (const [s, c] of Object.entries(leadsStatus3.counts)) {
      if (PIPELINE_STATUSES.includes(s)) {
        matching3[s] = c;
      } else {
        nonMatching3[s] = c;
      }
    }
    console.log('Statuses that MATCH pipeline filter:', matching3);
    console.log('Statuses that DO NOT match pipeline filter:', nonMatching3);
  }

  const jobsStatus3 = await statusCounts('jobs', 3, 'status');
  console.log('\nJobs status breakdown:', JSON.stringify(jobsStatus3, null, 2));

  // Settings comparison
  const { data: settings3 } = await supabase
    .from('settings')
    .select('key, value')
    .eq('company_id', 3);
  if (settings3) {
    const pipeSettings3 = settings3.filter(s =>
      /pipeline|stage|column|status/i.test(s.key)
    );
    console.log('\nCompany 3 pipeline/stage/column/status settings:');
    for (const s of pipeSettings3) {
      console.log(`  ${s.key}: ${JSON.stringify(s.value)}`);
    }
    if (pipeSettings3.length === 0) console.log('  (none found)');
  }

  console.log('\n' + '='.repeat(70));
  console.log('DONE');
}

main().catch(console.error);
