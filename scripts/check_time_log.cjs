require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
(async () => {
  const r = await fetch(`${URL}/rest/v1/time_log?limit=1`, { headers });
  const b = await r.json();
  console.log('time_log cols:', b[0] ? Object.keys(b[0]) : b);
  // Try Alayda's exact insert
  const ins = await fetch(`${URL}/rest/v1/time_log`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{
      company_id: 3, job_id: 12829, employee_id: 1, hours: 0.5, category: 'Regular', notes: 'probe', date: '2026-04-20'
    }])
  });
  console.log('insert with employee_id:', ins.status, (await ins.text()).slice(0, 400));
})();
