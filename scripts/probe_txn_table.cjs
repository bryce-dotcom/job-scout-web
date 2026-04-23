require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
(async () => {
  for (const t of ['bank_transactions','plaid_transactions','transactions','book_transactions']) {
    const r = await fetch(`${URL}/rest/v1/${t}?limit=1`, { headers });
    let body = '';
    try { body = JSON.stringify(await r.json()).slice(0, 200); } catch {}
    console.log(t, '->', r.status, body);
  }
})();
