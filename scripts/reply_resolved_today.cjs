// Mark the in_progress items from earlier today as resolved now that the
// feature/data work shipped. Each reply summarizes what was built + offers
// the in-app training where it's user-error or new behavior.
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
  // Tracy — inv 17131 + the 108 paid-but-Open drift
  {
    id: '2bd4d059',
    status: 'resolved',
    reply_message:
      "Fixed. Two parts:\n" +
      "  1) Inv 17131 is now showing Paid (with the 3/7 payment date intact).\n" +
      "  2) This wasn't just one invoice — an audit found 108 invoices in your company in the same state (payment recorded but status stuck on Open). Most were from 2024/early-2025 imports that bypassed the auto-status update. All 108 have been healed in the same pass.\n\n" +
      "Going forward, the Record Payment button on /invoices/<id> already auto-flips the invoice to Paid when the running total covers the amount, so this shouldn't recur. If you ever DO see one drift again, ping me with the invoice ID and I'll re-run the heal."
  },

  // Tracy — utility incentive Record Payment + paid_at
  {
    id: '3b9395ce',
    status: 'resolved',
    reply_message:
      "Shipped both pieces:\n" +
      "  1) Utility incentive page now has a 'Record Payment' button (replaces the bare 'Mark as Paid'). Clicking it pops a modal asking for the actual paid date + an optional note (check #, ACH ref). It writes paid_at on the row and appends a timestamped line to the notes — so commission timing keys off the real payout date, not when you clicked the button. After it's marked Paid, you can also correct the date inline from the Financial Summary panel without re-recording.\n  2) For Redman #2 — go ahead and edit the project so the customer covers the $3,299.25 difference, that side is on you.\n\n" +
      "Also re: the regular invoice Record Payment flow you mentioned — that one IS already on /invoices/<id> in the right-hand Actions panel. If you're not seeing it on a specific invoice, send me the invoice number and I'll check (could be a permissions thing or the invoice is locked)."
  },

  // Tracy — utility paid date editable
  {
    id: '0e52380f',
    status: 'resolved',
    reply_message:
      "Shipped — utility_invoices now has a paid_at column, the page captures it via the new Record Payment modal (asks for the actual payout date), and once marked Paid you can correct the date inline from the Financial Summary panel via the date picker next to 'Paid Date'. Commission timing now keys off paid_at instead of updated_at."
  },

  // Tracy — conversation log on invoices
  {
    id: 'c4e83134',
    status: 'resolved',
    reply_message:
      "Shipped. Open any /invoices/<id> and you'll see a new 'Conversation Log' card above the existing Notes section. Type a note (e.g. 'Spoke with Sandra, agreed to pay by Friday') and hit Add Note — it stamps your name + the timestamp and pushes it on top of the list. Entries are kept newest-first so the most recent commitment is always at the top. Old free-text Notes still works for general descriptions."
  },

  // Christopher — calendar responsiveness
  {
    id: '3598daa3',
    status: 'resolved',
    reply_message:
      "Shipped. The monthly grid on /job-board now auto-scales row heights to fit the viewport — for a 6-row month it carves the available height into 6, with a 60px floor. If you're on a small laptop or have a busy month with lots of items in cells, the grid scrolls internally instead of pushing the page. Cells also clip overflow so a long customer name no longer pushes the column wider. Refresh and try."
  },

  // Christopher — Salesperson on estimates
  {
    id: 'cf73e2e5',
    status: 'resolved',
    reply_message:
      "Shipped. Estimate detail page now has TWO dropdowns side-by-side: Salesperson (drives commission attribution) and Technician (who's running the install). Both default to the existing assignment but are independently editable, so when a tech writes the estimate the salesperson can be set correctly without overwriting the tech assignment. The DB columns (salesperson_id + technician_id) already existed — the UI just wasn't exposing both."
  },
];

(async () => {
  const since = new Date(Date.now() - 4 * 86400000).toISOString();
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
