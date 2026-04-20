require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers });
  return { status: r.status, body: await r.json() };
}

(async () => {
  // 1) Invoice 17132 — Airgas, supposedly paid but new check arrived
  console.log('=== Invoice 17132 ===');
  const inv = await get(`invoices?id=eq.17132&select=*`);
  console.log(JSON.stringify(inv.body[0], null, 2));

  // Find linked payments
  console.log('\n=== payments referencing invoice 17132 ===');
  const pays = await get(`payments?invoice_id=eq.17132&select=*`);
  console.log(JSON.stringify(pays.body, null, 2));

  // Customer info
  if (inv.body[0]?.customer_id) {
    const cust = await get(`customers?id=eq.${inv.body[0].customer_id}&select=id,name`);
    console.log(`\nCustomer: ${JSON.stringify(cust.body[0])}`);
  }

  // 2) Utility invoice 40 — Tracy says no Record Payment option
  console.log('\n\n=== Utility invoice 40 ===');
  const ui = await get(`utility_invoices?id=eq.40&select=*`);
  console.log(JSON.stringify(ui.body[0], null, 2));
})();
