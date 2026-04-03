import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { email, password, companyName, inviteCode } = await req.json();

    if (!email || !password || !companyName || !inviteCode) {
      return new Response(JSON.stringify({ error: 'All fields are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Validate invite code
    const { data: code, error: codeError } = await supabase
      .from('beta_invite_codes')
      .select('*')
      .eq('code', inviteCode.trim().toUpperCase())
      .single();

    if (codeError || !code) {
      return new Response(JSON.stringify({ error: 'Invalid invite code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (code.times_used >= code.max_uses) {
      return new Response(JSON.stringify({ error: 'This invite code has reached its usage limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (code.expires_at && new Date(code.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This invite code has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        company_name: companyName,
        owner_email: email,
        setup_complete: false
      })
      .select()
      .single();

    if (companyError) {
      // Clean up auth user on failure
      await supabase.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ error: 'Failed to create company: ' + companyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Create employee record (Owner)
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .insert({
        company_id: company.id,
        name: email.split('@')[0],
        email: email,
        role: 'Owner',
        user_role: 'Admin',
        active: true
      })
      .select()
      .single();

    if (empError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      await supabase.from('companies').delete().eq('id', company.id);
      return new Response(JSON.stringify({ error: 'Failed to create employee: ' + empError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Increment times_used on invite code
    await supabase
      .from('beta_invite_codes')
      .update({ times_used: code.times_used + 1 })
      .eq('id', code.id);

    // 6. Seed sample data
    try {
      await seedSampleData(supabase, company.id, email);
    } catch (seedErr) {
      console.error('Seed data error (non-fatal):', seedErr);
    }

    return new Response(JSON.stringify({
      success: true,
      companyId: company.id,
      employeeId: employee.id
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function seedSampleData(supabase: any, companyId: number, ownerEmail: string) {
  // Check if data already exists
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('company_id', companyId)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Sample Customers
  const customers = [
    { name: 'John Smith', business_name: 'Smith Manufacturing', email: 'john@smithmfg.com', phone: '555-0101', address: '123 Industrial Ave, Denver, CO 80202', status: 'Active' },
    { name: 'Mary Johnson', business_name: 'Johnson Retail', email: 'mary@johnsonretail.com', phone: '555-0102', address: '456 Main St, Boulder, CO 80301', status: 'Active' },
    { name: 'Bob Williams', business_name: 'Williams Auto', email: 'bob@williamsauto.com', phone: '555-0103', address: '789 Auto Dr, Aurora, CO 80010', status: 'Active' },
    { name: 'Patricia Brown', business_name: 'Brown Office Park', email: 'pat@brownoffice.com', phone: '555-0104', address: '321 Corporate Blvd, Lakewood, CO 80401', status: 'Active' },
    { name: 'James Davis', business_name: 'Davis Warehouse', email: 'james@daviswarehouse.com', phone: '555-0105', address: '654 Storage Ln, Commerce City, CO 80022', status: 'Active' },
    { name: 'Jennifer Miller', business_name: 'Miller Restaurant Group', email: 'jen@millergroup.com', phone: '555-0106', address: '987 Food Court, Denver, CO 80203', status: 'Active' },
    { name: 'Michael Wilson', business_name: 'Wilson Construction', email: 'mike@wilsonconst.com', phone: '555-0107', address: '147 Builder Rd, Arvada, CO 80002', status: 'Active' },
    { name: 'Linda Moore', business_name: 'Moore Medical', email: 'linda@mooremedical.com', phone: '555-0108', address: '258 Health Way, Centennial, CO 80112', status: 'Active' },
    { name: 'David Taylor', business_name: 'Taylor Logistics', email: 'david@taylorlog.com', phone: '555-0109', address: '369 Shipping Blvd, Brighton, CO 80601', status: 'Active' },
    { name: 'Susan Anderson', business_name: 'Anderson Retail', email: 'susan@andersonretail.com', phone: '555-0110', address: '741 Shop St, Westminster, CO 80030', status: 'Active' }
  ];

  // Sample Products/Services
  const products = [
    { name: 'LED Tube 4ft T8', type: 'Product', unit_price: 12.50, cost: 6.00, allotted_time_hours: 0.25 },
    { name: 'LED High Bay 150W', type: 'Product', unit_price: 125.00, cost: 65.00, allotted_time_hours: 0.5 },
    { name: 'LED Panel 2x4', type: 'Product', unit_price: 85.00, cost: 42.00, allotted_time_hours: 0.5 },
    { name: 'Occupancy Sensor', type: 'Product', unit_price: 45.00, cost: 22.00, allotted_time_hours: 0.25 },
    { name: 'Basic Installation', type: 'Service', unit_price: 75.00, cost: 35.00, allotted_time_hours: 1 },
    { name: 'Complex Installation', type: 'Service', unit_price: 150.00, cost: 70.00, allotted_time_hours: 2 },
    { name: 'Lighting Audit', type: 'Service', unit_price: 250.00, cost: 100.00, allotted_time_hours: 3 },
    { name: 'Maintenance Visit', type: 'Service', unit_price: 95.00, cost: 45.00, allotted_time_hours: 1 }
  ];

  // Sample Leads
  const leads = [
    { customer_name: 'ABC Corporation', business_name: 'ABC Corp', email: 'info@abccorp.com', phone: '555-0201', address: '100 Business Park, Denver, CO', service_type: 'Lighting Retrofit', lead_source: 'Website', status: 'New' },
    { customer_name: 'XYZ Industries', business_name: 'XYZ Industries', email: 'contact@xyz.com', phone: '555-0202', address: '200 Industrial Way, Aurora, CO', service_type: 'New Construction', lead_source: 'Referral', status: 'Qualified' },
    { customer_name: 'Quick Mart', business_name: 'Quick Mart LLC', email: 'owner@quickmart.com', phone: '555-0203', address: '300 Retail Rd, Boulder, CO', service_type: 'Lighting Retrofit', lead_source: 'Cold Call', status: 'Appointment Scheduled' },
    { customer_name: 'Big Box Store', business_name: 'Big Box Inc', email: 'facilities@bigbox.com', phone: '555-0204', address: '400 Commerce Dr, Lakewood, CO', service_type: 'Lighting Retrofit', lead_source: 'Marketing', status: 'Qualified' },
    { customer_name: 'Tech Startup', business_name: 'TechStart Inc', email: 'ceo@techstart.com', phone: '555-0205', address: '500 Innovation Ln, Denver, CO', service_type: 'Office Lighting', lead_source: 'Website', status: 'New' }
  ];

  // Sample Fleet
  const fleet = [
    { asset_id: 'TRK-001', name: 'Ford F-150 #1', type: 'Vehicle', status: 'Available', mileage_hours: 45000, last_pm_date: '2026-01-01', next_pm_due: '2026-04-01' },
    { asset_id: 'TRK-002', name: 'Ford F-150 #2', type: 'Vehicle', status: 'In Use', mileage_hours: 62000, last_pm_date: '2025-12-15', next_pm_due: '2026-03-15' },
    { asset_id: 'VAN-001', name: 'Sprinter Van', type: 'Vehicle', status: 'Available', mileage_hours: 28000, last_pm_date: '2026-01-10', next_pm_due: '2026-04-10' }
  ];

  // Sample Inventory
  const inventory = [
    { name: 'LED Tube 4ft T8', sku: 'LED-T8-4FT', quantity: 250, min_quantity: 50, location: 'Warehouse A', unit_cost: 6.00 },
    { name: 'LED High Bay 150W', sku: 'LED-HB-150', quantity: 45, min_quantity: 20, location: 'Warehouse A', unit_cost: 65.00 },
    { name: 'LED Panel 2x4', sku: 'LED-PNL-2X4', quantity: 80, min_quantity: 25, location: 'Warehouse A', unit_cost: 42.00 },
    { name: 'Occupancy Sensor', sku: 'SENS-OCC-01', quantity: 120, min_quantity: 30, location: 'Warehouse B', unit_cost: 22.00 }
  ];

  // Insert all data
  const { data: insertedCustomers } = await supabase
    .from('customers')
    .insert(customers.map((c: any) => ({ ...c, company_id: companyId })))
    .select();

  await supabase
    .from('products_services')
    .insert(products.map((p: any) => ({ ...p, company_id: companyId, active: true, taxable: true })));

  await supabase
    .from('leads')
    .insert(leads.map((l: any) => ({ ...l, company_id: companyId })));

  await supabase
    .from('fleet')
    .insert(fleet.map((f: any) => ({ ...f, company_id: companyId })));

  await supabase
    .from('inventory')
    .insert(inventory.map((i: any) => ({ ...i, company_id: companyId })));

  // Create sample jobs if we have customers
  if (insertedCustomers && insertedCustomers.length >= 3) {
    const now = new Date();
    const jobs = [
      {
        job_id: 'JOB-001',
        job_title: 'Warehouse LED Retrofit',
        customer_id: insertedCustomers[0].id,
        status: 'In Progress',
        start_date: now.toISOString().split('T')[0],
        job_total: 12500.00,
        time_allotted_hours: 40,
        time_tracked_hours: 16
      },
      {
        job_id: 'JOB-002',
        job_title: 'Office Lighting Upgrade',
        customer_id: insertedCustomers[1].id,
        status: 'Scheduled',
        start_date: new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0],
        job_total: 4800.00,
        time_allotted_hours: 16
      },
      {
        job_id: 'JOB-003',
        job_title: 'Parking Lot LED Conversion',
        customer_id: insertedCustomers[2].id,
        status: 'Completed',
        start_date: new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0],
        end_date: new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0],
        job_total: 8200.00,
        time_allotted_hours: 24,
        time_tracked_hours: 22
      }
    ];

    await supabase
      .from('jobs')
      .insert(jobs.map((j: any) => ({ ...j, company_id: companyId })));
  }

  // Add settings
  const settingsData = [
    { key: 'business_units', value: JSON.stringify(['Commercial', 'Industrial', 'Residential', 'Government']) },
    { key: 'lead_sources', value: JSON.stringify(['Website', 'Referral', 'Cold Call', 'Marketing', 'Trade Show', 'Other']) },
    { key: 'service_types', value: JSON.stringify(['Lighting Retrofit', 'New Construction', 'Maintenance', 'Emergency Service', 'Audit']) }
  ];

  for (const setting of settingsData) {
    await supabase.from('settings').upsert(
      { ...setting, company_id: companyId },
      { onConflict: 'company_id,key' }
    );
  }
}
