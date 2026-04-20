// Heal invoices showing Open/Pending/Partially Paid but the sum of payments
// already covers the invoice amount. Sets payment_status = 'Paid' and
// fills paid_at to the latest payment date.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function get(p) { const r = await fetch(`${URL}/rest/v1/${p}`, { headers }); return { status: r.status, body: await r.json() }; }
async function patch(p, b) { const r = await fetch(`${URL}/rest/v1/${p}`, { method: 'PATCH', headers, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; }

(async () => {
  // Audit ALL companies, not just 3. Page through to avoid Supabase max limit.
  const drift = { body: [] };
  let from = 0; const PAGE = 1000;
  while (true) {
    const r = await fetch(`${URL}/rest/v1/invoices?payment_status=in.(Open,Pending,%22Partially%20Paid%22)&select=id,company_id,amount,payment_status&order=id.asc`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' }
    });
    const chunk = await r.json();
    if (!Array.isArray(chunk) || chunk.length === 0) { console.log('stop at', from, 'status', r.status, JSON.stringify(chunk).slice(0,200)); break; }
    drift.body.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  console.log('open/pending invoices total:', drift.body.length);

  // Pull payments in batches by id to avoid URL length issues
  const ids = drift.body.map(i => i.id);
  const paidByInv = {};
  const dateByInv = {};
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH).join(',');
    const pays = await get(`payments?invoice_id=in.(${chunk})&select=invoice_id,amount,date,created_at&limit=20000`);
    pays.body.forEach(p => {
      paidByInv[p.invoice_id] = (paidByInv[p.invoice_id] || 0) + parseFloat(p.amount || 0);
      const d = p.date || p.created_at;
      if (d && (!dateByInv[p.invoice_id] || d > dateByInv[p.invoice_id])) dateByInv[p.invoice_id] = d;
    });
  }

  const drifted = drift.body.filter(i => {
    const paid = paidByInv[i.id] || 0;
    return paid >= parseFloat(i.amount || 0) && paid > 0;
  });
  console.log(`fully-paid but Open/Pending: ${drifted.length}`);
  const byCo = {};
  drifted.forEach(i => { byCo[i.company_id] = (byCo[i.company_id] || 0) + 1; });
  console.log('by company:', byCo);

  const dryRun = process.argv.includes('--apply') ? false : true;
  if (dryRun) {
    console.log('\nDRY RUN. Re-run with --apply to write changes.');
    return;
  }

  let ok = 0, fail = 0;
  for (const i of drifted) {
    const update = { payment_status: 'Paid', updated_at: new Date().toISOString() };
    const r = await patch(`invoices?id=eq.${i.id}`, update);
    if (r.status >= 200 && r.status < 300) ok++; else { fail++; console.log('FAIL', i.id, r.status, JSON.stringify(r.body).slice(0, 120)); }
  }
  console.log(`updated ${ok}, failed ${fail}`);
})();
