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
  // Refetch full ids
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=id&order=created_at.desc&limit=200`);

  const find = (short) => list.body.find(r => r.id.startsWith(short))?.id;

  const items = [
    {
      id: find('55a20d15'), // Airgas invoice 17132
      reply:
        "Done — invoice #8644 (Airgas) is reopened. Status is back to Pending so it'll show on your radar and you can apply the new check.\n\n" +
        "Heads up about WHY it was Paid: there's a payment row on the invoice for $1,712.89 dated 3/7 — that's what was triggering the auto-Paid status. " +
        "Since Airgas is now sending a real check, that 3/7 row is probably either (a) a duplicate that should be deleted, or (b) the right payment but the date/amount got mis-entered. " +
        "Take a look at the Payments section on the invoice and decide. If it's bogus, delete it; otherwise leave it and add the new check on top.\n\n" +
        "I also added a new 'Reopen Invoice' button on every paid invoice so next time you can do this yourself in one click without pinging me. (Refresh to see it.)",
      status: 'resolved',
    },
    {
      id: find('3c287d94'), // Utility invoice 40 — no Record Payment
      reply:
        "Two things going on here:\n\n" +
        "1) The Record Payment modal IS shipped — when you mark a utility invoice paid, it now pops a date picker + a note field (for check #, ACH ref, etc.) and writes the actual paid date. Once paid, an 'Edit Payment' button lets you correct the date later. " +
        "Utility invoice #40 was already marked Paid earlier today (1:38pm) BEFORE this feature deployed, so you saw the old behavior. Hard refresh (Ctrl+Shift+R) and any UNPAID utility invoice will show the new green 'Record Payment' button.\n\n" +
        "2) For the case you ran into — already-paid utility invoices where you need to fix things — I just added a yellow 'Unmark Paid' button next to Edit Payment. One click reopens the invoice (clears paid_at, status back to Open) so you can record the payment fresh with the right date and note. " +
        "Same goes for regular customer invoices: every Paid invoice now has a 'Reopen Invoice' button. Both are live after refresh.",
      status: 'resolved',
    },
  ];

  for (const it of items) {
    if (!it.id) { console.log('not found'); continue; }
    const r = await patch(`feedback?id=eq.${it.id}`, {
      reply_message: it.reply,
      replied_at: NOW,
      status: it.status,
    });
    console.log(`${it.id.slice(0,8)} -> HTTP ${r.status}`);
  }
})();
