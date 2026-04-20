// Delete Cameron's two 0-second duplicate clock entries on 4/13.
// Keep the real shift (id 286, 13:02:29 → 23:10:09).
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation' };

(async () => {
  for (const id of [287, 289]) {
    const r = await fetch(`${URL}/rest/v1/time_clock?id=eq.${id}`, { method: 'DELETE', headers });
    const txt = await r.text();
    console.log(`del ${id}: ${r.status} ${txt.slice(0, 200)}`);
  }
})();
