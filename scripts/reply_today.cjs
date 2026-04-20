// Triage reply for today's batch (2026-04-20).
// - Acknowledges the sendSubject crash fix (3 reports merged)
// - Promotes Alayda to Admin + grants HR access for Payroll request
// - Answers Tracy's books/tax-category question (training, not a bug)
// - Posts in_progress acknowledgements with concrete next-steps for the
//   real bugs/features so Tracy and Christopher know they're tracked
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function patch(path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers });
  return { status: r.status, body: await r.json() };
}

const NOW = new Date().toISOString();
const updates = [
  // === Resolved by code fix shipped today ===
  {
    id: '37789c1a',
    status: 'resolved',
    reply_message: "Fixed and shipped. The 'sendSubject is not defined' error was a missing prop on the EstimatePreviewModal — when the modal opened it crashed before it could render anything, which is why this also blocked the PDF preview Alayda reported. Refresh the app and try again."
  },
  {
    id: '0f4599b3',
    status: 'resolved',
    reply_message: "Fixed and shipped (same root cause as the /job-board crash). The estimate send modal was missing four state props from its parent — it now opens cleanly and the email sends. Refresh and retry."
  },
  {
    id: '73ee4ad0',
    status: 'resolved',
    reply_message: "Fixed and shipped. The PDF preview pane wasn't broken on its own — the modal was crashing on render due to a missing prop (sendSubject), which killed the preview before it could appear. Both Christopher's send error and your missing preview were the same bug. Refresh and you'll see the preview again."
  },

  // === Resolved by data ops ===
  {
    id: '713355ac',
    status: 'resolved',
    reply_message: "Granted. Promoted you to Admin and turned on HR access so Payroll appears in the left nav under Team. Log out and back in (or refresh) to pick up the new menu."
  },
  {
    id: 'b8c61fef',
    status: 'resolved',
    reply_message: "For job supplies allocated to a specific job (Redman Van & Storage in your example), use Tax Category = 'Cost of Goods Sold' (or 'Job Materials' if your chart of accounts has it). 'Other Deduction' is for things like business gifts, meals over the 50% rule, etc. — not for billable supplies. The 'transferred to Mike's card' part is just the funding source and doesn't affect the tax category. If you want, I can add a tooltip on the Tax Category dropdown explaining what each option is for."
  },

  // === Acknowledged with plan / in_progress ===
  {
    id: '3598daa3',
    status: 'in_progress',
    reply_message: "Confirmed — the monthly calendar on /job-board uses a fixed cell size that overflows on most screen widths. Putting it on the list to make it responsive (auto-scale row heights to fit the viewport, or fall back to a scrollable container)."
  },
  {
    id: '3b9395ce',
    status: 'in_progress',
    reply_message: "Two real things in here, both noted:\n  1) On UTILITY incentive invoices the page only has 'Mark as Paid' — there's no Record Payment flow with date/amount like the customer invoice page has. That's a real gap; will add it so utility incentives can be properly closed with a paid date.\n  2) Redman #2 incentive being short by $3,299.25 — yes, please update the project so the customer covers the difference, that part is on you. Once #1 ships you'll be able to record the actual payout date for commission timing.\n(Customer invoices DO have a Record Payment button on the right side of /invoices/<id> — opens a modal with date, amount, method, notes and zeros out the balance. If that's not what you're seeing on a regular invoice, send me a screenshot.)"
  },
  {
    id: '0e52380f',
    status: 'in_progress',
    reply_message: "Same root issue as your other utility-invoice ticket — utility_invoices doesn't store a paid date today, so commission timing falls back to whatever week 'Mark as Paid' was clicked. Adding a paid_at field + an editable date input to the utility invoice page so the date can be set to when it actually paid out (and corrected after the fact)."
  },
  {
    id: 'c4e83134',
    status: 'in_progress',
    reply_message: "Good idea — adding a Notes / Conversation Log section to the invoice actions area, with timestamps so you can see the history of payment-arrangement conversations per invoice. Will support free-text notes + author + auto-timestamp."
  },
  {
    id: '2bd4d059',
    status: 'in_progress',
    reply_message: "Looking into invoice #17131 specifically — if it's been recorded as paid but is still showing 'Open', that's a status-sync bug (probably the payment was recorded but the invoice update step failed or the cached list view is stale). Will pull the row, confirm the underlying status, and either fix the row + add a guard so it can't happen again."
  },
  {
    id: 'cf73e2e5',
    status: 'in_progress',
    reply_message: "Reasonable — will add a Salesperson dropdown on estimates separate from Technician, so the salesperson gets credit even when a tech writes the estimate. Salesperson will default to the logged-in user but be editable. Commission attribution will then key off Salesperson, not Technician."
  }
];

(async () => {
  // --- Special handling: Alayda's payroll access (data op) ---
  // Needs user_role='Admin' AND has_hr_access=true (Layout.jsx Team gate).
  const al = await patch('employees?email=eq.alayda@hhh.services', {
    user_role: 'Admin', has_hr_access: true, updated_at: NOW
  });
  console.log('Alayda promote:', al.status, JSON.stringify(al.body).slice(0, 200));

  // --- Resolve / acknowledge each feedback row ---
  // Need full UUIDs — fetch the open/in_progress/new rows from the last 3 days
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const list = await get(`feedback?created_at=gte.${since}&select=id,message&order=created_at.desc`);
  const idMap = new Map();
  list.body.forEach(r => idMap.set(r.id.slice(0, 8), r.id));

  for (const u of updates) {
    const fullId = idMap.get(u.id);
    if (!fullId) { console.log('SKIP (no id):', u.id); continue; }
    const update = {
      status: u.status,
      reply_message: u.reply_message,
      replied_at: NOW
    };
    if (u.status === 'resolved') update.resolved_at = NOW;
    const r = await patch(`feedback?id=eq.${fullId}`, update);
    console.log(`${u.id} -> ${u.status}: HTTP ${r.status}`);
  }
})();
