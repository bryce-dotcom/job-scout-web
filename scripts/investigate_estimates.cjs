// Look for HHH quotes with broken FK refs that could cause EstimateDetail to render blank.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function get(p) { const r = await fetch(`${URL}/rest/v1/${p}`, { headers }); return { status: r.status, body: await r.json() }; }

(async () => {
  // Recent quotes for HHH
  const q = await get('quotes?company_id=eq.3&select=id,quote_id,customer_id,lead_id,salesperson_id,technician_id,audit_id,created_at&order=created_at.desc&limit=50');
  console.log('recent quotes:', q.body.length);

  // For each, check if customer_id/salesperson_id/technician_id resolve.
  const custIds = [...new Set(q.body.map(r => r.customer_id).filter(Boolean))];
  const empIds = [...new Set([...q.body.map(r => r.salesperson_id), ...q.body.map(r => r.technician_id)].filter(Boolean))];
  const auditIds = [...new Set(q.body.map(r => r.audit_id).filter(Boolean))];

  const cs = custIds.length ? await get(`customers?id=in.(${custIds.join(',')})&select=id`) : { body: [] };
  const es = empIds.length ? await get(`employees?id=in.(${empIds.join(',')})&select=id`) : { body: [] };
  const as = auditIds.length ? await get(`audits?id=in.(${auditIds.join(',')})&select=id`) : { body: [] };
  if (!Array.isArray(as.body)) { console.log('audits err:', as.status, JSON.stringify(as.body).slice(0, 200)); as.body = []; }
  const custOk = new Set(cs.body.map(r => r.id));
  const empOk = new Set(es.body.map(r => r.id));
  const audOk = new Set(as.body.map(r => r.id));

  const broken = q.body.filter(r =>
    (r.customer_id && !custOk.has(r.customer_id)) ||
    (r.salesperson_id && !empOk.has(r.salesperson_id)) ||
    (r.technician_id && !empOk.has(r.technician_id)) ||
    (r.audit_id && !audOk.has(r.audit_id))
  );
  console.log(`broken refs: ${broken.length}`);
  broken.slice(0, 20).forEach(r => {
    const why = [];
    if (r.customer_id && !custOk.has(r.customer_id)) why.push(`cust ${r.customer_id} missing`);
    if (r.salesperson_id && !empOk.has(r.salesperson_id)) why.push(`salesperson ${r.salesperson_id} missing`);
    if (r.technician_id && !empOk.has(r.technician_id)) why.push(`tech ${r.technician_id} missing`);
    if (r.audit_id && !audOk.has(r.audit_id)) why.push(`audit ${r.audit_id} missing`);
    console.log(`  q ${r.id} (${r.quote_id}): ${why.join(', ')}`);
  });

  // Try the EstimateDetail "with technician join" query against a few of these and see which fail.
  console.log('\n=== Probing the actual JOIN query EstimateDetail uses ===');
  // Try one with technician+salesperson, all 50.
  let bad = 0;
  for (const row of q.body) {
    const r = await get(`quotes?id=eq.${row.id}&select=*,lead:leads(id),customer:customers(id),salesperson:employees!salesperson_id(id),technician:employees!quotes_technician_id_fkey(id)`);
    if (r.status >= 400 || !Array.isArray(r.body) || r.body.length === 0) {
      bad++;
      console.log(`  q ${row.id} (qid ${row.quote_id}): STATUS ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  }
  console.log(`Failed JOIN probes: ${bad}/50`);
})();
