// reset-demo — wipe and rebuild the "Summit Field Co" sales-demo company.
//
// Server-side so the service-role key never touches the browser. Developer-only
// (the DataConsole that calls this is already dev-gated; we re-check here).
// Idempotent: deletes any prior demo, then rebuilds a full book of realistic
// data dated to "now" so the dashboard always looks current.
//
// Mirrors scripts/seed-demo.mjs. Login: demo@jobscout.app / Demo1234!

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL = 'demo@jobscout.app';
const PASSWORD = 'Demo1234!';
const COMPANY = 'Summit Field Co';

function jwtEmail(req: Request): string | null {
  try {
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const part = tok.split('.')[1]; if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (p?.email || '').toLowerCase() || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
    const JH = { ...H, 'Content-Type': 'application/json' };

    // ── developer gate ──
    const email = jwtEmail(req);
    if (!email) return json({ error: 'Not authenticated' }, 401);
    const devRows = await (await fetch(`${URL}/rest/v1/employees?select=is_developer,user_role&active=eq.true&email=ilike.${encodeURIComponent(email)}`, { headers: H })).json().catch(() => []);
    const dev = Array.isArray(devRows) && devRows.some((r: any) => r.is_developer === true || ['Developer', 'Super Admin'].includes(r.user_role));
    if (!dev) return json({ error: 'Developer access required' }, 403);

    // ── helpers ──
    const ins = async (t: string, rows: any[]) => {
      const r = await fetch(`${URL}/rest/v1/${t}`, { method: 'POST', headers: { ...JH, Prefer: 'return=representation' }, body: JSON.stringify(rows) });
      const b = await r.json(); if (!r.ok) throw new Error(`insert ${t}: ${r.status} ${JSON.stringify(b).slice(0, 200)}`); return b;
    };
    const del = async (t: string, q: string) => { const r = await fetch(`${URL}/rest/v1/${t}?${q}`, { method: 'DELETE', headers: H }); if (!r.ok && r.status !== 404 && r.status !== 400) console.warn(`del ${t}: ${r.status}`); };
    const sel = async (t: string, q: string) => { const r = await fetch(`${URL}/rest/v1/${t}?${q}`, { headers: H }); return r.ok ? await r.json() : []; };
    const authList = async () => { const r = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers: H }); const b = await r.json(); return b.users || b || []; };
    const authDel = async (id: string) => { await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: H }); };

    const now = new Date();
    const dayMs = 86400000;
    const dstr = (o: number) => new Date(now.getTime() + o * dayMs).toISOString().split('T')[0];
    const tstr = (o: number) => new Date(now.getTime() + o * dayMs).toISOString();
    const money = (n: number) => Math.round(n * 100) / 100;

    // ── cleanup (reset) ──
    const prior = await sel('companies', `or=(owner_email.eq.${encodeURIComponent(EMAIL)},company_name.eq.${encodeURIComponent(COMPANY)})&select=id`);
    for (const c of prior) {
      for (const t of ['payments', 'invoices', 'quotes', 'time_clock', 'expenses', 'jobs', 'leads', 'customers', 'products_services', 'fleet', 'inventory', 'settings', 'employees']) await del(t, `company_id=eq.${c.id}`);
      await del('companies', `id=eq.${c.id}`);
    }
    for (const u of (await authList()).filter((u: any) => (u.email || '').toLowerCase() === EMAIL)) await authDel(u.id);

    // ── company + user ──
    const cr = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: JH, body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }) });
    if (!cr.ok) throw new Error(`auth: ${cr.status} ${JSON.stringify(await cr.json())}`);
    const [company] = await ins('companies', [{
      company_name: COMPANY, legal_name: `${COMPANY}, LLC`, owner_email: EMAIL, billing_email: EMAIL,
      phone: '(303) 555-0142', address: '2200 Industrial Pkwy, Denver, CO 80216', city: 'Denver', state: 'CO', zip: '80216',
      website: 'summitfieldco.com', industry: 'Commercial Lighting & Electrical', entity_type: 'LLC',
      primary_color: '#5a6349', public_quote_slug: 'summit-field-co', timezone: 'America/Denver',
      setup_complete: true, active: true, billing_status: 'active', trial_ends_at: '2035-12-31T00:00:00Z', subscription_tier: 'field_boss',
    }]);
    const cid = company.id;
    const report: Record<string, unknown> = { company: cid };
    const run = async (label: string, fn: () => Promise<number>) => { try { report[label] = await fn(); } catch (e) { report[label] = 'ERR: ' + (e as Error).message; } };

    let employees: any[] = [];
    await run('employees', async () => {
      employees = await ins('employees', [
        { name: 'Mike Sullivan', email: EMAIL, role: 'Owner', user_role: 'Admin', is_admin: true, has_hr_access: true, active: true, phone: '(303) 555-0142', annual_salary: 145000, hourly_rate: null, business_unit: 'Commercial', hire_date: '2019-03-01' },
        { name: 'Sarah Chen', email: 'sarah@summitfieldco.com', role: 'Office', user_role: 'Admin', is_admin: true, has_hr_access: true, active: true, phone: '(303) 555-0187', annual_salary: 68000, hourly_rate: null, business_unit: 'Commercial', hire_date: '2020-06-15' },
        { name: 'Carlos Rivera', email: 'carlos@summitfieldco.com', role: 'Field Tech', user_role: 'Team Lead', is_admin: false, has_hr_access: false, active: true, phone: '(303) 555-0203', annual_salary: null, hourly_rate: 38, business_unit: 'Commercial', hire_date: '2021-01-11' },
        { name: 'Tyler Brooks', email: 'tyler@summitfieldco.com', role: 'Field Tech', user_role: 'User', is_admin: false, has_hr_access: false, active: true, phone: '(303) 555-0219', annual_salary: null, hourly_rate: 29, business_unit: 'Commercial', hire_date: '2023-05-02' },
        { name: 'Jordan Lee', email: 'jordan@summitfieldco.com', role: 'Sales', user_role: 'User', is_admin: false, has_hr_access: false, active: true, phone: '(303) 555-0244', annual_salary: null, hourly_rate: 26, business_unit: 'Commercial', hire_date: '2022-09-19' },
      ].map((e) => ({ company_id: cid, ...e })));
      return employees.length;
    });
    const empId = (n: string) => employees.find((e) => e.name === n)?.id || null;
    const carlos = empId('Carlos Rivera'), tyler = empId('Tyler Brooks'), jordan = empId('Jordan Lee');

    let customers: any[] = [];
    await run('customers', async () => {
      const list: [string, string, string, number][] = [
        ['Rocky Mountain Self Storage', 'ops@rmstorage.com', '3400 Brighton Blvd, Denver, CO 80216', 1],
        ['Front Range Auto Group', 'facilities@frautogroup.com', '9001 W Colfax Ave, Lakewood, CO 80215', 1],
        ['Mile High Fitness', 'gm@milehighfit.com', '1290 S Broadway, Denver, CO 80210', 1],
        ['Cherry Creek Dental', 'office@cherrycreekdental.com', '255 Detroit St, Denver, CO 80206', 1],
        ['Aspen Grove Apartments', 'manager@aspengroveapts.com', '7150 E Hampden Ave, Denver, CO 80224', 1],
        ['Highlands Brewery', 'taproom@highlandsbrew.co', '2801 Walnut St, Denver, CO 80205', 1],
        ['Summit Medical Plaza', 'facilities@summitmed.com', '400 S Colorado Blvd, Denver, CO 80246', 1],
        ['Confluence Retail Park', 'pm@confluenceretail.com', '1750 15th St, Denver, CO 80202', 1],
        ['Alpine Cold Storage', 'warehouse@alpinecold.com', '5600 Franklin St, Denver, CO 80216', 1],
        ['Boulder Innovation Labs', 'ops@boulderinnov.com', '2695 Pearl St, Boulder, CO 80302', 1],
        ['Westside Auto Wash', 'owner@westsidewash.com', '4400 Wadsworth Blvd, Wheat Ridge, CO 80033', 1],
        ['Green Valley HOA', 'board@greenvalleyhoa.org', '12000 E Girard Ave, Aurora, CO 80014', 1],
        ['Robert Hayes', 'r.hayes@gmail.com', '1442 Cook St, Denver, CO 80206', 0],
        ['Linda Park', 'lindapark@outlook.com', '3310 W 32nd Ave, Denver, CO 80211', 0],
        ['James Whitfield', 'jwhitfield@gmail.com', '885 S Gaylord St, Denver, CO 80209', 0],
        ['Maria Delgado', 'mdelgado@yahoo.com', '2201 Federal Blvd, Denver, CO 80211', 0],
      ];
      customers = await ins('customers', list.map(([name, cemail, address, comm], i) => ({
        company_id: cid, name, email: cemail, address, phone: `(303) 555-0${300 + i}`,
        business_name: comm ? name : null, status: 'Active', salesperson_id: jordan, marketing_opt_in: true, tags: comm ? ['Commercial'] : ['Residential'],
      })));
      return customers.length;
    });
    const cust = (i: number) => customers[i]?.id || null;

    await run('products_services', async () => (await ins('products_services', [
      ['LED High Bay 150W', 'Product', 129, 68, 'High-output LED high bay for warehouses'],
      ['LED Panel 2x4 40W', 'Product', 78, 39, 'Recessed troffer panel'],
      ['LED Tube T8 4ft', 'Product', 11.5, 5.25, 'Direct-wire LED tube'],
      ['Occupancy Sensor', 'Product', 42, 19, 'Ceiling-mount dual-tech sensor'],
      ['Exterior Wall Pack 80W', 'Product', 164, 82, 'Dusk-to-dawn LED wall pack'],
      ['Emergency Exit Sign', 'Product', 38, 17, 'LED exit sign with battery backup'],
      ['Standard Installation', 'Service', 95, 44, 'Per-fixture install labor'],
      ['Complex Installation', 'Service', 165, 78, 'Lift-required or high-ceiling install'],
      ['Lighting Audit', 'Service', 350, 120, 'On-site fixture audit + rebate proposal'],
      ['Quarterly Maintenance', 'Service', 240, 90, 'Scheduled preventive maintenance visit'],
      ['Panel Upgrade', 'Service', 1850, 900, 'Electrical panel upgrade'],
      ['Emergency Service Call', 'Service', 185, 70, 'After-hours diagnostic + repair'],
    ].map(([name, type, unit_price, cost, description]: any) => ({ company_id: cid, name, type, unit_price, cost, description, taxable: type === 'Product', active: true, allotted_time_hours: type === 'Service' ? 1.5 : 0.4, business_unit: 'Commercial' })))).length);

    await run('leads', async () => (await ins('leads', [
      ['Parkside Office Tower', 'facilities@parksideoffice.com', 'Lighting Retrofit', 'Website', 'New', 0],
      ['Northfield Shopping Center', 'pm@northfieldshops.com', 'Lighting Retrofit', 'Referral', 'Contacted', 8500],
      ['Denver Union Storage', 'ops@denverunionstore.com', 'LED Retrofit + Rebate', 'Cold Call', 'Qualified', 22400],
      ['Riverside Apartments', 'manager@riversideapts.com', 'Exterior Lighting', 'Website', 'Appointment Set', 0],
      ['TechFlow Data Center', 'facilities@techflow.io', 'High Bay Retrofit', 'Marketing', 'Quote Sent', 41200],
      ['Cedar Point Church', 'admin@cedarpointchurch.org', 'Interior Lighting', 'Referral', 'Quote Sent', 12750],
      ['Metro Fitness Club', 'gm@metrofit.com', 'Full Facility Retrofit', 'Trade Show', 'Negotiation', 33900],
      ['Sunset Car Wash', 'owner@sunsetwash.com', 'Sign + Canopy Lighting', 'Website', 'Won', 9600],
      ['Old Town Diner', 'oldtowndiner@gmail.com', 'Kitchen Lighting', 'Cold Call', 'Lost', 0],
      ['Foothills Business Park', 'pm@foothillspark.com', 'Parking Lot Lighting', 'Referral', 'New', 0],
    ].map(([customer_name, lemail, service_type, lead_source, status, quote_amount]: any, i: number) => ({
      company_id: cid, customer_name, business_name: customer_name, email: lemail, phone: `(720) 555-0${100 + i}`, address: 'Denver, CO',
      service_type, lead_source, status, salesperson_id: jordan, setter_id: jordan, quote_amount: quote_amount || null, business_unit: 'Commercial',
    })))).length);

    await run('fleet', async () => (await ins('fleet', [
      ['TRK-01', 'Vehicle', '2022 Ford F-250', 'Available', 41200, 52000, '2022-04-10', 'Ford', 'F-250', 2022, 'pickup', 'miles', 22000],
      ['TRK-02', 'Vehicle', '2019 Ram 2500', 'In Use', 118400, 41000, '2019-08-01', 'Ram', '2500', 2019, 'pickup', 'miles', 15500],
      ['VAN-01', 'Vehicle', '2021 Mercedes Sprinter', 'In Use', 74300, 46500, '2021-02-20', 'Mercedes', 'Sprinter', 2021, 'van', 'miles', 20000],
      ['TRK-03', 'Vehicle', '2015 Ford F-150', 'Available', 162800, 16500, '2015-06-15', 'Ford', 'F-150', 2015, 'pickup', 'miles', 7000],
      ['EQ-01', 'Equipment', 'Genie Scissor Lift GS-1930', 'Available', 2140, 11800, '2020-09-01', 'Genie', 'GS-1930', 2020, 'scissor_lift', 'hours', 4500],
      ['EQ-02', 'Equipment', 'JLG Boom Lift 450AJ', 'Rented', 3820, 34500, '2018-05-10', 'JLG', '450AJ', 2018, 'boom_lift', 'hours', 12000],
    ].map(([asset_id, type, name, status, mileage_hours, purchase_price, purchase_date, make, model, model_year, asset_class, meter_basis, salvage_value]: any) => ({
      company_id: cid, asset_id, type, name, status, mileage_hours, purchase_price, purchase_date, make, model, model_year, asset_class, meter_basis, salvage_value, business_unit: 'Commercial', last_pm_date: dstr(-40), next_pm_due: dstr(20),
    })))).length);

    await run('inventory', async () => (await ins('inventory', [
      { name: 'LED High Bay 150W', barcode: 'LED-HB-150', quantity: 62, min_quantity: 20, location: 'Warehouse A' },
      { name: 'LED Panel 2x4 40W', barcode: 'LED-PNL-24', quantity: 140, min_quantity: 40, location: 'Warehouse A' },
      { name: 'LED Tube T8 4ft', barcode: 'LED-T8-4', quantity: 380, min_quantity: 100, location: 'Warehouse A' },
      { name: 'Occupancy Sensor', barcode: 'SENS-OCC', quantity: 18, min_quantity: 25, location: 'Warehouse B' },
      { name: 'Exterior Wall Pack 80W', barcode: 'WP-80', quantity: 34, min_quantity: 15, location: 'Warehouse B' },
    ].map((r) => ({ company_id: cid, ...r })))).length);

    let jobs: any[] = [];
    await run('jobs', async () => {
      const J: [string, number, string, number, number, string, any][] = [
        ['Warehouse LED Retrofit — Phase 1', 0, 'Completed', -38, 24800, 'Invoiced', carlos],
        ['Showroom Lighting Upgrade', 1, 'Completed', -31, 11400, 'Invoiced', carlos],
        ['Gym Interior Retrofit', 2, 'Completed', -24, 18650, 'Invoiced', tyler],
        ['Office Panel Replacement', 3, 'Completed', -19, 4200, 'Invoiced', carlos],
        ['Parking Lot Wall Packs', 4, 'Completed', -14, 9750, 'Invoiced', tyler],
        ['Taproom Accent Lighting', 5, 'Completed', -9, 6300, 'Invoiced', carlos],
        ['Medical Plaza Exit Signs', 6, 'In Progress', -3, 3850, 'Not Invoiced', tyler],
        ['Retail Park High Bay Swap', 7, 'In Progress', -1, 21200, 'Not Invoiced', carlos],
        ['Cold Storage Fixture Repair', 8, 'In Progress', 0, 1650, 'Not Invoiced', tyler],
        ['Innovation Lab Sensor Install', 9, 'Scheduled', 2, 5400, 'Not Invoiced', carlos],
        ['Auto Wash Canopy Lighting', 10, 'Scheduled', 4, 7900, 'Not Invoiced', tyler],
        ['HOA Common-Area Lighting', 11, 'Scheduled', 6, 13200, 'Not Invoiced', carlos],
        ['Residential Panel Upgrade', 12, 'Scheduled', 7, 2100, 'Not Invoiced', tyler],
        ['Emergency Service — Breaker', 13, 'Completed', -6, 420, 'Invoiced', carlos],
        ['Quarterly Maintenance Visit', 1, 'Scheduled', 10, 240, 'Not Invoiced', tyler],
        ['Exterior Sign Repair', 14, 'Completed', -2, 680, 'Pending', tyler],
        ['Warehouse LED Retrofit — Phase 2', 0, 'Scheduled', 12, 19600, 'Not Invoiced', carlos],
        ['After-Hours Diagnostic', 15, 'Completed', -5, 185, 'Invoiced', carlos],
      ];
      jobs = await ins('jobs', J.map(([job_title, ci, status, off, total, invoice_status, tech]) => ({
        company_id: cid, job_title, customer_id: cust(ci), customer_name: customers[ci]?.name, address: customers[ci]?.address, status,
        start_date: dstr(off), end_date: status === 'Completed' ? dstr(off + 1) : null, completed_at: status === 'Completed' ? tstr(off + 1) : null,
        job_total: total, invoice_status, assigned_team: [tech].filter(Boolean), service_type: 'Lighting Retrofit', business_unit: 'Commercial', salesperson_id: jordan,
        allotted_time_hours: Math.max(1, Math.round(total / 900)), time_tracked: status === 'Completed' ? Math.max(1, Math.round(total / 1000)) : 0,
      })));
      return jobs.length;
    });
    const job = (i: number) => jobs[i]?.id || null;

    await run('quotes', async () => (await ins('quotes', [
      [2, 'TechFlow High Bay Retrofit', 41200, 'Sent', -6], [5, 'Cedar Point Interior Lighting', 12750, 'Sent', -4],
      [6, 'Metro Fitness Full Retrofit', 33900, 'Sent', -2], [7, 'Sunset Car Wash Canopy', 9600, 'Approved', -8],
      [0, 'Warehouse Phase 2 Proposal', 19600, 'Sent', -1], [11, 'HOA Common-Area Lighting', 13200, 'Approved', -5],
    ].map(([ci, job_title, quote_amount, status, off]: any) => ({
      company_id: cid, customer_id: cust(ci), job_title, quote_amount, job_total: quote_amount, status, sent_date: dstr(off),
      service_type: 'Lighting Retrofit', business_unit: 'Commercial', salesperson_id: jordan, expiration_date: dstr(off + 30),
    })))).length);

    let invoices: any[] = [];
    await run('invoices', async () => {
      const I: [number | null, number, number, string, number, number][] = [
        [0, 0, 24800, 'Paid', -36, -21], [1, 1, 11400, 'Paid', -29, -14], [2, 2, 18650, 'Partially Paid', -22, -7],
        [3, 3, 4200, 'Paid', -17, -2], [4, 4, 9750, 'Pending', -12, -1], [5, 5, 6300, 'Pending', -7, 8],
        [13, 13, 420, 'Paid', -6, 9], [17, 15, 185, 'Paid', -5, 10], [2, 6, 3850, 'Pending', -2, 28],
        [null, 8, 1650, 'Pending', -1, 29], [1, 1, 240, 'Pending', -3, 12], [null, 10, 2400, 'Partially Paid', -9, 5],
      ];
      invoices = await ins('invoices', I.map(([ji, ci, amount, payment_status, off, due]) => ({
        company_id: cid, customer_id: cust(ci), job_id: ji != null ? job(ji) : null, amount, payment_status, invoice_type: 'standard',
        invoice_date: dstr(off), due_date: dstr(due), job_description: (ji != null ? jobs[ji]?.job_title : null) || 'Service invoice',
        business_unit: 'Commercial', payment_method: payment_status === 'Paid' ? 'Credit Card' : null,
      })));
      return invoices.length;
    });
    await run('payments', async () => {
      const methods = ['Credit Card', 'ACH Transfer', 'Check'];
      const pays: any[] = [];
      invoices.forEach((inv, k) => {
        if (inv.payment_status === 'Paid') pays.push({ company_id: cid, invoice_id: inv.id, customer_id: inv.customer_id, amount: inv.amount, date: inv.invoice_date, method: methods[k % 3], status: 'Paid' });
        else if (inv.payment_status === 'Partially Paid') pays.push({ company_id: cid, invoice_id: inv.id, customer_id: inv.customer_id, amount: money(inv.amount * 0.5), date: inv.invoice_date, method: methods[k % 3], status: 'Paid' });
      });
      return (await ins('payments', pays)).length;
    });

    await run('time_clock', async () => {
      const rows: any[] = [];
      for (let d = 1; d <= 5; d++) for (const [emp, h] of [[carlos, 8.5], [tyler, 8]] as [any, number][]) {
        if (!emp) continue;
        rows.push({ company_id: cid, employee_id: emp, clock_in: tstr(-d).replace(/T.*/, 'T14:00:00Z'), clock_out: tstr(-d).replace(/T.*/, `T${(14 + Math.round(h)).toString().padStart(2, '0')}:30:00Z`), total_hours: h });
      }
      return (await ins('time_clock', rows)).length;
    });

    await run('expenses', async () => (await ins('expenses', [
      ['Fixture order — LED high bays', 8400, 'Materials', -20], ['Fuel — fleet', 640, 'Fuel', -12], ['Genie lift rental', 1200, 'Equipment', -18],
      ['Warehouse supplies', 380, 'Supplies', -8], ['Vehicle maintenance — TRK-02', 920, 'Vehicle', -15], ['Trade show booth', 2100, 'Marketing', -30],
    ].map(([description, amount, category, off]: any) => ({ company_id: cid, description, amount, category, date: dstr(off), status: 'Approved', business_unit: 'Commercial' })))).length);

    await run('settings', async () => (await ins('settings', [
      ['business_units', JSON.stringify(['Commercial', 'Residential'])],
      ['lead_sources', JSON.stringify(['Website', 'Referral', 'Cold Call', 'Marketing', 'Trade Show'])],
      ['service_types', JSON.stringify(['Lighting Retrofit', 'LED Retrofit + Rebate', 'Exterior Lighting', 'Panel Upgrade', 'Maintenance', 'Emergency Service'])],
      ['default_labor_warranty_months', JSON.stringify(12)],
      ['default_parts_warranty_months', JSON.stringify(60)],
      ['accounting_basis', JSON.stringify('cash')],
    ].map(([key, value]: any) => ({ company_id: cid, key, value })))).length);

    return json({ ok: true, message: `Demo reset — Summit Field Co (company ${cid})`, login: `${EMAIL} / ${PASSWORD}`, report });
  } catch (e) {
    console.error('reset-demo error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
