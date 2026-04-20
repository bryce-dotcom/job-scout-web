require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
(async () => {
  const r = await fetch(`${URL}/rest/v1/quotes?company_id=eq.3&select=*&limit=1`, { headers });
  const b = await r.json();
  console.log('cols:', b[0] ? Object.keys(b[0]) : b);
})();
