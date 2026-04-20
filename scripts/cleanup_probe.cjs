// Remove the test row our probe script may have inserted.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
(async () => {
  const r = await fetch(`${URL}/rest/v1/time_log?notes=eq.probe&select=id`, { headers });
  const rows = await r.json();
  console.log('probe rows:', rows);
  for (const row of rows) {
    const d = await fetch(`${URL}/rest/v1/time_log?id=eq.${row.id}`, { method: 'DELETE', headers });
    console.log('del', row.id, d.status);
  }
})();
