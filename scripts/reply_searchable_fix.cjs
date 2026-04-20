// Follow-up reply on b3a46d67 — searchable picker tokenization fix.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function patch(p, b) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { method: 'PATCH', headers, body: JSON.stringify(b) });
  return { status: r.status, body: await r.json() };
}
async function get(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers });
  return { status: r.status, body: await r.json() };
}

const NOW = new Date().toISOString();

(async () => {
  const since = new Date(Date.now() - 5 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=id&order=created_at.desc&limit=200`);
  const full = list.body.find(r => r.id.startsWith('b3a46d67'));
  if (!full) { console.log('not found'); return; }

  const reply =
    "Quick follow-up — caught a bug in the picker right after shipping. " +
    "Searching 'motion flow' returned nothing because the filter was looking for the literal substring 'motion flow' in the label, " +
    "but the job label is '... MFCP Motion & Flow Control Products ...' (an '&' sits between Motion and Flow).\n\n" +
    "Fixed: the picker now splits your search into words and matches if all words appear anywhere in the label, in any order. " +
    "So 'motion flow', 'flow motion', 'mfcp control', etc. all now find that job. Refresh and give it another go.";

  const r = await patch(`feedback?id=eq.${full.id}`, {
    reply_message: reply,
    replied_at: NOW,
  });
  console.log(`b3a46d67 -> HTTP ${r.status}`);
})();
