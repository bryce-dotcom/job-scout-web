require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function get(p) { const r = await fetch(`${URL}/rest/v1/${p}`, { headers }); return { status: r.status, body: await r.json() }; }

(async () => {
  // estimates schema (try with a row that exists)
  const est = await get('estimates?company_id=eq.3&select=*&limit=1');
  console.log('estimates cols:', est.body[0] ? Object.keys(est.body[0]) : 'empty');

  // Find ALL invoices for company 3 that look paid-but-Open: status Open/Pending,
  // but the sum of payments matches the invoice amount.
  const drift = await get(
    'invoices?company_id=eq.3&payment_status=in.(Open,Pending,%22Partially Paid%22)&select=id,invoice_id,amount,payment_status,created_at&limit=500'
  );
  const invIds = drift.body.map(i => i.id);
  if (invIds.length) {
    const ids = invIds.join(',');
    const pays = await get(`payments?invoice_id=in.(${ids})&select=invoice_id,amount`);
    const paidByInv = {};
    pays.body.forEach(p => { paidByInv[p.invoice_id] = (paidByInv[p.invoice_id] || 0) + parseFloat(p.amount || 0); });
    const drifted = drift.body.filter(i => {
      const paid = paidByInv[i.id] || 0;
      return paid >= parseFloat(i.amount || 0) && paid > 0;
    });
    console.log(`\n${drifted.length} invoices showing Open/Pending but fully paid:`);
    drifted.forEach(i => console.log(`  inv ${i.id} (${i.invoice_id}) amt=${i.amount} status=${i.payment_status} paid=${paidByInv[i.id]}`));
  }

  // estimates table for company 3: how many rows
  const ec = await get('estimates?company_id=eq.3&select=id&limit=2000');
  console.log(`\nestimates count for company 3: ${ec.body.length}`);
  if (ec.body[0]) {
    const sample = await get(`estimates?id=eq.${ec.body[0].id}&select=*`);
    console.log('sample estimate cols:', Object.keys(sample.body[0] || {}));
  }
})();
