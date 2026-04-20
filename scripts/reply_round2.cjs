// Round 2 replies — covers the 4 new items shipped today + bumps Tracy's
// estimate-blank-page bug to a still-investigating reply that re-asks for
// the URL (the previous reply already asked but no response yet).
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
const updates = [
  // Cameron clock dupes
  {
    id: '1890ca53',
    status: 'resolved',
    reply_message:
      "Cleaned up. Pulled Cameron's 4/13 entries — there were 3 rows: the real shift (13:02:29 → 23:10:09, ~10h) plus two zero-second duplicates from rapid clicks (13:02:00→13:02:00 and 13:03:00→13:03:00). Deleted the two zero-second rows. Cameron's payroll for 4/13 now reflects the single ~10-hour shift.\n\n" +
      "If you want a guard against future double-clicks, I can also add server-side dedupe so any new clock-in within 60s of an existing one for the same employee gets rejected. Let me know."
  },

  // Time tracking save bug on /jobs/<id>
  {
    id: '84cd4e50',
    status: 'resolved',
    reply_message:
      "Found it. The 'Add Time Entry' modal on /jobs/<id> was inserting a `notes` field into a database table that didn't have a notes column. PostgREST returned a 400 and the row never saved — but the UI was swallowing the error so it just looked like nothing happened.\n\n" +
      "Two fixes shipped:\n  1) Added the `notes` column to the time_log table.\n  2) The form now surfaces any save error as a red toast instead of silently failing.\n\n" +
      "Refresh and try again — your entry should save."
  },

  // Search bar for payroll job picker
  {
    id: 'b3a46d67',
    status: 'resolved',
    reply_message:
      "Shipped. The 'Assigned Job' dropdown when adjusting a time entry on /payroll is now a searchable picker — start typing a customer name, job number, or address and it filters the list as you type. Same component used elsewhere in the app for consistency. Refresh and you'll see the change."
  },

  // Tracy invoice delete + recreate
  {
    id: 'd0c7f17c',
    status: 'resolved',
    reply_message:
      "Fixed. Two changes that together solve this:\n  1) When you delete an invoice, the system now sends you back to the JOB page (not the invoice list), so you can immediately re-invoice with the corrected line items.\n  2) On the job page, the 'Generate Invoice' button now stays available whenever there isn't a current customer invoice — previously it was hidden if the job's cached invoice_status said 'Invoiced', even after the invoice itself was gone. The status field is also cleared on delete so other places in the app stay in sync.\n\n" +
      "Workflow now: open invoice → Delete → lands on the job → 'Generate Invoice' is right there in the Actions panel. Refresh to pick it up."
  },

  // Tracy estimate blank page — keep in_progress, give update
  {
    id: '7ec14011',
    status: 'in_progress',
    reply_message:
      "Update — I dug in but couldn't reproduce on this end. Probed all 50 of HHH's most recent estimates with the same database query the page uses, all 50 loaded cleanly. Which means it's almost certainly a render-time crash on a specific estimate (probably one with an unusual combination of fields — old data, missing customer, etc.).\n\n" +
      "To finish this one I really do need to see which estimate it is. Next time it happens, can you copy the URL from your browser's address bar (it'll look like .../estimates/12345) and paste it in a quick reply? Once I have that I can pull the row and pinpoint the exact field combo causing the crash. Thanks!"
  },
];

(async () => {
  const since = new Date(Date.now() - 5 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=id&order=created_at.desc&limit=200`);
  const idMap = new Map();
  list.body.forEach(r => idMap.set(r.id.slice(0, 8), r.id));

  for (const u of updates) {
    const fullId = idMap.get(u.id);
    if (!fullId) { console.log('SKIP (no id):', u.id); continue; }
    const update = {
      status: u.status,
      reply_message: u.reply_message,
      replied_at: NOW,
      resolved_at: u.status === 'resolved' ? NOW : null,
    };
    const r = await patch(`feedback?id=eq.${fullId}`, update);
    console.log(`${u.id} -> ${u.status}: HTTP ${r.status}`);
  }
})();
