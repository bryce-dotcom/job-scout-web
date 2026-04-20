// Investigate Cameron's duplicated 4/13 clock + time-tracking schema for the
// other Alayda bug, plus Tracy's invoice-on-delete and estimate-blank-page.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function get(p) { const r = await fetch(`${URL}/rest/v1/${p}`, { headers }); return { status: r.status, body: await r.json() }; }

(async () => {
  console.log('=== employees: who is Cameron at HHH ===');
  const cam = await get('employees?company_id=eq.3&name=ilike.*cameron*&select=id,name,email,user_role');
  console.log(JSON.stringify(cam.body, null, 2).slice(0, 800));

  // Cameron's time entries on 2026-04-13 (week of)
  if (cam.body[0]) {
    const camId = cam.body[0].id;
    console.log(`\n=== time_clock entries for ${cam.body[0].name} 4/12-4/14 ===`);
    const tc = await get(`time_clock?employee_id=eq.${camId}&clock_in=gte.2026-04-12&clock_in=lte.2026-04-15&select=*&order=clock_in.asc`);
    console.log('rows:', tc.body.length);
    tc.body.forEach(r => console.log(JSON.stringify({ id: r.id, in: r.clock_in, out: r.clock_out, hours: r.hours, job_id: r.job_id, status: r.status })));
  }

  console.log('\n=== time_clock cols ===');
  const tcs = await get('time_clock?company_id=eq.3&select=*&limit=1');
  console.log(tcs.body[0] ? Object.keys(tcs.body[0]) : tcs.body);

  console.log('\n=== job 12829 (Alayda time-tracking save bug) ===');
  const j = await get('jobs?id=eq.12829&select=id,company_id,job_title,status');
  console.log(JSON.stringify(j.body, null, 2));

  console.log('\n=== job 12819 (Tracy invoice delete) ===');
  const j2 = await get('jobs?id=eq.12819&select=id,company_id,job_title,status,customer_id');
  console.log(JSON.stringify(j2.body, null, 2));
  // Invoices linked to the job
  const inv = await get('invoices?job_id=eq.12819&select=id,invoice_id,amount,payment_status,created_at,deleted_at&order=created_at.desc');
  console.log('invoices for job 12819:', JSON.stringify(inv.body, null, 2).slice(0, 1000));
})();
