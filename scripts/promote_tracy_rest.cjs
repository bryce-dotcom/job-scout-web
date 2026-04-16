// Bypass supabase-js (hanging) and call the REST API directly with fetch.
require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

async function req(method, path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

(async () => {
  // 1) Promote Tracy
  const promote = await req(
    'PATCH',
    'employees?email=eq.tracy@hhh.services',
    { user_role: 'Admin', updated_at: new Date().toISOString() }
  );
  console.log('Promote:', promote.status, JSON.stringify(promote.body));

  // 2) Find Tracy's open feedback
  const find = await req(
    'GET',
    'feedback?user_email=eq.tracy@hhh.services&status=eq.in_progress&select=id,message'
  );
  console.log('Open Tracy feedback:', find.status, JSON.stringify(find.body));

  const target = (find.body || []).find(r => /finance/i.test(r.message || ''));
  if (!target) { console.log('No matching feedback row'); return; }

  // 3) Resolve it with reply
  const reply = await req(
    'PATCH',
    `feedback?id=eq.${target.id}`,
    {
      status: 'resolved',
      reply_message: "Promoted your account from Manager to Admin so the Financial section (Invoices, Deposits, Expenses, Books) now appears in the left nav. Log out and back in (or refresh) - you should see it between Operations and Team.",
      replied_at: new Date().toISOString(),
      resolved_at: new Date().toISOString()
    }
  );
  console.log('Reply:', reply.status, JSON.stringify(reply.body).slice(0, 200));
})();
