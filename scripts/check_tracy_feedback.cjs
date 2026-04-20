require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers });
  return { status: r.status, body: await r.json() };
}

(async () => {
  // Recent feedback in last 2 days, ordered newest first
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=*&order=created_at.desc&limit=100`);
  console.log(`HTTP ${list.status} — ${list.body.length} rows since ${since}\n`);
  for (const f of list.body) {
    console.log('─'.repeat(80));
    console.log(`id: ${f.id}`);
    console.log(`when: ${f.created_at}`);
    console.log(`user: ${f.user_email || f.user_name || '(anon)'} | page: ${f.page_url || f.path || '?'}`);
    console.log(`status: ${f.status} | replied_at: ${f.replied_at || '-'}`);
    console.log(`message: ${(f.message || '').slice(0, 500)}`);
    if (f.reply_message) console.log(`reply: ${(f.reply_message || '').slice(0, 300)}`);
  }
})();
