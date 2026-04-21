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

(async () => {
  const since = new Date(Date.now() - 4 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=id&order=created_at.desc&limit=200`);
  const id = list.body.find(r => r.id.startsWith('b8c61fef'))?.id; // Tracy /books
  if (!id) { console.log('not found'); return; }

  const reply =
    "Follow-up on the Expense vs Tax Category question (you asked why both exist and where to add your own):\n\n" +
    "Why two fields: Expense Category is YOUR bucket (Fuel, Supplies, Job Materials) — it drives your internal P&L. Tax Category is the IRS Form 1065 line (Line 2 COGS, Line 20 Auto, etc.) — that's what your accountant files. The mapping isn't always 1-to-1 (e.g. 'Supplies' for a job → COGS; 'Supplies' for the office → Office Expenses), so we keep them separate for accuracy — but for 90% of transactions they should auto-fill.\n\n" +
    "What just shipped:\n" +
    "  1) COGS is now in the system. Added 'Cost of Goods Sold', 'Job Materials', 'Subcontractors', 'Vehicle Maintenance', 'Rent', 'Repairs & Maintenance', 'Travel', and 'Meals' as expense categories — all pre-mapped to the correct IRS lines (including the new 'Line 2 - Cost of goods sold' option in the Tax Category dropdown).\n\n" +
    "  2) Auto-fill is live. When you pick an Expense Category on a transaction (either inline or in the expanded edit view), the Tax Category auto-fills from that category's default mapping. You can still override for the oddball cases.\n\n" +
    "  3) You can now add your own categories. In the expanded edit view there's a '+ Manage categories' link next to the Expense Category label. Opens a modal where you can add custom categories (e.g. 'Truck Payments', 'Tool Purchases'), set each one's default tax line, and delete the ones you don't use. Built-in categories are marked '(built-in)' and can't be deleted.\n\n" +
    "So for your original question about job supplies on Mike's card: pick 'Job Materials' or 'Cost of Goods Sold' as the Expense Category and the Tax Category will auto-fill to Line 2 COGS. The transfer itself (bank → Mike's card) is a 'Transfer' (not deductible by itself — the actual job-supply purchase on Mike's card is the COGS expense).";

  const r = await patch(`feedback?id=eq.${id}`, {
    reply_message: reply,
    replied_at: new Date().toISOString(),
    status: 'resolved',
  });
  console.log(`b8c61fef -> HTTP ${r.status}`);
})();
