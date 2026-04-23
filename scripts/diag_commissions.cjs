require('dotenv').config();
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => (await fetch(`${URL}/rest/v1/${p}`, { headers })).json();

(async () => {
  // HHH = company_id 3 (per memory)
  const COMPANY = 3;
  const NEEDLES = ['steve', 'redman', 'glen']; // matches Steves Auto, RedmanVan, Glens Tires

  // Pull recent invoices + their job + customer
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const invs = await get(`invoices?company_id=eq.${COMPANY}&created_at=gte.${since}&select=id,invoice_id,job_id,customer_id,amount,payment_status,created_at,updated_at&order=updated_at.desc&limit=500`);
  if (!Array.isArray(invs)) { console.log('invs error:', invs); return; }
  const customers = await get(`customers?company_id=eq.${COMPANY}&select=id,name&limit=2000`);
  if (!Array.isArray(customers)) { console.log('customers error:', customers); return; }
  const cmap = new Map(customers.map(c => [c.id, c.name]));

  const matches = invs.filter(i => {
    const n = (cmap.get(i.customer_id) || '').toLowerCase();
    return NEEDLES.some(k => n.includes(k));
  });

  console.log(`\nFound ${matches.length} invoices matching needles:\n`);
  for (const inv of matches) {
    const cust = cmap.get(inv.customer_id) || '(no customer)';
    console.log(`---`);
    console.log(`Invoice ${inv.invoice_id || inv.id.slice(0,8)} | ${cust}`);
    console.log(`  amount=$${inv.amount}  status=${inv.payment_status}`);
    console.log(`  job_id=${inv.job_id}  updated=${inv.updated_at}`);

    const pays = await get(`payments?invoice_id=eq.${inv.id}&select=id,amount,date,method,status,created_at`);
    console.log(`  payments rows: ${pays.length}`);
    pays.forEach(p => console.log(`    -> $${p.amount} on ${p.date} (${p.method || '?'}) status=${p.status}`));

    if (inv.job_id) {
      const job = await get(`jobs?id=eq.${inv.job_id}&select=id,job_number,status,salesperson_id,lead_id`);
      const j = job[0];
      if (j) {
        console.log(`  job#${j.job_number} status=${j.status} salesperson_id=${j.salesperson_id} lead_id=${j.lead_id}`);
        if (j.salesperson_id) {
          const emp = await get(`employees?id=eq.${j.salesperson_id}&select=id,full_name,is_commission,commission_services_rate,commission_services_type,commission_goods_rate,commission_goods_type`);
          console.log(`  salesperson: ${JSON.stringify(emp[0])}`);
        } else if (j.lead_id) {
          const lead = await get(`leads?id=eq.${j.lead_id}&select=id,salesperson_id,salesperson_ids,setter_id`);
          console.log(`  lead fallback: ${JSON.stringify(lead[0])}`);
        }
      }
    }
  }

  // Pay period bracket — assume bi-weekly, find what payroll page would consider "current"
  console.log(`\n=== Payments table activity (last 30d, company ${COMPANY}) ===`);
  const recentPays = await get(`payments?company_id=eq.${COMPANY}&date=gte.${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}&select=id,invoice_id,amount,date,method&order=date.desc&limit=50`);
  console.log(`${recentPays.length} payment rows in last 30d`);
  recentPays.slice(0,15).forEach(p => console.log(`  ${p.date}  $${p.amount}  inv=${p.invoice_id?.slice(0,8)}`));
})();
