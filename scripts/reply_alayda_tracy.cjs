require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const NOW = new Date().toISOString();
async function patch(p, b) { const r = await fetch(`${URL}/rest/v1/${p}`, { method: 'PATCH', headers, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; }
async function get(p) { const r = await fetch(`${URL}/rest/v1/${p}`, { headers }); return { status: r.status, body: await r.json() }; }

(async () => {
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=id&order=created_at.desc&limit=200`);
  const find = (s) => list.body.find(r => r.id.startsWith(s))?.id;

  const items = [
    {
      id: find('f202563b'),
      reply:
        "Fixed. Each time entry on the job page is now editable inline — tap the pencil icon next to the hours to edit hours / category (Regular, Overtime, Drive, Other) / notes, and there's a red trash icon to delete a bad entry. Save commits the change, Cancel backs out. Refresh the job page and you'll see the new icons next to every time entry.\n\n" +
        "Heads up: the same Add Time button is still there for new entries — the only thing that changed is the existing list went from read-only to editable.",
      status: 'resolved',
    },
    {
      id: find('1c07ddc6'),
      reply:
        "Fixed and shipped. The Lead Setter calendar was throwing 'isOverlay is not defined' because I removed that variable yesterday when I made every appointment chip color-coded by salesperson, but two child elements inside the chip (the rep name and the assigned-reps list) were still referencing the old variable. Replaced them with the new 'hasRepColor' check. Refresh and you should be able to click on any appointment to open / move / edit it again.",
      status: 'resolved',
    },
  ];

  for (const it of items) {
    if (!it.id) { console.log('not found'); continue; }
    const r = await patch(`feedback?id=eq.${it.id}`, { reply_message: it.reply, replied_at: NOW, status: it.status });
    console.log(`${it.id.slice(0,8)} -> HTTP ${r.status}`);
  }
})();
