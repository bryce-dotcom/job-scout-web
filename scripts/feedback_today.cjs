// Show all open / in_progress feedback (last 5 days), newest first.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function get(p) { const r = await fetch(`${URL}/rest/v1/${p}`, { headers }); return r.json(); }

(async () => {
  const since = new Date(Date.now() - 5 * 86400000).toISOString();
  const rows = await get(
    `feedback?created_at=gte.${since}&status=in.(open,new,in_progress)&select=id,status,user_email,page_url,message,created_at,reply_message&order=created_at.desc&limit=200`
  );
  console.log(`open/in_progress (last 5d): ${rows.length}\n`);
  rows.forEach(r => {
    const t = new Date(r.created_at).toLocaleString();
    console.log(`[${r.id.slice(0,8)}] ${r.status.toUpperCase()} ${t} ${r.user_email || '-'}`);
    console.log(`  page: ${r.page_url || '-'}`);
    console.log(`  msg : ${(r.message || '').replace(/\s+/g, ' ').slice(0, 220)}`);
    if (r.reply_message) console.log(`  RE  : ${r.reply_message.replace(/\s+/g,' ').slice(0,140)}`);
    console.log('');
  });
})();
