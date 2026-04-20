// Investigate inv 17131 + check schemas for the upcoming feature work
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers });
  return { status: r.status, body: await r.json() };
}

(async () => {
  console.log('=== INVOICE 17131 (Tracy: paid but showing Open) ===');
  const inv = await get('invoices?id=eq.17131&select=*');
  console.log('row:', JSON.stringify(inv.body, null, 2).slice(0, 1500));

  const pays = await get('payments?invoice_id=eq.17131&select=*');
  console.log('\npayments:', JSON.stringify(pays.body, null, 2));

  console.log('\n=== Sample utility_invoices columns ===');
  const ui = await get('utility_invoices?select=*&limit=1');
  if (ui.body[0]) console.log(Object.keys(ui.body[0]));

  console.log('\n=== Sample invoices columns ===');
  const inv2 = await get('invoices?select=*&limit=1');
  if (inv2.body[0]) console.log(Object.keys(inv2.body[0]));

  console.log('\n=== Sample estimates columns ===');
  const est = await get('estimates?select=*&limit=1');
  if (est.body[0]) console.log(Object.keys(est.body[0]));

  console.log('\n=== Open Tracy/Christopher in_progress feedback ===');
  const fb = await get(`feedback?or=(user_email.eq.tracy@hhh.services,user_email.eq.christopher@hhh.services)&status=eq.in_progress&select=id,page_url,message&order=created_at.desc&limit=20`);
  fb.body.forEach(f => console.log(`${f.id.slice(0,8)} | ${f.page_url} | ${f.message.slice(0, 120)}`));
})();
